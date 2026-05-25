'use strict';

// MB-U-009 through MB-U-016

jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn(),
  setItemAsync:    jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/lib/api', () => ({
  auth: {
    me:       jest.fn(),
    login:    jest.fn(),
    register: jest.fn(),
  },
  storeTokens: jest.fn().mockResolvedValue(undefined),
  clearTokens: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/lib/logger', () => ({
  __esModule: true,
  default: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../../../src/lib/auth';
import * as apiModule from '../../../src/lib/api';
import * as SecureStore from 'expo-secure-store';

const mockMe       = apiModule.auth.me as jest.Mock;
const mockLogin    = apiModule.auth.login as jest.Mock;
const mockRegister = apiModule.auth.register as jest.Mock;
const mockStore    = apiModule.storeTokens as jest.Mock;
const mockClear    = apiModule.clearTokens as jest.Mock;
const mockGet      = SecureStore.getItemAsync as jest.Mock;

const MOCK_USER = { id: 'u1', email: 'alice@example.com', name: 'Alice' };

function Consumer({ onCtx }: { onCtx: (ctx: ReturnType<typeof useAuth>) => void }) {
  const ctx = useAuth();
  onCtx(ctx);
  return null;
}

function renderWithProvider() {
  let capturedCtx!: ReturnType<typeof useAuth>;
  const utils = render(
    <AuthProvider>
      <Consumer onCtx={(c) => { capturedCtx = c; }} />
    </AuthProvider>
  );
  return { utils, getCtx: () => capturedCtx };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('AuthProvider — session restore', () => {
  it('MB-U-009 restores session when a token is stored and me() succeeds', async () => {
    mockGet.mockResolvedValue('stored-token');
    mockMe.mockResolvedValue({ user: MOCK_USER });

    const { getCtx } = renderWithProvider();
    await waitFor(() => expect(getCtx().isLoading).toBe(false));
    expect(getCtx().user?.email).toBe('alice@example.com');
  });

  it('MB-U-010 user is null when no token stored', async () => {
    mockGet.mockResolvedValue(null);

    const { getCtx } = renderWithProvider();
    await waitFor(() => expect(getCtx().isLoading).toBe(false));
    expect(getCtx().user).toBeNull();
  });

  it('MB-U-011 calls clearTokens() when me() fails during restore', async () => {
    mockGet.mockResolvedValue('bad-token');
    mockMe.mockRejectedValue(new Error('Expired'));

    const { getCtx } = renderWithProvider();
    await waitFor(() => expect(getCtx().isLoading).toBe(false));
    expect(mockClear).toHaveBeenCalled();
    expect(getCtx().user).toBeNull();
  });

  it('MB-U-012 isLoading starts true and becomes false after restore', async () => {
    mockGet.mockResolvedValue(null);

    let wasLoadingAtFirst = false;
    render(
      <AuthProvider>
        <Consumer
          onCtx={(c) => {
            if (c.isLoading) wasLoadingAtFirst = true;
          }}
        />
      </AuthProvider>
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(wasLoadingAtFirst).toBe(true);
  });
});

describe('AuthProvider — login', () => {
  it('MB-U-013 login() calls auth.login() and storeTokens()', async () => {
    mockGet.mockResolvedValue(null);
    mockLogin.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: MOCK_USER });

    const { getCtx } = renderWithProvider();
    await waitFor(() => expect(getCtx().isLoading).toBe(false));

    await act(async () => { await getCtx().login('alice@example.com', 'pass1'); });

    expect(mockLogin).toHaveBeenCalledWith('alice@example.com', 'pass1');
    expect(mockStore).toHaveBeenCalledWith('at', 'rt');
  });

  it('MB-U-014 login() sets user in context', async () => {
    mockGet.mockResolvedValue(null);
    mockLogin.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: MOCK_USER });

    const { getCtx } = renderWithProvider();
    await waitFor(() => expect(getCtx().isLoading).toBe(false));

    await act(async () => { await getCtx().login('alice@example.com', 'pass1'); });
    expect(getCtx().user?.email).toBe('alice@example.com');
  });
});

describe('AuthProvider — register', () => {
  it('MB-U-015 register() calls auth.register() and storeTokens()', async () => {
    mockGet.mockResolvedValue(null);
    mockRegister.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: MOCK_USER });

    const { getCtx } = renderWithProvider();
    await waitFor(() => expect(getCtx().isLoading).toBe(false));

    await act(async () => { await getCtx().register('Alice', 'alice@example.com', 'pass1'); });

    expect(mockRegister).toHaveBeenCalledWith('Alice', 'alice@example.com', 'pass1');
    expect(mockStore).toHaveBeenCalledWith('at', 'rt');
  });
});

describe('AuthProvider — logout', () => {
  it('MB-U-016 logout() calls clearTokens() and nulls user', async () => {
    mockGet.mockResolvedValue('tok');
    mockMe.mockResolvedValue({ user: MOCK_USER });

    const { getCtx } = renderWithProvider();
    await waitFor(() => expect(getCtx().user?.email).toBe('alice@example.com'));

    await act(async () => { await getCtx().logout(); });

    expect(mockClear).toHaveBeenCalled();
    expect(getCtx().user).toBeNull();
  });
});
