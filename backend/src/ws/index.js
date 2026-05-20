'use strict';

const { WebSocketServer } = require('ws');
const jwt    = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const logger = require('../lib/logger');

const log = logger.child({ module: 'websocket' });

// Map userId → Set of WebSocket connections
const userConnections = new Map();

function broadcastToUser(userId, payload) {
  const connections = userConnections.get(userId);
  if (!connections || connections.size === 0) return;
  const message = JSON.stringify(payload);
  let sent = 0;
  for (const ws of connections) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
      sent++;
    }
  }
  if (sent > 0) {
    log.debug({ userId, type: payload.type, recipients: sent }, 'WS broadcast sent');
  }
}

function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/v1/ws' });

  wss.on('connection', (ws, req) => {
    const url   = new URL(req.url, 'ws://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      log.warn({ ip: req.socket?.remoteAddress }, 'WS connection rejected — no token');
      ws.close(4001, 'Token required');
      return;
    }

    let userId;
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      userId = payload.sub;
    } catch (err) {
      log.warn({ ip: req.socket?.remoteAddress, reason: err.message }, 'WS connection rejected — bad token');
      ws.close(4001, 'Invalid token');
      return;
    }

    if (!userConnections.has(userId)) userConnections.set(userId, new Set());
    userConnections.get(userId).add(ws);
    const connectionCount = userConnections.get(userId).size;

    log.debug({ userId, connectionCount }, 'WS client connected');
    ws.send(JSON.stringify({ type: 'CONNECTED', userId }));

    ws.on('close', (code, reason) => {
      const set = userConnections.get(userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) userConnections.delete(userId);
      }
      log.debug({ userId, code, reason: reason?.toString(), remaining: set?.size ?? 0 }, 'WS client disconnected');
    });

    ws.on('error', (err) => {
      log.warn({ userId, err }, 'WS client error');
      const set = userConnections.get(userId);
      if (set) set.delete(ws);
    });
  });

  wss.on('error', (err) => {
    log.error({ err }, 'WebSocket server error');
  });

  log.info('WebSocket server attached');
  return wss;
}

module.exports = { attachWebSocket, broadcastToUser };
