'use strict';

// BE-U-046 through BE-U-049
// env.js sets STEPUP_ENFORCED=true so requireStepUp is active on the card route.

// Factory mock prevents Jest from loading the real db module (uuid v14 ESM issue).
jest.mock('../../../src/db', () => ({
  getIdentity:      jest.fn(),
  upsertIdentity:   jest.fn(),
  getCurrentAddress: jest.fn(),
  getAddressHistory: jest.fn(),
  upsertAddress:    jest.fn(),
  getPaymentCards:  jest.fn(),
  addPaymentCard:   jest.fn(),
  removePaymentCard: jest.fn(),
  getContacts:      jest.fn(),
  upsertContacts:   jest.fn(),
  insertAuditEvent: jest.fn(),
}));

const request = require('supertest');
const { makeApp } = require('../../helpers/makeApp');
const vaultRouter  = require('../../../src/routes/vault');
const db           = require('../../../src/db');
const { issueToken }         = require('../../../src/middleware/auth');
const { issueStepUpToken }   = require('../../../src/middleware/stepUp');

const app = makeApp();
app.use('/v1', vaultRouter);

const USER_ID = 'user-test-001';

// Valid access token for USER_ID
const accessToken = issueToken(USER_ID, 'test@example.com');

// Valid step-up token for adding a payment card
const stepUpToken = issueStepUpToken(USER_ID, 'payment:add_card', 'password');

beforeEach(() => {
  jest.clearAllMocks();
  db.insertAuditEvent.mockResolvedValue(undefined);
});

// ── Identity ─────────────────────────────────────────────────────────────────

describe('PUT /v1/identity/:userId', () => {
  it('BE-U-046 returns 403 when date_of_birth indicates user is under 18 (DPDPA S.16)', async () => {
    const minorDob = new Date();
    minorDob.setFullYear(minorDob.getFullYear() - 10); // 10 years old
    const dob = minorDob.toISOString().slice(0, 10);

    const res = await request(app)
      .put(`/v1/identity/${USER_ID}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ date_of_birth: dob, first_name: 'Young', last_name: 'User' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MINOR_CONSENT_REQUIRED');
  });

  it('allows identity update when user is 18 or older', async () => {
    db.upsertIdentity.mockResolvedValue(undefined);
    db.getIdentity.mockResolvedValue({ first_name: 'Adult', last_name: 'User' });

    const adultDob = new Date();
    adultDob.setFullYear(adultDob.getFullYear() - 25);
    const dob = adultDob.toISOString().slice(0, 10);

    const res = await request(app)
      .put(`/v1/identity/${USER_ID}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ date_of_birth: dob, first_name: 'Adult', last_name: 'User' });

    expect(res.status).toBe(200);
  });
});

// ── Payment cards ─────────────────────────────────────────────────────────────

describe('POST /v1/payment/:userId/cards', () => {
  const validCard = {
    card_type:   'visa',
    last_4:      '1234',
    expiry_mm_yy: '12/99',
  };

  it('BE-U-047 returns 400 for an unsupported card brand', async () => {
    const res = await request(app)
      .post(`/v1/payment/${USER_ID}/cards`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-PDV-Stepup', stepUpToken)
      .send({ ...validCard, card_type: 'diners' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('BE-U-048 returns 400 when card has already expired', async () => {
    const res = await request(app)
      .post(`/v1/payment/${USER_ID}/cards`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-PDV-Stepup', stepUpToken)
      .send({ ...validCard, expiry_mm_yy: '01/20' }); // expired in 2020

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/expired/i);
  });

  it('BE-U-049 returns 401 when X-PDV-Stepup header is missing', async () => {
    // No step-up header provided — should be rejected before reaching card logic
    const res = await request(app)
      .post(`/v1/payment/${USER_ID}/cards`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(validCard);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('STEPUP_REQUIRED');
  });

  it('returns 201 for a valid card with step-up token', async () => {
    const cardId = 'card-uuid-001';
    db.addPaymentCard.mockResolvedValue(cardId);
    db.getPaymentCards.mockResolvedValue([{ id: cardId, ...validCard }]);

    const res = await request(app)
      .post(`/v1/payment/${USER_ID}/cards`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-PDV-Stepup', stepUpToken)
      .send(validCard);

    expect(res.status).toBe(201);
    expect(res.body.card.id).toBe(cardId);
  });

  it('returns 400 for last_4 that is not exactly 4 digits', async () => {
    const res = await request(app)
      .post(`/v1/payment/${USER_ID}/cards`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-PDV-Stepup', stepUpToken)
      .send({ ...validCard, last_4: '12' });

    expect(res.status).toBe(400);
  });

  it('returns 403 when the token userId does not match the URL userId', async () => {
    const res = await request(app)
      .post('/v1/payment/different-user/cards')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-PDV-Stepup', stepUpToken)
      .send(validCard);

    expect(res.status).toBe(403);
  });
});
