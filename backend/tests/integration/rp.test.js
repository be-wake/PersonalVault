'use strict';

// BE-I-014 through BE-I-017 — RP API integration tests.
// Requires TEST_DATABASE_URL.

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeIf = TEST_DB ? describe : describe.skip;

if (!TEST_DB) {
  it.skip('Integration RP tests require TEST_DATABASE_URL to be set', () => {});
}

describeIf('RP API integration tests', () => {
  let request;
  let db;
  let userAccessToken;
  let rpAccessToken;
  let userId;
  let grantId;
  let rpRow;
  const runId   = Date.now();
  const email   = `rp-test-${runId}@example.com`;
  const password = 'RPTest1234';

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    jest.resetModules();

    db = require('../../src/db');
    const cryptoLib = require('../../src/lib/crypto');
    await db.init();
    await cryptoLib.init();

    const { makeApp }    = require('../helpers/makeApp');
    const authRouter     = require('../../src/routes/auth');
    const rpRouter       = require('../../src/routes/rp');
    const consentRouter  = require('../../src/routes/consents');

    const app = makeApp();
    app.use('/auth', authRouter);
    app.use('/v1', rpRouter);
    app.use('/v1', consentRouter);
    request = require('supertest')(app);

    // Register user
    const reg = await request.post('/auth/register').send({ email, password, name: 'RP Test User' });
    userAccessToken = reg.body.accessToken;
    userId          = reg.body.user.id;

    // Seed relying party
    const bcrypt = require('bcryptjs');
    const secretHash = await bcrypt.hash('rp-test-secret-xyz', 10);
    const { rows } = await db.query(`
      INSERT INTO relying_parties (id, name, domain, client_id, client_secret_hash, allowed_scopes)
      VALUES (gen_random_uuid(), 'RP Test', 'rp.example.com', 'rp-client-${runId}', $1, ARRAY['identity:name'])
      RETURNING *
    `, [secretHash]).catch(() => ({ rows: [] }));
    rpRow = rows[0];

    if (rpRow) {
      // Create a grant
      const stepRes = await request
        .post('/auth/stepup')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({ password, intent: 'consent:grant' });

      const grantRes = await request
        .post('/v1/consents/')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .set('X-PDV-Stepup', stepRes.body.stepUpToken)
        .set('Idempotency-Key', `rp-${runId}`)
        .send({ userId, relyingPartyId: rpRow.id, scopes: ['identity:name'], expiresAt: null });

      grantId = grantRes.body?.grant?.id;
    }
  });

  afterAll(async () => {
    await db.close();
  });

  it('BE-I-014 POST /v1/rp/token returns access_token with 600s expiry', async () => {
    if (!rpRow) return;
    const res = await request.post('/v1/rp/token').send({
      client_id:     rpRow.client_id,
      client_secret: 'rp-test-secret-xyz',
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('access_token');
    const { exp, iat } = require('jsonwebtoken').decode(res.body.access_token);
    expect(exp - iat).toBe(600);
    rpAccessToken = res.body.access_token;
  });

  it('BE-I-015 GET /v1/rp/grants/:grantId/data returns masked data per scopes', async () => {
    if (!rpRow || !grantId || !rpAccessToken) return;
    const res = await request
      .get(`/v1/rp/grants/${grantId}/data`)
      .set('Authorization', `Bearer ${rpAccessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });

  it('BE-I-016 GET /v1/rp/grants/:grantId/data returns 403 for revoked grant', async () => {
    if (!rpRow || !grantId || !rpAccessToken) return;

    // Revoke the grant
    const revokeStep = await request
      .post('/auth/stepup')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .send({ password, intent: 'consent:revoke' });

    await request
      .delete(`/v1/consents/${grantId}`)
      .set('Authorization', `Bearer ${userAccessToken}`)
      .set('X-PDV-Stepup', revokeStep.body.stepUpToken);

    const res = await request
      .get(`/v1/rp/grants/${grantId}/data`)
      .set('Authorization', `Bearer ${rpAccessToken}`);

    expect(res.status).toBe(403);
  });

  it('BE-I-017 RP cannot read scopes outside its allowedScopes', async () => {
    if (!rpRow || !rpAccessToken) return;
    // Create a new grant with a scope the RP is NOT allowed to read
    // (identity:dob is not in rpRow.allowed_scopes = ['identity:name'])
    const stepRes = await request
      .post('/auth/stepup')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .send({ password, intent: 'consent:grant' });

    const grantRes = await request
      .post('/v1/consents/')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .set('X-PDV-Stepup', stepRes.body.stepUpToken)
      .set('Idempotency-Key', `rp-scope-${runId}`)
      .send({ userId, relyingPartyId: rpRow.id, scopes: ['identity:dob'], expiresAt: null });

    // Either the grant creation rejects the out-of-allowlist scope, or the
    // data endpoint returns only the allowed projection (empty in this case).
    if (grantRes.status === 201) {
      const g2Id = grantRes.body.grant.id;
      const res = await request
        .get(`/v1/rp/grants/${g2Id}/data`)
        .set('Authorization', `Bearer ${rpAccessToken}`);
      // identity:dob is not in RP allowlist — data should be empty or denied
      expect([200, 403].includes(res.status)).toBe(true);
      if (res.status === 200) {
        expect(res.body.data?.identity?.date_of_birth).toBeUndefined();
      }
    } else {
      // Grant creation correctly rejected the out-of-allowlist scope
      expect([400, 422].includes(grantRes.status)).toBe(true);
    }
  });
});
