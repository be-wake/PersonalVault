'use strict';

// MB-I-008 through MB-I-014
// Mobile vault integration tests.
// Skipped unless TEST_API_URL + TEST_ACCESS_TOKEN + TEST_USER_ID are set.

const API_URL = process.env.TEST_API_URL;
const ACCESS_TOKEN = process.env.TEST_ACCESS_TOKEN;
const USER_ID = process.env.TEST_USER_ID;
const RUN = !!(API_URL && ACCESS_TOKEN && USER_ID);

const describeOrSkip = RUN ? describe : describe.skip;

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
  };
}

describeOrSkip('Mobile vault integration', () => {
  it('MB-I-008 GET /v1/identity/:userId returns identity', async () => {
    const res = await fetch(`${API_URL}/v1/identity/${USER_ID}`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('identity');
  });

  it('MB-I-009 PUT /v1/identity/:userId updates a field', async () => {
    const res = await fetch(`${API_URL}/v1/identity/${USER_ID}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ first_name: 'MBIntTest' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.identity.first_name).toBe('MBIntTest');
  });

  it('MB-I-010 GET /v1/address/:userId returns address or 404', async () => {
    const res = await fetch(`${API_URL}/v1/address/${USER_ID}`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status);
  });

  it('MB-I-011 GET /v1/payment/:userId/cards returns cards array', async () => {
    const res = await fetch(`${API_URL}/v1/payment/${USER_ID}/cards`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.cards)).toBe(true);
  });

  it('MB-I-012 GET /v1/contacts/:userId returns contacts', async () => {
    const res = await fetch(`${API_URL}/v1/contacts/${USER_ID}`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status);
  });

  it('MB-I-013 requests without token return 401', async () => {
    const res = await fetch(`${API_URL}/v1/identity/${USER_ID}`);
    expect(res.status).toBe(401);
  });

  it('MB-I-014 cross-user access returns 403', async () => {
    const res = await fetch(`${API_URL}/v1/identity/other-user-id`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(403);
  });
});
