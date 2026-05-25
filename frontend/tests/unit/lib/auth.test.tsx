'use strict';

// FE-U-009 through FE-U-016

import '@testing-library/jest-dom';
import React from 'react';
import { render, act, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('../../../src/lib/api', () => ({
  api: {
    auth: {
      me: jest.fn(),
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
    },
  },
  storeTokens: jest.fn(),
  clearTokens: jest.fn(),
}));

import { AuthProvider, AuthContext } from '../../../src/lib/auth';
import * as apiModule from '../../../src/lib/api';

const mockMe       = apiModule.api.auth.me as jest.Mock;
const mockLogin    = apiModule.api.auth.login as jest.Mock;
const mockRegister = apiModule.api.auth.register as jest.Mock;
const mockStore    = apiModule.storeTokens as jest.Mock;
const mockClear    = apiModule.clearTokens as jest.Mock;

const MOCK_USER = { id: 'u1', email: 'alice@example.com', name: 'Alice' };

function Consumer() {
  const ctx = React.useContext(AuthContext);
  return (
    <div>
      <span data-testid="user">{ctx.user?.email ?? 'null'}</span>
      <span data-testid="loading">{String(ctx.loading)}</span>
      <button onClick={() => ctx.login('alice@example.com', 'pass1')}>login</button>
      <button onClick={() => ctx.register('Alice', 'alice@example.com', 'pass1')}>register</button>
      <button onClick={() => ctx.logout()}>logout</button>
    </div>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockResolvedValue(MOCK_USER);
});

describe('AuthProvider mount', () => {
  it('FE-U-009 calls api.auth.me() on mount', async () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(mockMe).toHaveBeenCalledTimes(1));
  });

  it('FE-U-010 sets user state when me() resolves', async () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() =>
      expect(screen.getByTestId('user').textContent).toBe('alice@example.com')
    );
  });

  it('FE-U-011 calls clearTokens() and nulls user when me() rejects', async () => {
    mockMe.mockRejectedValueOnce(new Error('No session'));
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(mockClear).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('user').textContent).toBe('null');
  });

  it('FE-U-012 loading is false after me() settles', async () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() =>
      expect(screen.getByTestId('loading').textContent).toBe('false')
    );
  });
});

describe('AuthProvider login', () => {
  it('FE-U-013 login() calls api.auth.login() and storeTokens("", refreshToken)', async () => {
    mockMe.mockResolvedValue(null).mockRejectedValue(new Error('no session')).mockResolvedValueOnce(null);
    mockLogin.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: MOCK_USER });
    // me() fails so initial user is null; then we call login
    mockMe.mockRejectedValue(new Error('no session'));

    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      screen.getByRole('button', { name: 'login' }).click();
    });

    expect(mockLogin).toHaveBeenCalledWith('alice@example.com', 'pass1');
    expect(mockStore).toHaveBeenCalledWith('', 'rt');
  });

  it('FE-U-014 login() sets user in context', async () => {
    mockMe.mockRejectedValue(new Error('no session'));
    mockLogin.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: MOCK_USER });

    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      screen.getByRole('button', { name: 'login' }).click();
    });

    expect(screen.getByTestId('user').textContent).toBe('alice@example.com');
  });
});

describe('AuthProvider register', () => {
  it('FE-U-015 register() calls api.auth.register() and storeTokens', async () => {
    mockMe.mockRejectedValue(new Error('no session'));
    mockRegister.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: MOCK_USER });

    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      screen.getByRole('button', { name: 'register' }).click();
    });

    expect(mockRegister).toHaveBeenCalledWith('Alice', 'alice@example.com', 'pass1');
    expect(mockStore).toHaveBeenCalledWith('', 'rt');
  });
});

describe('AuthProvider logout', () => {
  it('FE-U-016 logout() calls clearTokens() and nulls the user', async () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('alice@example.com'));

    await act(async () => {
      screen.getByRole('button', { name: 'logout' }).click();
    });

    expect(mockClear).toHaveBeenCalled();
    expect(screen.getByTestId('user').textContent).toBe('null');
  });
});
