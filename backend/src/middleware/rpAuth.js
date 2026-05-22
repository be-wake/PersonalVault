'use strict';

/**
 * Relying-party (server-to-server) authentication — client-credentials flow (F20).
 *
 * RPs obtain a short-lived bearer token from POST /v1/rp/token using their
 * client_id + client_secret, then present it to the scoped-read endpoint.
 * RP tokens carry `type: 'rp'` and are signed with the same JWT_SECRET as user
 * access tokens but are distinguishable by the type claim, so a user token can
 * never be used on an RP route or vice-versa.
 */

const jwt    = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth');
const logger = require('../lib/logger');

const log = logger.child({ module: 'rp-auth' });

const RP_TOKEN_TTL = process.env.RP_TOKEN_TTL || '10m';

function issueRPToken(rpId, clientId) {
  return jwt.sign({ sub: rpId, clientId, type: 'rp' }, JWT_SECRET, { expiresIn: RP_TOKEN_TTL });
}

function verifyRPToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { code: 'TOKEN_INVALID', message: 'RP authorization header missing or malformed.', requestId: req.id },
    });
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
    if (payload.type !== 'rp') {
      const err = new Error('Token is not an RP token');
      err.name = 'JsonWebTokenError';
      throw err;
    }
    req.rp = { id: payload.sub, clientId: payload.clientId };
    return next();
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    (req.log ?? log).warn({ requestId: req.id, reason: expired ? 'expired' : 'invalid' }, 'RP token verification failed');
    return res.status(401).json({
      error: {
        code:      expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        message:   expired ? 'RP token has expired.' : 'RP token is invalid.',
        requestId: req.id,
      },
    });
  }
}

module.exports = { issueRPToken, verifyRPToken, RP_TOKEN_TTL };
