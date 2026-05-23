'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  createElement,
  type ReactNode,
} from 'react';
import type { User } from './api';
import { auth as authApi, storeTokens, clearTokens } from './api';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Alias — protected layout uses this to read user/loading */
export function useAuthState(): AuthState {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // S1 — the access token now lives in an httpOnly cookie, invisible to JS.
    // We always call /auth/me to check session state; if the cookie is absent or
    // expired the backend returns 401 and we clear any stale client state.
    authApi
      .me()
      .then(({ user: u }) => setUser(u))
      .catch(() => {
        clearTokens();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { refreshToken, user: u } = await authApi.login(email, password);
    // S1 — access token is now set as an httpOnly cookie by the backend.
    // We still persist the refresh token in localStorage as a fallback for
    // the /auth/refresh body-param path (mobile parity).
    storeTokens('', refreshToken);
    setUser(u);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { refreshToken, user: u } = await authApi.register(name, email, password);
    storeTokens('', refreshToken);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    // clearTokens() calls POST /auth/logout to clear the httpOnly cookies.
    clearTokens();
    setUser(null);
  }, []);

  return createElement(
    AuthContext.Provider,
    { value: { user, loading, login, register, logout } },
    children
  );
}
