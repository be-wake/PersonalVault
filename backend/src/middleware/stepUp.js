'use strict';

/**
 * Step-up authentication tokens.
 *
 * After a user satisfies a second factor (PIN, biometric, or TOTP), the
 * server issues a short-lived (default 5 min) signed token that the client
 * presents in `X-PDV-Stepup` for the next sensitive operation
 * (consent grant, consent revoke, payment card add, account delete, etc.).
 *
 * Tokens are scoped to a single user-id and bound to a hash of the request
 * intent (the route name) so a step-up for "grant" can't be replayed against
 * a "delete-account" call.
 */

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../lib/logger');

const log     = logger.child({ module: 'stepup' });
const IS_PROD = process.env.NODE_ENV === 'production';

const TTL = process.env.STEPUP_TOKEN_TTL || '5m';

// Step-up is wired into sensitive routes but only ENFORCED when this flag is on.
// Lets the backend ship the capability ahead of clients learning to send the
// X-PDV-Stepup header (S2 / F19). Flip to 'true' once web + mobile fetch a
// step-up token before sensitive actions.
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

/**
 * Express middleware factory. Use as:
 *   router.post('/sensitive', requireStepUp('consent:grant'), handler);
 */
function requireStepUp(intent) {
  const wanted = intentHash(intent);
  return (req, res, next) => {
    // Wired but disabled until STEPUP_ENFORCED=true so we don't break clients
    // that don't yet send the header.
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
