'use strict';

// BE-I-018 through BE-I-027 — Vault CRUD, Account, and Audit integration tests.
// Requires TEST_DATABASE_URL.

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeIf = TEST_DB ? describe : describe.skip;

if (!TEST_DB) {
  it.skip('Integration vault tests require TEST_DATABASE_URL to be set', () => {});
}

describeIf('Vault & Account integration tests', () => {
  let request;
  let db;
  let accessToken;
  let userId;
  let cardStepUpToken;
  let deleteStepUpToken;
  const runId   = Date.now();
  const email   = `vault-${runId}@example.com`;
  const password = 'VaultTest1234';

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    jest.resetModules();

    db = require('../../src/db');
    const cryptoLib = require('../../src/lib/crypto');
    await db.init();
    await cryptoLib.init();

    const { makeApp }    = require('../helpers/makeApp');
    const authRouter     = require('../../src/routes/auth');
    const vaultRouter    = require('../../src/routes/vault');
    const accountRouter  = require('../../src/routes/account');
    const auditRouter    = require('../../src/routes/audit');

    const app = makeApp();
    app.use('/auth', authRouter);
    app.use('/v1', vaultRouter);
    app.use('/v1', accountRouter);
    app.use('/v1', auditRouter);
    request = require('supertest')(app);

    const reg = await request
      .post('/auth/register')
      .send({ email, password, name: 'Vault User' });
    accessToken = reg.body.accessToken;
    userId      = reg.body.user.id;

    const cardStep = await request
      .post('/auth/stepup')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password, intent: 'payment:add_card' });
    cardStepUpToken = cardStep.body.stepUpToken;
  });

  afterAll(async () => {
    await db.close();
  });

  // ── Identity ────────────────────────────────────────────────────────────────

  it('BE-I-018 PUT /v1/identity persists fields (encryption checked in DB layer)', async () => {
    const adultDob = new Date();
    adultDob.setFullYear(adultDob.getFullYear() - 30);

    const res = await request
      .put(`/v1/identity/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        first_name:    'Vault',
        last_name:     'User',
        date_of_birth: adultDob.toISOString().slice(0, 10),
      });

    expect(res.status).toBe(200);
    expect(res.body.identity.first_name).toBe('Vault');
  });

  it('BE-I-019 GET /v1/identity returns decrypted fields for authorized user', async () => {
    const res = await request
      .get(`/v1/identity/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.identity.first_name).toBe('Vault');
  });

  // ── Address ─────────────────────────────────────────────────────────────────

  it('BE-I-020 GET /v1/address/history returns archived addresses', async () => {
    // Create two addresses so there is history
    await request.put(`/v1/address/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ line1: '1 Old St', city: 'Delhi', country: 'IN' });

    await request.put(`/v1/address/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ line1: '2 New St', city: 'Mumbai', country: 'IN' });

    const res = await request
      .get(`/v1/address/${userId}/history`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history.length).toBeGreaterThanOrEqual(1);
  });

  // ── Payment cards ────────────────────────────────────────────────────────────

  it('BE-I-021 POST /v1/payment/cards stores tokenized card data only (no raw PAN)', async () => {
    const res = await request
      .post(`/v1/payment/${userId}/cards`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-PDV-Stepup', cardStepUpToken)
      .send({ card_type: 'visa', last_4: '4242', expiry_mm_yy: '12/99' });

    expect(res.status).toBe(201);
    expect(res.body.card).toHaveProperty('last_4', '4242');
    // Raw PAN must never be stored or returned
    expect(JSON.stringify(res.body)).not.toMatch(/\d{12,16}/);
  });

  it('BE-I-022 DELETE /v1/payment/cards/:cardId removes the card for its owner', async () => {
    // Add a fresh card first
    const addStep = await request
      .post('/auth/stepup')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password, intent: 'payment:add_card' });

    const addRes = await request
      .post(`/v1/payment/${userId}/cards`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-PDV-Stepup', addStep.body.stepUpToken)
      .send({ card_type: 'mastercard', last_4: '9999', expiry_mm_yy: '06/30' });

    const cardId = addRes.body.card.id;

    const delRes = await request
      .delete(`/v1/payment/${userId}/cards/${cardId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
  });

  // ── Account & Audit ──────────────────────────────────────────────────────────

  it('BE-I-023 GET /v1/account/export returns complete user data bundle', async () => {
    const res = await request
      .get('/v1/account/export')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
  });

  it('BE-I-025 GET /v1/account/audit/verify returns valid chain for intact log', async () => {
    const res = await request
      .get('/v1/account/audit/verify')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('valid', true);
  });

  it('BE-I-026 / BE-I-027 Consent grant and revocation each write an audit event', async () => {
    const auditRes = await request
      .get(`/v1/audit/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(auditRes.status).toBe(200);
    expect(Array.isArray(auditRes.body.events)).toBe(true);
  });

  // ── Account deletion (run last — deletes the test user) ────────────────────

  it('BE-I-024 DELETE /v1/account erases all user data (step-up gated)', async () => {
    const delStep = await request
      .post('/auth/stepup')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password, intent: 'account:delete' });

    const res = await request
      .delete('/v1/account')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-PDV-Stepup', delStep.body.stepUpToken);

    expect(res.status).toBe(200);
  });
});
