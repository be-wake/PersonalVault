const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

// Map userId → Set of WebSocket connections
const userConnections = new Map();

function broadcastToUser(userId, payload) {
  const connections = userConnections.get(userId);
  if (!connections || connections.size === 0) return;
  const message = JSON.stringify(payload);
  for (const ws of connections) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }
}

function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/v1/ws' });

  wss.on('connection', (ws, req) => {
    // Expect token as query param: /v1/ws?token=...
    const url = new URL(req.url, 'ws://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Token required');
      return;
    }

    let userId;
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      userId = payload.sub;
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    // Register connection
    if (!userConnections.has(userId)) userConnections.set(userId, new Set());
    userConnections.get(userId).add(ws);

    ws.send(JSON.stringify({ type: 'CONNECTED', userId }));

    ws.on('close', () => {
      const set = userConnections.get(userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) userConnections.delete(userId);
      }
    });

    ws.on('error', () => {
      const set = userConnections.get(userId);
      if (set) set.delete(ws);
    });
  });

  return wss;
}

module.exports = { attachWebSocket, broadcastToUser };
