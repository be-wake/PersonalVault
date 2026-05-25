'use strict';

// BE-U-016 through BE-U-017

const { z }        = require('zod');
const { validate } = require('../../../src/middleware/validate');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

const emailBodySchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
});

describe('validate middleware', () => {
  it('BE-U-016 returns 400 with issues array when body schema fails', () => {
    const middleware = validate({ body: emailBodySchema });
    const req  = { id: 'r1', body: { email: 'not-an-email', password: 'short' } };
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.error.issues)).toBe(true);
    expect(body.error.issues.length).toBeGreaterThan(0);
  });

  it('BE-U-017 calls next() when all schemas pass', () => {
    const middleware = validate({ body: emailBodySchema });
    const req  = { id: 'r2', body: { email: 'alice@example.com', password: 'secure1234' } };
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('validates query params and attaches to req.validatedQuery', () => {
    const querySchema = z.object({ limit: z.coerce.number().min(1) });
    const middleware  = validate({ query: querySchema });
    const req  = { id: 'r3', query: { limit: '10' } };
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validatedQuery.limit).toBe(10);
  });

  it('returns 400 when query param is invalid', () => {
    const querySchema = z.object({ limit: z.coerce.number().min(1) });
    const middleware  = validate({ query: querySchema });
    const req  = { id: 'r4', query: { limit: '-5' } };
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
