'use strict';

// MB-I-001 through MB-I-007
// Mobile auth integration tests against a live API.
// Skipped unless EXPO_PUBLIC_API_URL or TEST_API_URL is set.

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.TEST_API_URL ||
  'https://pdv-api.niceground-cc94fda7.eastus.azurecontainerapps.io';
const RUN = !!process.env.TEST_API_URL;

const describeOrSkip = RUN ? describe : describe.skip;

describeOrSkip('Mobile auth integration', () => {
  const email = `mbtest+${Date.now()}@example.com`;
  const password = 'MobileTest1';
  let accessToken: string;
  let refreshToken: string;

  it('MB-I-001 POST /auth/register creates account and returns tokens', async () => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'MB Int', email, password }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  });

  it('MB-I-002 POST /auth/login returns 200 and tokens', async () => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('accessToken');
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  });

  it('MB-I-003 POST /auth/login returns 401 for wrong password', async () => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'WrongPass1' }),
    });
    expect(res.status).toBe(401);
  });

  it('MB-I-004 GET /auth/me returns user profile with valid Bearer token', async () => {
    if (!accessToken) return;
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(email);
  });

  it('MB-I-005 POST /auth/refresh issues a new accessToken', async () => {
    if (!refreshToken) return;
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('accessToken');
    accessToken = body.accessToken;
  });

  it('MB-I-006 GET /auth/me returns 401 with no token', async () => {
    const res = await fetch(`${API_URL}/auth/me`);
    expect(res.status).toBe(401);
  });

  it('MB-I-007 POST /auth/register returns 409 for duplicate email', async () => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dup', email, password }),
    });
    expect(res.status).toBe(409);
  });
});
