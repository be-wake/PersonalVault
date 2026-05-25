'use strict';

// BE-U-018 through BE-U-019
// env.js sets RATE_LIMIT_AUTH_MAX=3 and RATE_LIMIT_API_MAX=10 so we hit limits
// fast without making hundreds of test requests.

const request    = require('supertest');
const express    = require('express');
const cookieParser = require('cookie-parser');
const { authLimiter, apiLimiter } = require('../../../src/middleware/rateLimit');

function makeTestApp(limiter) {
  const app = express();
  app.use(cookieParser());
  app.use(limiter);
  app.get('/probe', (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe('authLimiter (max=3 per env.js)', () => {
  it('BE-U-018 returns 429 after exceeding the configured max requests', async () => {
    const app = makeTestApp(authLimiter);

    // First 3 requests should pass (authLimiter skips successful 2xx, but
    // our probe returns 200 — so those are skipped and don't count).
    // Send 3 requests that return non-2xx to consume the limit.
    const failApp = express();
    failApp.use(authLimiter);
    failApp.get('/probe', (_req, res) => res.status(401).json({ error: 'bad' }));

    for (let i = 0; i < 3; i++) {
      await request(failApp).get('/probe');
    }

    // 4th request should be rate-limited
    const res = await request(failApp).get('/probe');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('apiLimiter (max=10 per env.js)', () => {
  it('BE-U-019 returns 429 after exceeding the configured max requests', async () => {
    const app = makeTestApp(apiLimiter);

    for (let i = 0; i < 10; i++) {
      await request(app).get('/probe');
    }

    const res = await request(app).get('/probe');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
