'use strict';

// FE-U-001 through FE-U-008

import '@testing-library/jest-dom';
import { storeTokens, clearTokens, api } from '../../../src/lib/api';

const BASE_URL = 'http://localhost:4000';

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  // Reset the module-level inflightRefresh by reloading (not needed — it resets per .finally())
});

// ── storeTokens ───────────────────────────────────────────────────────────────

describe('storeTokens', () => {
  it('FE-U-001 stores refreshToken in localStorage', () => {
    storeTokens('', 'my-refresh-token');
    expect(localStorage.getItem('pdv_refresh_token')).toBe('my-refresh-token');
  });

  it('FE-U-002 is a no-op when refreshToken is null', () => {
    storeTokens('', null);
    expect(localStorage.getItem('pdv_refresh_token')).toBeNull();
  });
});

// ── clearTokens ───────────────────────────────────────────────────────────────

describe('clearTokens', () => {
  it('FE-U-003 removes pdv_refresh_token and pdv_user from localStorage', () => {
    localStorage.setItem('pdv_refresh_token', 'old-tok');
    localStorage.setItem('pdv_user', '{"id":"1"}');
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    clearTokens();

    expect(localStorage.getItem('pdv_refresh_token')).toBeNull();
    expect(localStorage.getItem('pdv_user')).toBeNull();
  });

  it('FE-U-004 fires a fire-and-forget POST /auth/logout', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as typeof fetch;
    clearTokens();
    await new Promise((r) => setTimeout(r, 0)); // let the micro-task settle
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/logout'),
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
  });
});

// ── request — credentials ─────────────────────────────────────────────────────

describe('api request basics', () => {
  it('FE-U-005 sends credentials:include on every request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: '1', email: 'a@b.com', name: 'Alice' } }),
    }) as typeof fetch;

    await api.auth.me();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('FE-U-006 throws an error with error.code on API error response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'No session' } }),
    }) as typeof fetch;

    await expect(api.auth.me()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// ── request — 401 retry ───────────────────────────────────────────────────────

describe('api 401 refresh-and-retry', () => {
  it('FE-U-007 retries once on 401 for non-auth routes after a successful refresh', async () => {
    let vaultCallCount = 0;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/auth/refresh')) {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      vaultCallCount++;
      if (vaultCallCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ error: { code: 'TOKEN_EXPIRED', message: 'Expired' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ identity: { first_name: 'Alice' } }),
      });
    }) as typeof fetch;

    await api.vault.getIdentity('user-1');
    expect(vaultCallCount).toBe(2);
  });

  it('FE-U-008 concurrent 401s share a single inflightRefresh call', async () => {
    let refreshCount = 0;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/auth/refresh')) {
        refreshCount++;
        return new Promise((r) =>
          setTimeout(
            () => r({ ok: true, json: async () => ({}) } as Response),
            5
          )
        );
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'TOKEN_EXPIRED', message: 'Expired' } }),
      });
    }) as typeof fetch;

    await Promise.allSettled([
      api.vault.getIdentity('user-1'),
      api.vault.getIdentity('user-2'),
    ]);

    expect(refreshCount).toBe(1);
  });
});
