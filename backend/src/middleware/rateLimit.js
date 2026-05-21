'use strict';

/**
 * Rate limiters built on express-rate-limit.
 *
 * Three buckets:
 *   • authLimiter — strict, applied to /auth/login and /auth/register.
 *   • apiLimiter  — moderate, applied to all /v1/* endpoints.
 *   • logsLimiter — strict, applied to the mobile log-ingest endpoint.
 *
 * Defaults are overridable via env so SREs can tune in production without
 * a code deploy.
 */

const rateLimit = require('express-rate-limit');
const logger    = require('../lib/logger');

const log = logger.child({ module: 'rate-limit' });

function makeLimiter(name, defaults) {
  const windowMs = Number(process.env[`RATE_LIMIT_${name}_WINDOW_MS`]) || defaults.windowMs;
  const max      = Number(process.env[`RATE_LIMIT_${name}_MAX`])       || defaults.max;
  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    skipSuccessfulRequests: defaults.skipSuccessfulRequests || false,
    handler: (req, res /*, next, options */) => {
      (req.log ?? log).warn(
        { requestId: req.id, path: req.path, ip: req.ip, limiter: name },
        'Rate limit exceeded'
      );
      res.status(429).json({
        error: {
          code:      'RATE_LIMITED',
          message:   'Too many requests. Please slow down and try again shortly.',
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    },
  });
}

const authLimiter = makeLimiter('AUTH', { windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true });
const apiLimiter  = makeLimiter('API',  { windowMs: 60 * 1000,       max: 120 });
const logsLimiter = makeLimiter('LOGS', { windowMs: 60 * 1000,       max: 30 });

module.exports = { authLimiter, apiLimiter, logsLimiter };
