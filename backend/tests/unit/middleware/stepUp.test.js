'use strict';

// BE-U-009 through BE-U-012
// env.js sets STEPUP_ENFORCED=true so requireStepUp actually enforces.

const jwt = require('jsonwebtoken');
const { issueToken } = require('../../../src/middleware/auth');
const { issueStepUpToken, requireStepUp } = require('../../../src/middleware/stepUp');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

function authedReq(userId, extraHeaders = {}) {
  return {
    id:      'test-req',
    path:    '/test',
    headers: extraHeaders,
    user:    { sub: userId },
  };
}

describe('issueStepUpToken', () => {
  it('BE-U-009 includes hashed intent and 5-minute expiry', () => {
    const token   = issueStepUpToken('user-1', 'consent:grant', 'password');
    const decoded = jwt.decode(token);

    expect(decoded.type).toBe('stepup');
    expect(decoded.sub).toBe('user-1');
    expect(decoded.factor).toBe('password');
    // intent is stored as a 24-char hex hash, not the raw string
    expect(decoded.intent).toMatch(/^[0-9a-f]{24}$/);
    // TTL should be 5 minutes
    expect(decoded.exp - decoded.iat).toBe(5 * 60);
  });
});

describe('requireStepUp middleware (STEPUP_ENFORCED=true)', () => {
  const intent = 'consent:grant';

  it('BE-U-010 returns 401 when X-PDV-Stepup header is missing', () => {
    const middleware = requireStepUp(intent);
    const req  = authedReq('user-1');
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error.code).toBe('STEPUP_REQUIRED');
  });

  it('BE-U-011 rejects step-up token issued for a different intent', () => {
    // Token for 'consent:revoke' presented to 'consent:grant' middleware
    const wrongIntentToken = issueStepUpToken('user-1', 'consent:revoke', 'password');
    const middleware       = requireStepUp(intent);
    const req  = authedReq('user-1', { 'x-pdv-stepup': wrongIntentToken });
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error.code).toBe('STEPUP_INVALID');
  });

  it('BE-U-012 rejects an expired step-up token', () => {
    const { STEPUP_SECRET } = (() => {
      // Read the secret via the same env var the module used
      const secret = process.env.STEPUP_SECRET;
      return { STEPUP_SECRET: secret };
    })();

    const crypto = require('crypto');
    const intentHash = crypto.createHash('sha256').update(intent).digest('hex').slice(0, 24);
    const expiredToken = jwt.sign(
      { sub: 'user-1', intent: intentHash, factor: 'password', type: 'stepup' },
      STEPUP_SECRET,
      { expiresIn: -1 },
    );

    const middleware = requireStepUp(intent);
    const req  = authedReq('user-1', { 'x-pdv-stepup': expiredToken });
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error.code).toBe('STEPUP_INVALID');
  });

  it('calls next() when a valid step-up token matches intent and user', () => {
    const userId    = 'user-99';
    const token     = issueStepUpToken(userId, intent, 'password');
    const middleware = requireStepUp(intent);
    const req  = authedReq(userId, { 'x-pdv-stepup': token });
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
