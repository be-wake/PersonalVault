'use strict';

// FE-I-011 through FE-I-015
// Consent flow integration tests.
// Require a running API with RP data seeded — skipped otherwise.

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.TEST_API_URL;
const INT_ACCESS_TOKEN = process.env.TEST_ACCESS_TOKEN;
const INT_USER_ID = process.env.TEST_USER_ID;
const INT_RP_ID = process.env.TEST_RP_ID;
const RUN = !!(API_URL && INT_ACCESS_TOKEN && INT_USER_ID && INT_RP_ID);

const describeOrSkip = RUN ? describe : describe.skip;

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${INT_ACCESS_TOKEN}`,
  };
}

describeOrSkip('Consents integration', () => {
  let createdGrantId: string;

  it('FE-I-011 GET /v1/consents/:userId returns grants array', async () => {
    const res = await fetch(`${API_URL}/v1/consents/${INT_USER_ID}`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.grants)).toBe(true);
  });

  it('FE-I-012 POST /v1/consents creates a new grant', async () => {
    const res = await fetch(`${API_URL}/v1/consents`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        relyingPartyId: INT_RP_ID,
        scopes: ['identity:name'],
        purpose: 'Integration test grant',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.grant).toHaveProperty('id');
    expect(body.grant.status).toBe('ACTIVE');
    createdGrantId = body.grant.id;
  });

  it('FE-I-013 GET /v1/consents/:userId/:grantId returns the specific grant', async () => {
    if (!createdGrantId) return;
    const res = await fetch(
      `${API_URL}/v1/consents/${INT_USER_ID}/${createdGrantId}`,
      { headers: authHeaders() }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grant.id).toBe(createdGrantId);
  });

  it('FE-I-014 DELETE /v1/consents/:grantId revokes the grant', async () => {
    if (!createdGrantId) return;
    const res = await fetch(`${API_URL}/v1/consents/${createdGrantId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grant.status).toBe('REVOKED');
  });

  it('FE-I-015 GET /v1/relying-parties returns RP list', async () => {
    const res = await fetch(`${API_URL}/v1/relying-parties`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.relyingParties)).toBe(true);
  });
});
