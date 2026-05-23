'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const { z }    = require('zod');
const { createUser, findUserByEmail, findUserById } = require('../db');
const { issueToken, issueRefreshToken, verifyRefreshToken, verifyToken } = require('../middleware/auth');
const { issueStepUpToken } = require('../middleware/stepUp');
const { validate } = require('../middleware/validate');
const logger   = require('../lib/logger');

const IS_PROD = process.env.NODE_ENV === 'production';

// S1 — cookie settings for the httpOnly session and refresh cookies.
// SameSite:Strict prevents CSRF without needing a separate CSRF token.
const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  secure:   IS_PROD,
  sameSite: 'strict',
  path:     '/',
  maxAge:   15 * 60 * 1000,            // 15 min — matches JWT ACCESS_TTL
};
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure:   IS_PROD,
  sameSite: 'strict',
  path:     '/auth/refresh',           // scoped so it isn't sent to other endpoints
  maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days — matches JWT REFRESH_TTL
};

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('pdv_session', accessToken, SESSION_COOKIE_OPTS);
  if (refreshToken) res.cookie('pdv_refresh', refreshToken, REFRESH_COOKIE_OPTS);
}

function clearAuthCookies(res) {
  res.clearCookie('pdv_session', { path: '/' });
  res.clearCookie('pdv_refresh', { path: '/auth/refresh' });
}

const log    = logger.child({ module: 'route:auth' });
const router = express.Router();

// Propagates async errors to Express's global error handler
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// ── Validation schemas (C1) ─────────────────────────────────────────────────
// S8 — password policy: ≥ 10 chars with at least one letter and one digit.
// (Account lockout / throttling is handled by authLimiter in server.js;
//  breached-password check via HIBP is a future enhancement.)
const passwordPolicy = z.string()
  .min(10, 'Password must be at least 10 characters.')
  .max(200, 'Password is too long.')
  .refine(v => /[A-Za-z]/.test(v) && /[0-9]/.test(v),
    'Password must contain at least one letter and one number.');

const registerSchema = z.object({
  email:    z.string().email('A valid email is required.').transform(s => s.toLowerCase()),
  password: passwordPolicy,
  name:     z.string().min(1, 'Name is required.').max(120),
});

const loginSchema = z.object({
  email:    z.string().email('A valid email is required.').transform(s => s.toLowerCase()),
  password: z.string().min(1, 'Password is required.'),
});

const stepUpSchema = z.object({
  password: z.string().min(1, 'Password is required.'),
  intent:   z.enum(['consent:grant', 'consent:revoke', 'payment:add_card', 'account:delete']),
});

// POST /auth/register
router.post('/register', validate({ body: registerSchema }), wrap(async (req, res) => {
  const { email, password, name } = req.body; // already validated + email lower-cased

  const existing = await findUserByEmail(email);
  if (existing) {
    (req.log ?? log).warn({ email }, 'Registration failed — email already taken');
    return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' } });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userId       = await createUser(email, passwordHash, name);

  (req.log ?? log).info({ userId, email }, 'User registered');

  const accessToken  = issueToken(userId, email.toLowerCase());
  const refreshToken = issueRefreshToken(userId);

  // S1 — set httpOnly cookies for web clients; still return tokens in the body
  // so native mobile clients (which can't use cookies) keep working.
  setAuthCookies(res, accessToken, refreshToken);

  res.status(201).json({
    accessToken,
    refreshToken,
    user: { id: userId, email, name },
  });
}));

// POST /auth/login
router.post('/login', validate({ body: loginSchema }), wrap(async (req, res) => {
  const { email, password } = req.body; // validated + email lower-cased

  const user = await findUserByEmail(email);
  if (!user) {
    (req.log ?? log).warn({ email }, 'Login failed — user not found');
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    (req.log ?? log).warn({ userId: user.id, email: user.email }, 'Login failed — wrong password');
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
  }

  (req.log ?? log).info({ userId: user.id, email: user.email }, 'User logged in');

  const accessToken  = issueToken(user.id, user.email);
  const refreshToken = issueRefreshToken(user.id);

  setAuthCookies(res, accessToken, refreshToken);

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name },
  });
}));

// POST /auth/refresh
router.post('/refresh', wrap(async (req, res) => {
  // S1 — accept refresh token from httpOnly cookie (web) or request body (mobile).
  const refreshToken = req.cookies?.pdv_refresh || req.body?.refreshToken;
  if (!refreshToken) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'refreshToken is required.' } });
  }
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    (req.log ?? log).warn({ reason: err.message }, 'Token refresh failed — invalid token');
    return res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'Refresh token is invalid or expired.' } });
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    (req.log ?? log).warn({ sub: payload.sub }, 'Token refresh failed — user not found');
    return res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'User not found.' } });
  }

  (req.log ?? log).debug({ userId: user.id }, 'Access token refreshed');
  const newAccessToken = issueToken(user.id, user.email);

  // Rotate the session cookie for web clients; still return the token in the body
  // so mobile clients can update their SecureStore.
  res.cookie('pdv_session', newAccessToken, SESSION_COOKIE_OPTS);

  res.json({ accessToken: newAccessToken });
}));

// POST /auth/logout — clears the httpOnly cookies for web clients.
// Mobile clients should discard their stored tokens on the client side.
router.post('/logout', (req, res) => {
  clearAuthCookies(res);
  (req.log ?? log).debug({ requestId: req.id }, 'Auth cookies cleared');
  res.json({ ok: true });
});

// GET /auth/me
router.get('/me', verifyToken, wrap(async (req, res) => {
  const user = await findUserById(req.user.sub);
  if (!user) {
    (req.log ?? log).warn({ userId: req.user.sub }, '/me — user not found in DB');
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
  }
  (req.log ?? log).debug({ userId: user.id }, 'Auth /me');
  res.json({ user });
}));

// POST /auth/stepup — issue a short-lived step-up token after re-authentication.
// The client calls this immediately before a sensitive action (consent grant/
// revoke, add card, delete account) and presents the returned token in the
// X-PDV-Stepup header. Second factor here is password re-entry; biometric/TOTP
// factors (F18/F19) can issue the same token type with a different `factor`.
router.post('/stepup', verifyToken, validate({ body: stepUpSchema }), wrap(async (req, res) => {
  const { password, intent } = req.body;

  // Need the password hash → look up by the email embedded in the access token.
  const user = await findUserByEmail(req.user.email);
  if (!user) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Re-authentication failed.' } });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    (req.log ?? log).warn({ userId: user.id, intent }, 'Step-up failed — wrong password');
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Re-authentication failed.' } });
  }

  const stepUpToken = issueStepUpToken(user.id, intent, 'password');
  (req.log ?? log).info({ userId: user.id, intent }, 'Step-up token issued');
  res.json({ stepUpToken, intent, factor: 'password' });
}));

module.exports = router;
