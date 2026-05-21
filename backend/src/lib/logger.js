/**
 * Centralised logger — built on pino.
 *
 * Configuration (environment variables):
 *   LOG_LEVEL    — error | warn | info | debug | trace   (default: info in prod, debug in dev)
 *   LOG_ENABLED  — true | false                          (default: true)
 *   LOG_PRETTY   — true | false                          (default: true in dev, false in prod)
 */

'use strict';

const pino = require('pino');

const IS_PROD    = process.env.NODE_ENV === 'production';
const ENABLED    = process.env.LOG_ENABLED  !== 'false';
const LOG_LEVEL  = process.env.LOG_LEVEL    || (IS_PROD ? 'info' : 'debug');
const USE_PRETTY = process.env.LOG_PRETTY   !== undefined
  ? process.env.LOG_PRETTY === 'true'
  : !IS_PROD;

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
    // pino-pretty not installed — warn the operator so silent JSON fallback
    // doesn't look like a misconfiguration.
    // eslint-disable-next-line no-console
    console.warn('[logger] LOG_PRETTY requested but pino-pretty is not installed — falling back to JSON.');
  }
}

const logger = pino({
  enabled: ENABLED,
  level:   LOG_LEVEL,
  base:    { service: 'pdv-backend' },

  // Scrub sensitive fields wherever they appear in log objects.
  // Includes request-body paths in case a future change starts logging req.body
  // (the default pino-http serialiser does not, but custom code might).
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-pdv-stepup"]',
      'req.body.password',
      'req.body.newPassword',
      'req.body.currentPassword',
      'req.body.totpToken',
      'req.body.refreshToken',
      'req.body.clientSecret',
      'req.body.client_secret',
      'req.body.pin',
      '*.password',
      '*.passwordHash',
      '*.password_hash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.refresh_token',
      '*.stepUpToken',
      '*.secret',
      '*.clientSecret',
      '*.client_secret',
      '*.cardNumber',
      '*.card_number',
      '*.totpSecret',
      '*.totp_secret',
      '*.dek',
      '*.kek',
    ],
    censor: '[REDACTED]',
  },

  ...(transport ? { transport } : {}),
});

module.exports = logger;
