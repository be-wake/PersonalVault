'use strict';

// BE-U-041 through BE-U-045
// Uses supertest against a minimal Express app with the DB mocked out.

// Factory mock prevents Jest from loading the real db module (which pulls in
// uuid v14 ESM, incompatible with Jest's CommonJS transform).
jest.mock('../../../src/db', () => ({
  createUser:      jest.fn(),
  findUserByEmail: jest.fn(),
  findUserById:    jest.fn(),
  insertAuditEvent: jest.fn(),
}));

const request = require('supertest');
const { makeApp } = require('../../helpers/makeApp');
const authRouter  = require('../../../src/routes/auth');
const db          = require('../../../src/db');

// Build app once for the suite
const app = makeApp();
app.use('/auth', authRouter);

// ── mock helpers ──────────────────────────────────────────────────────────────

const bcrypt = require('bcryptjs');

async function hashPw(pw) {
  return bcrypt.hash(pw, 10);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('BE-U-041 returns 400 for a password that is too short (< 10 chars)', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'short1', name: 'Alice' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a password with no digits', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'onlyletters!!', name: 'Alice' });

    expect(res.status).toBe(400);
  });

  it('BE-U-042 returns 409 when email is already taken', async () => {
    db.findUserByEmail.mockResolvedValue({ id: 'existing-user' });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'taken@example.com', password: 'ValidPass1', name: 'Bob' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('returns 201 with accessToken/refreshToken on success', async () => {
    db.findUserByEmail.mockResolvedValue(null);
    db.createUser.mockResolvedValue('new-user-id');

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'new@example.com', password: 'ValidPass1', name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });
});

describe('POST /auth/login', () => {
  it('BE-U-043 returns 401 for wrong password', async () => {
    db.findUserByEmail.mockResolvedValue({
      id:            'user-1',
      email:         'alice@example.com',
      password_hash: await hashPw('correct-pass1'),
      name:          'Alice',
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'wrong-password1' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('BE-U-044 returns tokens and sets httpOnly pdv_session cookie on success', async () => {
    db.findUserByEmail.mockResolvedValue({
      id:            'user-1',
      email:         'alice@example.com',
      password_hash: await hashPw('correct-pass1'),
      name:          'Alice',
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'correct-pass1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');

    const setCookie = res.headers['set-cookie'] || [];
    const sessionCookie = setCookie.find(c => c.startsWith('pdv_session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
  });

  it('returns 401 when user is not found', async () => {
    db.findUserByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'ghost@example.com', password: 'ValidPass1' });

    expect(res.status).toBe(401);
  });
});

describe('POST /auth/stepup', () => {
  it('BE-U-045 returns stepUpToken after correct password re-auth', async () => {
    const pw   = 'correct-pass1';
    const hash = await hashPw(pw);

    // verifyToken needs a valid access token — generate one
    const { issueToken } = require('../../../src/middleware/auth');
    const token = issueToken('user-1', 'alice@example.com');

    db.findUserByEmail.mockResolvedValue({ id: 'user-1', email: 'alice@example.com', password_hash: hash });

    const res = await request(app)
      .post('/auth/stepup')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: pw, intent: 'consent:grant' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('stepUpToken');
    expect(res.body.intent).toBe('consent:grant');
    expect(res.body.factor).toBe('password');
  });

  it('returns 401 when step-up password is wrong', async () => {
    const { issueToken } = require('../../../src/middleware/auth');
    const token = issueToken('user-1', 'alice@example.com');

    db.findUserByEmail.mockResolvedValue({
      id:            'user-1',
      email:         'alice@example.com',
      password_hash: await hashPw('real-password1'),
    });

    const res = await request(app)
      .post('/auth/stepup')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'wrong-password1', intent: 'consent:grant' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});
