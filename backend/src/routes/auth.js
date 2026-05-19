const express = require('express');
const bcrypt = require('bcryptjs');
const { createUser, findUserByEmail, findUserById } = require('../db');
const { issueToken, issueRefreshToken, verifyRefreshToken, verifyToken } = require('../middleware/auth');

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
    return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' } });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = createUser(email.toLowerCase(), passwordHash, name);

  const accessToken = issueToken(userId, email.toLowerCase());
  const refreshToken = issueRefreshToken(userId);

  res.status(201).json({
    accessToken,
    refreshToken,
    user: { id: userId, email: email.toLowerCase(), name }
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
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
  }

  const accessToken = issueToken(user.id, user.email);
  const refreshToken = issueRefreshToken(user.id);

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name }
  });
});

// POST /auth/refresh
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'refreshToken is required.' } });
  }
  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'User not found.' } });

    const newAccessToken = issueToken(user.id, user.email);
    res.json({ accessToken: newAccessToken });
  } catch {
    res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'Refresh token is invalid or expired.' } });
  }
});

// GET /auth/me
router.get('/me', verifyToken, (req, res) => {
  const user = findUserById(req.user.sub);
  if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
  res.json({ user });
});

module.exports = router;
