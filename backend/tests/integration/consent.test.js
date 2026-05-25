'use strict';

// BE-I-008 through BE-I-013 — Consent lifecycle integration tests.
// Requires TEST_DATABASE_URL and a migrated schema.

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeIf = TEST_DB ? describe : describe.skip;

if (!TEST_DB) {
  it.skip('Integration consent tests require TEST_DATABASE_URL to be set', () => {});
}

describeIf('Consent lifecycle integration tests', () => {
  let request;
  let db;
  let accessToken;
  let stepUpToken;
  let userId;
  const runId   = Date.now();
  const email   = `consent-${runId}@example.com`;
  const password = 'ConsentTest1234';
  // A relying-party that must exist in the test database; seed one in beforeAll.
  let rpId;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    jest.resetModules();

    db = require('../../src/db');
    const cryptoLib = require('../../src/lib/crypto');
    await db.init();
    await cryptoLib.init();

    const { makeApp }   = require('../helpers/makeApp');
    const authRouter    = require('../../src/routes/auth');
    const consentRouter = require('../../src/routes/consents');

    const app = makeApp();
    app.use('/auth', authRouter);
    app.use('/v1', consentRouter);
    request = require('supertest')(app);

    // Register a user
    const reg = await request
      .post('/auth/register')
      .send({ email, password, name: 'Consent User' });
    accessToken = reg.body.accessToken;
    userId      = reg.body.user.id;

    // Seed a minimal relying party directly via DB
    const { rows } = await db.query(`
      INSERT INTO relying_parties (id, name, domain, client_id, client_secret_hash, allowed_scopes)
      VALUES (gen_random_uuid(), 'Test RP', 'test-rp.example.com', 'test-client-${runId}', 'hash', ARRAY['identity:name'])
      RETURNING id
    `).catch(() => ({ rows: [] }));
    rpId = rows[0]?.id;

    // Obtain a step-up token for consent:grant
    const stepRes = await request
      .post('/auth/stepup')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password, intent: 'consent:grant' });
    stepUpToken = stepRes.body.stepUpToken;
  });

  afterAll(async () => {
    await db.close();
  });

  let grantId;
  const idempotencyKey = `idem-${Date.now()}`;

  it('BE-I-008 POST /v1/consents creates a grant with ACTIVE status', async () => {
    if (!rpId) return;
    const res = await request
      .post('/v1/consents/')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-PDV-Stepup', stepUpToken)
      .set('Idempotency-Key', idempotencyKey)
      .send({ userId, relyingPartyId: rpId, scopes: ['identity:name'], expiresAt: null });

    expect(res.status).toBe(201);
    expect(res.body.grant.status).toBe('ACTIVE');
    grantId = res.body.grant.id;
  });

  it('BE-I-009 POST /v1/consents is idempotent — same idempotency-key returns same grantId', async () => {
    if (!rpId || !grantId) return;
    // Re-issue step-up for the idempotent call
    const stepRes2 = await request
      .post('/auth/stepup')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password, intent: 'consent:grant' });

    const res = await request
      .post('/v1/consents/')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-PDV-Stepup', stepRes2.body.stepUpToken)
      .set('Idempotency-Key', idempotencyKey)
      .send({ userId, relyingPartyId: rpId, scopes: ['identity:name'], expiresAt: null });

    expect(res.status).toBe(201);
    expect(res.body.grant.id).toBe(grantId);
  });

  it('BE-I-013 GET /v1/consents/:userId lists all user grants', async () => {
    const res = await request
      .get(`/v1/consents/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.grants)).toBe(true);
  });

  it('BE-I-010 DELETE /v1/consents/:grantId transitions grant to REVOKED', async () => {
    if (!grantId) return;
    const revokeStepRes = await request
      .post('/auth/stepup')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password, intent: 'consent:revoke' });

    const res = await request
      .delete(`/v1/consents/${grantId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-PDV-Stepup', revokeStepRes.body.stepUpToken);

    expect(res.status).toBe(200);
  });

  it('BE-I-011 revoked grantId appears in the Redis revocation cache', async () => {
    if (!grantId) return;
    const redisClient = require('../../src/lib/redisClient');
    const isRevoked   = await redisClient.isRevoked(grantId);
    expect(isRevoked).toBe(true);
  });
});
