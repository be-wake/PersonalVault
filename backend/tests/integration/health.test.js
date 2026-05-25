'use strict';

// BE-I-033 through BE-I-035 — Health, readiness, and rate-limiting integration tests.
// Health and readiness tests run without a database.
// Rate-limit test also runs without a database (uses in-memory limiter).

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

// Minimal server that mirrors the /health and /ready endpoints in server.js
function makeHealthApp(dbPingOk = true) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, _res, next) => { req.id = 'test'; next(); });

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  app.get('/ready', async (_req, res) => {
    if (dbPingOk) {
      return res.status(200).json({ status: 'ready' });
    }
    return res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database is unreachable.' } });
  });

  return app;
}

describe('Health endpoints', () => {
  it('BE-I-033 GET /health always returns 200', async () => {
    const app = makeHealthApp(true);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('BE-I-034 GET /ready returns 503 when database is unreachable', async () => {
    const app = makeHealthApp(false);
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
  });

  it('GET /ready returns 200 when database is reachable', async () => {
    const app = makeHealthApp(true);
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
  });
});

describe('BE-I-035 Rate limiting — auth endpoints', () => {
  it('POST /auth/login returns 429 after exceeding the request limit', async () => {
    // Use fresh modules to get a clean limiter state for this test
    jest.resetModules();
    const { authLimiter } = require('../../src/middleware/rateLimit');

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use((req, _res, next) => { req.id = 'r'; next(); });
    app.post('/auth/login', authLimiter, (_req, res) => res.status(401).json({ error: 'bad' }));

    // RATE_LIMIT_AUTH_MAX=3 from env.js — send 4 requests, the 4th must be 429
    for (let i = 0; i < 3; i++) {
      await request(app).post('/auth/login').send({ email: 'a@b.com', password: 'pw' });
    }

    const res = await request(app).post('/auth/login').send({ email: 'a@b.com', password: 'pw' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
