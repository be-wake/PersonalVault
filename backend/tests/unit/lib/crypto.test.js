'use strict';

// BE-U-020 through BE-U-025
// env.js sets PDV_FIELD_KEK_BASE64 so init() uses a deterministic 32-byte key.

const cryptoLib = require('../../../src/lib/crypto');

beforeAll(async () => {
  await cryptoLib.init();
});

describe('encrypt', () => {
  it('BE-U-020 returns a string with iv and ciphertext fields (v1:iv:tag:ct)', () => {
    const result = cryptoLib.encrypt('hello world');
    expect(typeof result).toBe('string');
    const parts = result.split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
    // iv, tag and ciphertext are base64
    expect(parts[1]).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(parts[2]).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(parts[3]).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('BE-U-025 produces different ciphertext each call (random IV)', () => {
    const plaintext = 'same-input';
    const ct1 = cryptoLib.encrypt(plaintext);
    const ct2 = cryptoLib.encrypt(plaintext);
    expect(ct1).not.toBe(ct2);
  });

  it('returns the original value unchanged for null / empty string', () => {
    expect(cryptoLib.encrypt(null)).toBeNull();
    expect(cryptoLib.encrypt('')).toBe('');
    expect(cryptoLib.encrypt(undefined)).toBeUndefined();
  });
});

describe('decrypt', () => {
  it('BE-U-021 decrypt(encrypt(plaintext)) round-trips back to the original', () => {
    const plaintext  = 'sensitive data 🔒';
    const ciphertext = cryptoLib.encrypt(plaintext);
    const recovered  = cryptoLib.decrypt(ciphertext);
    expect(recovered).toBe(plaintext);
  });

  it('BE-U-022 tolerates legacy plaintext values (no v1: prefix)', () => {
    const legacyValue = 'unencrypted-legacy-string';
    expect(cryptoLib.decrypt(legacyValue)).toBe(legacyValue);
  });

  it('returns null / empty string for null / empty input', () => {
    expect(cryptoLib.decrypt(null)).toBeNull();
    expect(cryptoLib.decrypt('')).toBe('');
  });
});

describe('sha256', () => {
  it('BE-U-023 returns a 64-character hex digest', () => {
    const hash = cryptoLib.sha256('test-input');
    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same hash for the same input', () => {
    expect(cryptoLib.sha256('abc')).toBe(cryptoLib.sha256('abc'));
  });
});

describe('hmacSha256', () => {
  it('BE-U-024 returns consistent signature for the same secret and body', () => {
    const sig1 = cryptoLib.hmacSha256('secret', 'body');
    const sig2 = cryptoLib.hmacSha256('secret', 'body');
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different signatures for different secrets', () => {
    const s1 = cryptoLib.hmacSha256('secret-a', 'body');
    const s2 = cryptoLib.hmacSha256('secret-b', 'body');
    expect(s1).not.toBe(s2);
  });
});
