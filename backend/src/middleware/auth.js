'use strict';

/**
 * JWT helpers and Express middleware for request authentication.
 *
 * Access and refresh tokens are signed with separate secrets and carry an
 * explicit `type` claim so tokens cannot be cross-used. The server refuses
 * to start in production if either secret is missing or too weak.
 */

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../lib/logger');

const log     = logger.child({ module: 'auth-middleware' });
const IS_PROD = process.env.NODE_ENV === 'production';

const ACCESS_TTL  = process.env.ACCESS_TOKEN_TTL  || '15m';
const REFRESH_TTL = process.env.REFRESH_TOKEN_TTL || '30d';

function loadSecret(envName, devFallback) {
  const value = process.env[envName];
  const ok    = value && value.length >= 16 && !/change-me/i.test(value);
  if (ok) return value;
  if (IS_PROD) {
    log.fatal({ envName }, `${envName} is missing, too short, or set to a placeholder — refusing to start in production`);
    process.exit(1);
  }
  log.warn({ envName }, `${envName} not set — using an ephemeral dev secret. Do NOT do this in production.`);
  return devFallback;
}

const ephemeralAccess  = crypto.randomBytes(48).toString('base64');
const ephemeralRefresh = crypto.randomBytes(48).toString('base64');

const JWT_SECRET         = loadSecret('JWT_SECRET',         ephemeralAccess);
const JWT_REFRESH_SECRET = loadSecret('JWT_REFRESH_SECRET', ephemeralRefresh);

if (JWT_SECRET === JWT_REFRESH_SECRET) {
  if (IS_PROD) {
    log.fatal('JWT_SECRET and JWT_REFRESH_SECRET must differ in production — refusing to start');
    process.exit(1);
  }
  log.warn('JWT_SECRET and JWT_REFRESH_SECRET are identical — acceptable only in dev');
}

function issueToken(userId, email) {
  return jwt.sign({ sub: userId, email, type: 'access' }, JWT_SECRET, { expiresIn: ACCESS_TTL });
}

function issueRefreshToken(userId, jti) {
  return jwt.sign(
    { sub: userId, type: 'refresh', jti: jti || crypto.randomUUID() },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, JWT_REFRESH_SECRET);
  if (payload.type !== 'refresh') {
    const err = new Error('Token is not a refresh token');
    err.name  = 'JsonWebTokenError';
    throw err;
  }
  return payload;
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  // Legacy tokens (pre-1.1) didn't carry a type claim — treat as access.
  if (payload.type && payload.type !== 'access') {
    const err = new Error('Token is not an access token');
    err.name  = 'JsonWebTokenError';
    throw err;
  }
  return payload;
}

function unauthorized(req, res, code, message) {
  return res.status(401).json({
    error: { code, message, requestId: req.id, timestamp: new Date().toISOString() },
  });
}

function verifyToken(req, res, next) {
  // Prefer httpOnly cookie (web); fall back to Authorization header (mobile).
  const cookieToken  = req.cookies?.pdv_session;
  const authHeader   = req.headers.authorization;
  const bearerToken  = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token        = cookieToken || bearerToken;

  if (!token) {
    (req.log ?? log).warn({ requestId: req.id, path: req.path }, 'No auth credential — cookie or Bearer header required');
    return unauthorized(req, res, 'TOKEN_INVALID', 'Authentication required.');
  }

  try {
    req.user = verifyAccessToken(token);
    return next();
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    (req.log ?? log).warn(
      { requestId: req.id, path: req.path, reason: expired ? 'expired' : 'invalid' },
      'Access token verification failed'
    );
    return unauthorized(
      req, res,
      expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      expired ? 'Token has expired.' : 'Token is invalid.'
    );
  }
}

module.exports = {
  verifyToken,
  issueToken,
  issueRefreshToken,
  verifyRefreshToken,
  verifyAccessToken,
  JWT_SECRET,
  JWT_REFRESH_SECRET,
};
