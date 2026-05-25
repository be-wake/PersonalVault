'use strict';

/**
 * Short-lived step-up tokens for sensitive operations.
 *
 * After re-authenticating (password re-entry today; biometric/TOTP later),
 * the server issues a 5-min token bound to a specific intent hash. The client
 * presents it in X-PDV-Stepup so a "grant" token can't be replayed on "revoke".
 */

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../lib/logger');

const log     = logger.child({ module: 'stepup' });
const IS_PROD = process.env.NODE_ENV === 'production';

const TTL = process.env.STEPUP_TOKEN_TTL || '5m';

// Wired into routes but only enforced when STEPUP_ENFORCED=true, so the feature
// can ship before all clients send the X-PDV-Stepup header.
const ENFORCED = process.env.STEPUP_ENFORCED === 'true';

function loadSecret() {
  const value = process.env.STEPUP_SECRET;
  if (value && value.length >= 16 && !/change-me/i.test(value)) return value;
  if (IS_PROD) {
    log.fatal('STEPUP_SECRET missing/weak — refusing to start in production');
    process.exit(1);
  }
  log.warn('STEPUP_SECRET not set — using ephemeral dev secret');
  return crypto.randomBytes(48).toString('base64');
}

const STEPUP_SECRET = loadSecret();

function intentHash(intent) {
  return crypto.createHash('sha256').update(intent).digest('hex').slice(0, 24);
}

function issueStepUpToken(userId, intent, factor) {
  return jwt.sign(
    { sub: userId, intent: intentHash(intent), factor, type: 'stepup' },
    STEPUP_SECRET,
    { expiresIn: TTL }
  );
}

function requireStepUp(intent) {
  const wanted = intentHash(intent);
  return (req, res, next) => {
    if (!ENFORCED) return next();

    const header = req.headers['x-pdv-stepup'];
    if (!header) {
      return res.status(401).json({
        error: {
          code:      'STEPUP_REQUIRED',
          message:   'This action requires a recent re-authentication.',
          intent,
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
    try {
      const payload = jwt.verify(header, STEPUP_SECRET);
      if (payload.type !== 'stepup' || payload.sub !== req.user?.sub || payload.intent !== wanted) {
        throw new Error('Step-up token mismatch');
      }
      req.stepUp = payload;
      return next();
    } catch (err) {
      (req.log ?? log).warn({ requestId: req.id, reason: err.message }, 'Step-up token rejected');
      return res.status(401).json({
        error: {
          code:      'STEPUP_INVALID',
          message:   'Step-up token is invalid or expired.',
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
}

module.exports = { issueStepUpToken, requireStepUp };
