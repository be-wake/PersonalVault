const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'pdv-dev-secret-change-in-production';

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        code: 'TOKEN_INVALID',
        message: 'Authorization header missing or malformed.',
        requestId: req.id,
        timestamp: new Date().toISOString()
      }
    });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({
      error: {
        code: 'TOKEN_INVALID',
        message: err.name === 'TokenExpiredError' ? 'Token has expired.' : 'Token is invalid.',
        requestId: req.id,
        timestamp: new Date().toISOString()
      }
    });
  }
}

function issueToken(userId, email) {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: '15m' });
}

function issueRefreshToken(userId) {
  return jwt.sign({ sub: userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { verifyToken, issueToken, issueRefreshToken, verifyRefreshToken, JWT_SECRET };
