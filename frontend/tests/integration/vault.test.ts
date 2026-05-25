'use strict';

// FE-I-006 through FE-I-010
// Vault data integration tests.
// Require a running API and a seeded user — skipped otherwise.

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.TEST_API_URL;
const INT_ACCESS_TOKEN = process.env.TEST_ACCESS_TOKEN;
const INT_USER_ID = process.env.TEST_USER_ID;
const RUN = !!(API_URL && INT_ACCESS_TOKEN && INT_USER_ID);

const describeOrSkip = RUN ? describe : describe.skip;

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${INT_ACCESS_TOKEN}`,
  };
}

describeOrSkip('Vault integration', () => {
  it('FE-I-006 GET /v1/identity/:userId returns identity data', async () => {
    const res = await fetch(`${API_URL}/v1/identity/${INT_USER_ID}`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('identity');
  });

  it('FE-I-007 PUT /v1/identity/:userId updates identity', async () => {
    const res = await fetch(`${API_URL}/v1/identity/${INT_USER_ID}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ first_name: 'IntTest' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.identity.first_name).toBe('IntTest');
  });

  it('FE-I-008 GET /v1/address/:userId returns address data', async () => {
    const res = await fetch(`${API_URL}/v1/address/${INT_USER_ID}`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status);
  });

  it('FE-I-009 GET /v1/payment/:userId/cards returns card list', async () => {
    const res = await fetch(`${API_URL}/v1/payment/${INT_USER_ID}/cards`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.cards)).toBe(true);
  });

  it('FE-I-010 unauthorized request returns 401', async () => {
    const res = await fetch(`${API_URL}/v1/identity/${INT_USER_ID}`);
    expect(res.status).toBe(401);
  });
});
