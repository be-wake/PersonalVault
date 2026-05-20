'use strict';

const express       = require('express');
const cors          = require('cors');
const http          = require('http');
const { v4: uuidv4 } = require('uuid');
const logger        = require('./lib/logger');
const requestLogger = require('./middleware/requestLogger');
const { attachWebSocket } = require('./ws');

const log = logger.child({ module: 'server' });

const app    = express();
const server = http.createServer(app);

// ── Middleware ────────────────────────────────────────────────────────────────
const extraOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : [];

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    ...extraOrigins,
  ],
  credentials: true,
}));

app.use(express.json());

// Attach a unique request ID before the HTTP logger so it appears in every line
app.use((req, _res, next) => {
  req.id = uuidv4();
  next();
});

// HTTP request / response logging
app.use(requestLogger);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth',              require('./routes/auth'));
app.use('/v1/consents',       require('./routes/consents'));
app.use('/v1',                require('./routes/vault'));
app.use('/v1/audit',          require('./routes/audit'));
app.use('/v1/relying-parties', require('./routes/relyingParties'));
app.use('/v1/logs',           require('./routes/logs'));

// Health check (not logged — suppressed in requestLogger)
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // req.log is the per-request child created by pino-http — use it so the
  // error line is automatically correlated with the request that caused it.
  const reqLog = req.log ?? log;
  reqLog.error({ err, requestId: req.id }, 'Unhandled request error');

  res.status(500).json({
    error: {
      code:      'INTERNAL_ERROR',
      message:   'An unexpected error occurred.',
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
attachWebSocket(server);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  log.info({ port: PORT, logLevel: logger.level, nodeEnv: process.env.NODE_ENV ?? 'development' },
    'PDV backend started');
});

// Graceful shutdown
function shutdown(signal) {
  log.info({ signal }, 'Shutting down…');
  server.close(() => {
    log.info('HTTP server closed');
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Catch uncaught errors so they get logged before the process crashes
process.on('uncaughtException',  (err) => { log.fatal({ err }, 'Uncaught exception');  process.exit(1); });
process.on('unhandledRejection', (err) => { log.fatal({ err }, 'Unhandled rejection'); process.exit(1); });
