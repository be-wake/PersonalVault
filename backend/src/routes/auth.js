'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const { createUser, findUserByEmail, findUserById } = require('../db');
const { issueToken, issueRefreshToken, verifyRefreshToken, verifyToken } = require('../middleware/auth');
const logger   = require('../lib/logger');

const log    = logger.child({ module: 'route:auth' });
const router = express.Router();

// POST /auth/register
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'email, password and name are required.' } });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters.' } });
  }

  const existing = findUserByEmail(email.toLowerCase());
  if (existing) {
    (req.log ?? log).warn({ email: email.toLowerCase() }, 'Registration failed — email already taken');
    return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' } });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userId       = createUser(email.toLowerCase(), passwordHash, name);

  (req.log ?? log).info({ userId, email: email.toLowerCase() }, 'User registered');

  const accessToken  = issueToken(userId, email.toLowerCase());
  const refreshToken = issueRefreshToken(userId);

  res.status(201).json({
    accessToken,
    refreshToken,
    user: { id: userId, email: email.toLowerCase(), name },
  });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'email and password are required.' } });
  }

  const user = findUserByEmail(email.toLowerCase());
  if (!user) {
    (req.log ?? log).warn({ email: email.toLowerCase() }, 'Login failed — user not found');
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

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

// POST /auth/refresh
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'refreshToken is required.' } });
  }
  try {
    const payload  = verifyRefreshToken(refreshToken);
    const user     = findUserById(payload.sub);
    if (!user) {
      (req.log ?? log).warn({ sub: payload.sub }, 'Token refresh failed — user not found');
      return res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'User not found.' } });
    }

    (req.log ?? log).debug({ userId: user.id }, 'Access token refreshed');
    const newAccessToken = issueToken(user.id, user.email);
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    (req.log ?? log).warn({ reason: err.message }, 'Token refresh failed — invalid token');
    res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'Refresh token is invalid or expired.' } });
  }
});

// GET /auth/me
router.get('/me', verifyToken, (req, res) => {
  const user = findUserById(req.user.sub);
  if (!user) {
    (req.log ?? log).warn({ userId: req.user.sub }, '/me — user not found in DB');
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
  }
  (req.log ?? log).debug({ userId: user.id }, 'Auth /me');
  res.json({ user });
});

module.exports = router;
