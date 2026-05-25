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

// httpOnly + SameSite:Strict cookies — no JS access, CSRF-safe without a token.
// Refresh cookie is path-scoped to /auth/refresh so it isn't sent elsewhere.
const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  secure:   IS_PROD,
  sameSite: 'strict',
  path:     '/',
  maxAge:   15 * 60 * 1000,            // 15 min
};
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure:   IS_PROD,
  sameSite: 'strict',
  path:     '/auth/refresh',
  maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days
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

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// ── Validation schemas ───────────────────────────────────────────────────────
// Password: ≥ 10 chars, at least one letter and one digit.
// Rate-limiting is handled by authLimiter in server.js.
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
  const { email, password, name } = req.body;

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

  // Set httpOnly cookies for web; return tokens in body for mobile clients.
  setAuthCookies(res, accessToken, refreshToken);

  res.status(201).json({
    accessToken,
    refreshToken,
    user: { id: userId, email, name },
  });
}));

// POST /auth/login
router.post('/login', validate({ body: loginSchema }), wrap(async (req, res) => {
  const { email, password } = req.body;

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
  // Accept token from httpOnly cookie (web) or request body (mobile).
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

  // Rotate session cookie (web) and return new token in body (mobile).
  res.cookie('pdv_session', newAccessToken, SESSION_COOKIE_OPTS);

  res.json({ accessToken: newAccessToken });
}));

// POST /auth/logout
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

// POST /auth/stepup — re-authenticate before a sensitive action.
// Client presents the returned token in X-PDV-Stepup on the sensitive request.
router.post('/stepup', verifyToken, validate({ body: stepUpSchema }), wrap(async (req, res) => {
  const { password, intent } = req.body;

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
