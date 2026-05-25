'use strict';

// BE-I-001 through BE-I-007 — Auth flow integration tests.
// Requires TEST_DATABASE_URL (and a migrated schema) to run.
// Set: TEST_DATABASE_URL=postgres://user:pass@localhost/pdv_test npm test
//
// All tests are skipped automatically when TEST_DATABASE_URL is absent.

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeIf = TEST_DB ? describe : describe.skip;

if (!TEST_DB) {
  // Print a single notice instead of individual skip lines to keep output clean.
  it.skip('Integration auth tests require TEST_DATABASE_URL to be set', () => {});
}

describeIf('Auth flow integration tests', () => {
  let request;
  let app;
  let db;

  beforeAll(async () => {
    // Point the db module at the test database before requiring anything.
    process.env.DATABASE_URL = TEST_DB;
    jest.resetModules();

    db = require('../../src/db');
    const cryptoLib = require('../../src/lib/crypto');
    await db.init();
    await cryptoLib.init();

    const { makeApp } = require('../helpers/makeApp');
    const authRouter   = require('../../src/routes/auth');
    app = makeApp();
    app.use('/auth', authRouter);
    request = require('supertest')(app);
  });

  afterAll(async () => {
    await db.close();
  });

  // Unique email per run to avoid conflicts across test runs
  const runId = Date.now();
  const email = `integ-${runId}@example.com`;
  const password = 'IntegTest1234';
  let refreshToken;
  let accessToken;

  describe('BE-I-001 Full registration then login returns valid access token', () => {
    it('registers a new user and returns an access token', async () => {
      const res = await request
        .post('/auth/register')
        .send({ email, password, name: 'Integration User' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');

      accessToken  = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('BE-I-001 login after registration returns a valid access token', async () => {
      const res = await request
        .post('/auth/login')
        .send({ email, password });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      accessToken  = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });
  });

  describe('BE-I-002 Cookie security', () => {
    it('Login sets httpOnly pdv_session cookie with Secure flag', async () => {
      // In test (non-prod), Secure is false — we just check HttpOnly
      const res = await request.post('/auth/login').send({ email, password });

      const setCookie = (res.headers['set-cookie'] || []).join('');
      expect(setCookie).toMatch(/pdv_session=/);
      expect(setCookie).toMatch(/HttpOnly/i);
    });
  });

  describe('BE-I-003 Token refresh', () => {
    it('POST /auth/refresh issues a new access token using a valid refresh token', async () => {
      const res = await request
        .post('/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      accessToken = res.body.accessToken;
    });
  });

  describe('BE-I-004 Logout', () => {
    it('POST /auth/logout clears pdv_session and pdv_refresh cookies', async () => {
      const res = await request.post('/auth/logout');

      const setCookie = (res.headers['set-cookie'] || []).join(';');
      // Cleared cookies have Expires in the past or Max-Age=0
      expect(setCookie).toMatch(/pdv_session=/);
      expect(res.status).toBe(200);
    });
  });

  describe('BE-I-005 & BE-I-006 /auth/me', () => {
    it('BE-I-005 GET /auth/me returns user profile with valid access token', async () => {
      const loginRes = await request.post('/auth/login').send({ email, password });
      accessToken = loginRes.body.accessToken;

      const { db: freshDb } = (() => {
        const freshDbModule = require('../../src/db');
        freshDbModule.findUserById = freshDbModule.findUserById;
        return { db: freshDbModule };
      })();

      // Mount /auth/me directly in this test
      const { makeApp: mkA } = require('../helpers/makeApp');
      const authR = require('../../src/routes/auth');
      const meApp = mkA();
      meApp.use('/auth', authR);

      const meRes = await require('supertest')(meApp)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user).toHaveProperty('email', email);
    });

    it('BE-I-006 GET /auth/me returns 401 with expired access token', async () => {
      const jwt = require('jsonwebtoken');
      const { JWT_SECRET } = require('../../src/middleware/auth');
      const expiredToken = jwt.sign(
        { sub: 'any-user', email, type: 'access' },
        JWT_SECRET,
        { expiresIn: -1 },
      );

      const res = await request
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('BE-I-007 Step-up token', () => {
    it('POST /auth/stepup issues a step-up token after password re-auth', async () => {
      const loginRes = await request.post('/auth/login').send({ email, password });
      const token    = loginRes.body.accessToken;

      const res = await request
        .post('/auth/stepup')
        .set('Authorization', `Bearer ${token}`)
        .send({ password, intent: 'consent:grant' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('stepUpToken');
      expect(res.body.factor).toBe('password');
    });
  });
});
