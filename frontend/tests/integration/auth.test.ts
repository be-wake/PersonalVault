'use strict';

// FE-I-001 through FE-I-005
// Full auth flow integration tests.
// These require a running API at NEXT_PUBLIC_API_URL and are skipped otherwise.

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.TEST_API_URL;
const RUN = !!API_URL;

const describeOrSkip = RUN ? describe : describe.skip;

describeOrSkip('Auth integration — register / login / me', () => {
  const email = `test+${Date.now()}@example.com`;
  const password = 'Integration1';
  let refreshToken: string;

  it('FE-I-001 POST /auth/register creates an account and returns tokens', async () => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'FE Int', email, password }),
      credentials: 'include',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');
    refreshToken = body.refreshToken;
  });

  it('FE-I-002 POST /auth/register returns 409 for duplicate email', async () => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dup', email, password }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('EMAIL_TAKEN');
  });

  it('FE-I-003 POST /auth/login returns 200 with httpOnly cookie', async () => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toMatch(/pdv_session/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it('FE-I-004 POST /auth/refresh issues a new accessToken', async () => {
    if (!refreshToken) return;
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      credentials: 'include',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('accessToken');
  });

  it('FE-I-005 POST /auth/login returns 401 for wrong password', async () => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'WrongPass1' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });
});
