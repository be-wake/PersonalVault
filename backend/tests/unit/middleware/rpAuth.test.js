'use strict';

// BE-U-013 through BE-U-015

const jwt = require('jsonwebtoken');
const { issueToken, JWT_SECRET } = require('../../../src/middleware/auth');
const { issueRPToken, verifyRPToken }   = require('../../../src/middleware/rpAuth');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

describe('issueRPToken', () => {
  it('BE-U-013 sets type=rp and 10-minute expiry', () => {
    const token   = issueRPToken('rp-uuid', 'client-id-abc');
    const decoded = jwt.decode(token);

    expect(decoded.type).toBe('rp');
    expect(decoded.sub).toBe('rp-uuid');
    expect(decoded.clientId).toBe('client-id-abc');
    expect(decoded.exp - decoded.iat).toBe(10 * 60);
  });
});

describe('verifyRPToken middleware', () => {
  it('BE-U-014 rejects a user access token (type != rp)', () => {
    const userToken = issueToken('user-1', 'a@b.com');
    const req  = { id: 'r1', headers: { authorization: `Bearer ${userToken}` } };
    const res  = mockRes();
    const next = jest.fn();

    verifyRPToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error.code).toBe('TOKEN_INVALID');
  });

  it('BE-U-015 returns 401 when Authorization header is missing', () => {
    const req  = { id: 'r2', headers: {} };
    const res  = mockRes();
    const next = jest.fn();

    verifyRPToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('attaches req.rp and calls next() for a valid RP token', () => {
    const token = issueRPToken('rp-123', 'cid-456');
    const req   = { id: 'r3', headers: { authorization: `Bearer ${token}` } };
    const res   = mockRes();
    const next  = jest.fn();

    verifyRPToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.rp).toEqual({ id: 'rp-123', clientId: 'cid-456' });
  });

  it('returns 401 for an expired RP token', () => {
    const expired = jwt.sign({ sub: 'rp-1', clientId: 'c1', type: 'rp' }, JWT_SECRET, { expiresIn: -1 });
    const req  = { id: 'r4', headers: { authorization: `Bearer ${expired}` } };
    const res  = mockRes();
    const next = jest.fn();

    verifyRPToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].error.code).toBe('TOKEN_EXPIRED');
  });
});
