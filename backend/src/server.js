const express = require('express');
const cors = require('cors');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { attachWebSocket } = require('./ws');

const app = express();
const server = http.createServer(app);

// ── Middleware ────────────────────────────────────────────────────────────────
// Allow extra origins from env (e.g. Azure frontend URL)
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

// Attach request ID
app.use((req, _res, next) => {
  req.id = uuidv4();
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth', require('./routes/auth'));
app.use('/v1/consents', require('./routes/consents'));
app.use('/v1', require('./routes/vault'));
app.use('/v1/audit', require('./routes/audit'));
app.use('/v1/relying-parties', require('./routes/relyingParties'));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      requestId: req.id,
      timestamp: new Date().toISOString()
    }
  });
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
attachWebSocket(server);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`PDV backend running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/v1/ws?token=<jwt>`);
});
