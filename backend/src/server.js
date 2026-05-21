'use strict';

const express       = require('express');
const cors          = require('cors');
const helmet        = require('helmet');
const http          = require('http');
const { v4: uuidv4 } = require('uuid');
const logger        = require('./lib/logger');
const requestLogger = require('./middleware/requestLogger');
const { authLimiter, apiLimiter, logsLimiter } = require('./middleware/rateLimit');

const log     = logger.child({ module: 'server' });
const IS_PROD = process.env.NODE_ENV === 'production';

const app    = express();
const server = http.createServer(app);

// Behind Azure Container Apps / Front Door we sit behind a reverse proxy, so
// trust one proxy hop for correct req.ip — needed by the rate limiter.
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy:    false,
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const extraOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : [];

const corsOrigins = IS_PROD
  ? extraOrigins
  : ['http://localhost:3000', 'http://localhost:3001',
     'http://127.0.0.1:3000', 'http://127.0.0.1:3001',
     ...extraOrigins];

if (IS_PROD && corsOrigins.length === 0) {
  log.warn('ALLOWED_ORIGINS is empty in production — no browser will be able to call this API.');
}

app.use(cors({ origin: corsOrigins, credentials: true }));

// Cap request body at 64 KB — vault payloads are tiny.
app.use(express.json({ limit: '64kb' }));

// Attach a unique request ID; echo back as X-Request-Id for client correlation.
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.use(requestLogger);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

// Module-level refs set inside start() so shutdown() can reach them.
let _db;

async function start() {
  // ── 1. Secrets ───────────────────────────────────────────────────────────
  // MUST run before any require() that reads process.env secrets at load time
  // (auth.js, stepUp.js, webhooks.js, ws/index.js).
  await require('./config/secrets').init();

  // ── 2. Database ───────────────────────────────────────────────────────────
  // Pool creation reads DATABASE_URL — must come after secrets.init().
  _db = require('./db');
  try {
    log.info('Initialising database…');
    await _db.init();
    log.info('Database ready');
  } catch (err) {
    log.fatal({ err }, 'Failed to initialise database — exiting');
    process.exit(1);
  }

  // ── 3. Field encryption ───────────────────────────────────────────────────
  // Loads the KEK from Key Vault or PDV_FIELD_KEK_BASE64.
  try {
    await require('./lib/crypto').init();
  } catch (err) {
    log.fatal({ err }, 'Failed to initialise field encryption — exiting');
    process.exit(1);
  }

  // ── 4. Routes ─────────────────────────────────────────────────────────────
  // Deferred require() so auth.js / stepUp.js / ws read the now-populated
  // process.env secrets rather than undefined.
  app.use('/auth',               authLimiter, require('./routes/auth'));
  app.use('/v1/consents',        apiLimiter,  require('./routes/consents'));
  app.use('/v1',                 apiLimiter,  require('./routes/vault'));
  app.use('/v1/audit',           apiLimiter,  require('./routes/audit'));
  app.use('/v1/relying-parties', apiLimiter,  require('./routes/relyingParties'));
  app.use('/v1/logs',
    express.json({ limit: '256kb' }),
    logsLimiter,
    require('./routes/logs'),
  );

  // Health check — no auth, not logged (suppressed in requestLogger).
  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', timestamp: new Date().toISOString() }),
  );

  // Global error handler — must be registered after all routes.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
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

  // ── 5. WebSocket ──────────────────────────────────────────────────────────
  // ws/index.js imports auth.js which reads JWT_SECRET — deferred for the
  // same reason as routes above.
  const { attachWebSocket } = require('./ws');
  attachWebSocket(server);

  // ── 6. Listen ─────────────────────────────────────────────────────────────
  server.listen(PORT, () => {
    log.info(
      { port: PORT, logLevel: logger.level, nodeEnv: process.env.NODE_ENV ?? 'development' },
      'PDV backend started',
    );
  });
}

start();

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 15_000;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  log.info({ signal, timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'Shutting down…');

  const forceTimer = setTimeout(() => {
    log.warn('Shutdown timed out — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  try {
    await new Promise((resolve) => server.close(resolve));
    log.info('HTTP server closed');

    // Drain connections in order: Redis → Service Bus → DB pool
    try { await require('./lib/redisClient').close();  log.info('Redis closed'); }  catch {}
    try { await require('./lib/serviceBus').close();   log.info('Service Bus closed'); } catch {}
    if (_db) { await _db.close(); log.info('DB pool closed'); }

    process.exit(0);
  } catch (err) {
    log.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException',  (err) => { log.fatal({ err }, 'Uncaught exception');  shutdown('uncaughtException').catch(() => process.exit(1)); });
process.on('unhandledRejection', (err) => { log.fatal({ err }, 'Unhandled rejection'); shutdown('unhandledRejection').catch(() => process.exit(1)); });
