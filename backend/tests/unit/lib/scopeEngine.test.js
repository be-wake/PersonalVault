'use strict';

// BE-U-026 through BE-U-033

const {
  projectForScopes,
  partitionByRPAllowlist,
} = require('../../../src/lib/scopeEngine');

const sampleVault = {
  identity: {
    first_name:    'Alice',
    last_name:     'Smith',
    email_primary: 'alice@example.com',
    date_of_birth: '1990-07-15',
    id_type:       'passport',
    id_number:     'AB1234567',
  },
  address: {
    line1: '123 Main St',
    city:  'Mumbai',
    state: 'MH',
    postal: '400001',
    country: 'IN',
  },
  contacts: {
    phone_primary: '+919876543210',
    phone_type:    'mobile',
  },
};

describe('projectForScopes', () => {
  it('BE-U-026 returns only fields in granted scopes', () => {
    const result = projectForScopes(sampleVault, ['identity:name']);
    expect(result.identity).toHaveProperty('first_name', 'Alice');
    expect(result.identity).toHaveProperty('last_name', 'Smith');
    expect(result.identity).not.toHaveProperty('email_primary');
    expect(result.identity).not.toHaveProperty('date_of_birth');
  });

  it('BE-U-027 PARTIAL masking hides DOB middle digits (YYYY-**-**)', () => {
    const result = projectForScopes(sampleVault, ['identity:dob']);
    expect(result.identity.date_of_birth).toBe('1990-**-**');
  });

  it('BE-U-028 PARTIAL masking shows only last 4 digits of phone', () => {
    const result = projectForScopes(sampleVault, ['contacts:phone']);
    expect(result.contacts.phone_primary).toBe('****3210');
  });

  it('BE-U-029 FULL masking returns { present: true } for non-null fields', () => {
    const result = projectForScopes(
      sampleVault,
      ['identity:name'],
      { 'identity:name': 'FULL' },
    );
    expect(result.identity.first_name).toEqual({ present: true });
    expect(result.identity.last_name).toEqual({ present: true });
  });

  it('BE-U-030 FULL masking returns { present: false } for null fields', () => {
    const vaultWithNull = {
      identity: { first_name: null, last_name: 'Smith' },
    };
    const result = projectForScopes(
      vaultWithNull,
      ['identity:name'],
      { 'identity:name': 'FULL' },
    );
    expect(result.identity.first_name).toEqual({ present: false });
    expect(result.identity.last_name).toEqual({ present: true });
  });

  it('BE-U-031 HASH masking returns 64-char SHA-256 hex for a non-null field', () => {
    const result = projectForScopes(
      sampleVault,
      ['identity:name'],
      { 'identity:name': 'HASH' },
    );
    // SHA-256 hex is 64 chars
    expect(result.identity.first_name).toMatch(/^[0-9a-f]{64}$/);
  });

  it('BE-U-033 returns empty object for empty scopes array', () => {
    const result = projectForScopes(sampleVault, []);
    expect(result).toEqual({});
  });

  it('ignores unknown scopes silently', () => {
    const result = projectForScopes(sampleVault, ['identity:name', 'unknown:scope']);
    expect(result.identity).toBeDefined();
    expect(result.unknown).toBeUndefined();
  });
});

describe('partitionByRPAllowlist', () => {
  it('BE-U-032 separates requested scopes into allowed and denied buckets', () => {
    const rpAllowed = ['identity:name', 'address:current'];
    const requested = ['identity:name', 'identity:dob', 'unknown:scope'];

    const { allowed, denied } = partitionByRPAllowlist(requested, rpAllowed);

    expect(allowed).toContain('identity:name');
    expect(allowed).not.toContain('identity:dob');
    expect(denied.find(d => d.scope === 'identity:dob')).toMatchObject({ reason: 'not_permitted_for_rp' });
    expect(denied.find(d => d.scope === 'unknown:scope')).toMatchObject({ reason: 'unknown' });
  });

  it('returns all allowed when requested scopes are a subset of allowlist', () => {
    const { allowed, denied } = partitionByRPAllowlist(
      ['identity:name'],
      ['identity:name', 'address:current'],
    );
    expect(allowed).toEqual(['identity:name']);
    expect(denied).toHaveLength(0);
  });
});
