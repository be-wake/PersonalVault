/**
 * HTTP request / response logger middleware (pino-http).
 *
 * Attaches req.log — a per-request child logger that carries the requestId
 * and authenticated userId so every log line in a route is automatically
 * correlated.
 *
 * Log levels by response status:
 *   5xx → error
 *   4xx → warn
 *   health check → silent (trace)
 *   everything else → debug
 */

'use strict';

const pinoHttp = require('pino-http');
const logger   = require('../lib/logger');

module.exports = pinoHttp({
  logger,

  // Reuse the uuid already attached by server.js
  genReqId: (req) => req.id,

  // Suppress noisy health-check polling
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },

  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400)        return 'warn';
    return 'debug';
  },

  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} → ${res.statusCode}`,

  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} → ${res.statusCode} (${err.message})`,

  // Enrich each request log with the authenticated user when available
  customProps: (req) => ({
    requestId: req.id,
    userId:    req.user?.sub ?? null,
  }),

  serializers: {
    req: (req) => ({
      id:        req.id,
      method:    req.method,
      url:       req.url,
      userAgent: req.headers?.['user-agent']?.slice(0, 120),
      // authorization is redacted globally by the root logger's `redact` config
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});
