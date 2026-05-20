'use strict';

/**
 * POST /v1/logs
 *
 * Receives batched log entries from the mobile app and re-emits them
 * through the backend's pino logger so they land in the same stdout
 * stream that Azure Container Apps → Log Analytics captures.
 *
 * Each forwarded line includes source:'mobile' and the server-side
 * receipt timestamp so they're distinguishable from backend logs.
 *
 * Auth: Bearer token required — the same JWT the mobile app uses for
 * every other API call.  This prevents unauthenticated log spam.
 */

const express = require('express');
const { verifyToken } = require('../middleware/auth');
const logger = require('../lib/logger');

const log    = logger.child({ module: 'route:logs' });
const router = express.Router();

router.use(verifyToken);

const VALID_LEVELS   = new Set(['error', 'warn', 'info', 'debug']);
const MAX_ENTRIES    = 200;   // cap per request to prevent abuse
const MAX_MSG_LENGTH = 500;   // truncate runaway messages
const MAX_META_KEYS  = 20;    // limit meta object size

function sanitiseMeta(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const keys = Object.keys(raw).slice(0, MAX_META_KEYS);
  const out  = {};
  for (const k of keys) {
    const v = raw[k];
    // Only forward scalar values — no nested objects that could carry PII blobs
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

// POST /v1/logs
router.post('/', (req, res) => {
  const { entries } = req.body;
  const userId      = req.user.sub;

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: '`entries` must be a non-empty array.' },
    });
  }

  const batch    = entries.slice(0, MAX_ENTRIES);
  const received = new Date().toISOString();

  for (const entry of batch) {
    const level      = VALID_LEVELS.has(entry?.level) ? entry.level : 'info';
    const module     = typeof entry?.module === 'string' ? entry.module.slice(0, 40) : 'unknown';
    const message    = typeof entry?.message === 'string'
      ? entry.message.slice(0, MAX_MSG_LENGTH)
      : String(entry?.message ?? '').slice(0, MAX_MSG_LENGTH);
    const meta       = sanitiseMeta(entry?.meta);
    const clientTime = typeof entry?.timestamp === 'string' ? entry.timestamp : undefined;

    log[level](
      { source: 'mobile', userId, module: `mobile:${module}`, clientTime, receivedAt: received, ...meta },
      message,
    );
  }

  (req.log ?? log).debug(
    { userId, count: batch.length, dropped: entries.length - batch.length },
    'Mobile log batch ingested',
  );

  res.status(204).end();
});

module.exports = router;
