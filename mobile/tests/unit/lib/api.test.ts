'use strict';

// MB-U-001 through MB-U-008

jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn(),
  setItemAsync:    jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// Silence logger output during tests
jest.mock('../../../src/lib/logger', () => ({
  __esModule: true,
  default: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  registerShipper:   jest.fn(),
  unregisterShipper: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { storeTokens, clearTokens, auth, vault, API_URL } from '../../../src/lib/api';

const mockGet    = SecureStore.getItemAsync    as jest.Mock;
const mockSet    = SecureStore.setItemAsync    as jest.Mock;
const mockDelete = SecureStore.deleteItemAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue(null);
});

// ── storeTokens / clearTokens ─────────────────────────────────────────────────

describe('storeTokens', () => {
  it('MB-U-001 writes accessToken and refreshToken to SecureStore', async () => {
    await storeTokens('access-tok', 'refresh-tok');
    expect(mockSet).toHaveBeenCalledWith('pdv_token', 'access-tok');
    expect(mockSet).toHaveBeenCalledWith('pdv_refresh_token', 'refresh-tok');
  });

  it('MB-U-002 skips refresh token write when refreshToken is null', async () => {
    await storeTokens('access-tok', null);
    expect(mockSet).toHaveBeenCalledWith('pdv_token', 'access-tok');
    const calls = mockSet.mock.calls.map((c: string[]) => c[0]);
    expect(calls).not.toContain('pdv_refresh_token');
  });
});

describe('clearTokens', () => {
  it('MB-U-003 deletes both token keys from SecureStore', async () => {
    await clearTokens();
    expect(mockDelete).toHaveBeenCalledWith('pdv_token');
    expect(mockDelete).toHaveBeenCalledWith('pdv_refresh_token');
  });
});

// ── request — Bearer header ───────────────────────────────────────────────────

describe('api request basics', () => {
  it('MB-U-004 attaches Authorization: Bearer when a token is stored', async () => {
    mockGet.mockResolvedValue('stored-access-token');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: '1', email: 'a@b.com', name: 'A' } }),
    }) as typeof fetch;

    await auth.me();

    const [, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer stored-access-token');
  });

  it('MB-U-005 throws with error.code on API error', async () => {
    mockGet.mockResolvedValue('token');
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'TOKEN_EXPIRED', message: 'Expired' } }),
    }) as typeof fetch;

    await expect(auth.me()).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });
});

// ── refresh-and-retry ─────────────────────────────────────────────────────────

describe('api 401 refresh-and-retry', () => {
  it('MB-U-006 retries after a successful token refresh', async () => {
    let vaultCalls = 0;
    mockGet.mockResolvedValue('old-token');

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ accessToken: 'new-token' }),
        });
      }
      vaultCalls++;
      if (vaultCalls === 1) {
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

    await vault.getIdentity('u1');
    expect(vaultCalls).toBe(2);
  });

  it('MB-U-007 does not retry when stored refreshToken is null', async () => {
    mockGet.mockResolvedValueOnce('access-tok').mockResolvedValueOnce(null);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'TOKEN_EXPIRED', message: '' } }),
    }) as typeof fetch;

    await expect(vault.getIdentity('u1')).rejects.toMatchObject({ status: 401 });
    // only the initial request should have been made — no refresh
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
  });

  it('MB-U-008 concurrent 401s share a single inflightRefresh', async () => {
    let refreshCount = 0;
    mockGet.mockResolvedValue('old-tok');

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/auth/refresh')) {
        refreshCount++;
        return new Promise<Response>((r) =>
          setTimeout(
            () => r({ ok: true, json: async () => ({ accessToken: 'new' }) } as Response),
            5
          )
        );
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'TOKEN_EXPIRED', message: '' } }),
      });
    }) as typeof fetch;

    await Promise.allSettled([vault.getIdentity('u1'), vault.getIdentity('u2')]);
    expect(refreshCount).toBe(1);
  });
});
