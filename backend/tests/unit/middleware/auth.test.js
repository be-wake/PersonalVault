'use strict';

// BE-U-001 through BE-U-008

const jwt = require('jsonwebtoken');
const {
  issueToken,
  issueRefreshToken,
  verifyAccessToken,
  verifyToken,
  JWT_SECRET,
  JWT_REFRESH_SECRET,
} = require('../../../src/middleware/auth');

// ── Token helpers ──────────────────────────────────────────────────────────

describe('issueToken', () => {
  it('BE-U-001 generates JWT with correct userId and email claims', () => {
    const token   = issueToken('user-123', 'alice@example.com');
    const decoded = jwt.decode(token);
    expect(decoded.sub).toBe('user-123');
    expect(decoded.email).toBe('alice@example.com');
    expect(decoded.type).toBe('access');
  });

  it('BE-U-002 sets 15-minute expiry', () => {
    const before = Math.floor(Date.now() / 1000);
    const token  = issueToken('user-123', 'alice@example.com');
    const after  = Math.floor(Date.now() / 1000);
    const { exp, iat } = jwt.decode(token);
    const ttlSeconds = exp - iat;
    expect(ttlSeconds).toBe(15 * 60);
    expect(exp).toBeGreaterThanOrEqual(before + 15 * 60);
    expect(exp).toBeLessThanOrEqual(after  + 15 * 60);
  });
});

describe('issueRefreshToken', () => {
  it('BE-U-003 sets 30-day expiry and type=refresh', () => {
    const token   = issueRefreshToken('user-abc');
    const decoded = jwt.decode(token);
    expect(decoded.type).toBe('refresh');
    expect(decoded.sub).toBe('user-abc');
    const ttlDays = (decoded.exp - decoded.iat) / (60 * 60 * 24);
    expect(ttlDays).toBe(30);
  });
});

describe('verifyAccessToken', () => {
  it('BE-U-004 returns decoded payload for valid token', () => {
    const token   = issueToken('user-xyz', 'bob@example.com');
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-xyz');
    expect(payload.email).toBe('bob@example.com');
    expect(payload.type).toBe('access');
  });

  it('BE-U-005 throws for expired token', () => {
    const expired = jwt.sign(
      { sub: 'u1', email: 'x@y.com', type: 'access' },
      JWT_SECRET,
      { expiresIn: -1 },
    );
    expect(() => verifyAccessToken(expired)).toThrow();
  });
});

// ── verifyToken middleware ─────────────────────────────────────────────────

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

describe('verifyToken middleware', () => {
  it('BE-U-006 extracts JWT from Authorization Bearer header', () => {
    const token = issueToken('u1', 'a@b.com');
    const req   = { headers: { authorization: `Bearer ${token}` }, cookies: {}, id: 'r1', path: '/test' };
    const res   = mockRes();
    const next  = jest.fn();

    verifyToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.sub).toBe('u1');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('BE-U-007 extracts JWT from httpOnly pdv_session cookie', () => {
    const token = issueToken('u2', 'b@c.com');
    const req   = { headers: {}, cookies: { pdv_session: token }, id: 'r2', path: '/test' };
    const res   = mockRes();
    const next  = jest.fn();

    verifyToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.sub).toBe('u2');
  });

  it('BE-U-008 returns 401 when no token is present', () => {
    const req = { headers: {}, cookies: {}, id: 'r3', path: '/test' };
    const res = mockRes();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'TOKEN_INVALID' }) }),
    );
  });

  it('returns 401 with TOKEN_EXPIRED for an expired token', () => {
    const expired = jwt.sign(
      { sub: 'u3', email: 'c@d.com', type: 'access' },
      JWT_SECRET,
      { expiresIn: -1 },
    );
    const req  = { headers: { authorization: `Bearer ${expired}` }, cookies: {}, id: 'r4', path: '/test' };
    const res  = mockRes();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe('TOKEN_EXPIRED');
  });
});
