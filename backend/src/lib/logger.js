/**
 * Centralised logger — built on pino.
 *
 * Configuration (environment variables):
 *   LOG_LEVEL    — error | warn | info | debug | trace   (default: info in prod, debug in dev)
 *   LOG_ENABLED  — true | false                          (default: true)
 *   LOG_PRETTY   — true | false                          (default: true in dev, false in prod)
 *
 * Usage:
 *   const logger = require('./lib/logger');          // root logger
 *   const log    = logger.child({ module: 'auth' }); // module-scoped child
 *   log.info({ userId }, 'User registered');
 *   log.warn({ email }, 'Login failed — bad credentials');
 *   log.error({ err }, 'Unhandled exception');
 */

'use strict';

const pino = require('pino');

const IS_PROD    = process.env.NODE_ENV === 'production';
const ENABLED    = process.env.LOG_ENABLED  !== 'false';
const LOG_LEVEL  = process.env.LOG_LEVEL    || (IS_PROD ? 'info' : 'debug');
const USE_PRETTY = process.env.LOG_PRETTY   !== undefined
  ? process.env.LOG_PRETTY === 'true'
  : !IS_PROD;

// pino-pretty is a devDependency — only use it when available (not in prod Docker)
let transport;
if (USE_PRETTY) {
  try {
    require.resolve('pino-pretty');
    transport = {
      target: 'pino-pretty',
      options: {
        colorize:      true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore:        'pid,hostname,service',
        messageFormat: '{module} | {msg}',
      },
    };
  } catch {
    // pino-pretty not installed (production image) — fall back to JSON
  }
}

const logger = pino({
  enabled: ENABLED,
  level:   LOG_LEVEL,
  base:    { service: 'pdv-backend' },

  // Scrub sensitive fields wherever they appear in log objects
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.password_hash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },

  ...(transport ? { transport } : {}),
});

module.exports = logger;
