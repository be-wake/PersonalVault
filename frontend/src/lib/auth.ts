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
import { api, storeTokens, clearTokens } from './api';

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

export function useAuthState(): AuthState {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verify the session cookie on mount; clear stale state if it's expired.
    api.auth
      .me()
      .then((u) => setUser(u))
      .catch(() => {
        clearTokens();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { refreshToken, user: u } = await api.auth.login(email, password);
    // Access token is in the httpOnly cookie; persist refresh token as fallback.
    storeTokens('', refreshToken);
    setUser(u);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { refreshToken, user: u } = await api.auth.register(name, email, password);
    storeTokens('', refreshToken);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearTokens(); // also calls POST /auth/logout to clear httpOnly cookies
    setUser(null);
  }, []);

  return createElement(
    AuthContext.Provider,
    { value: { user, loading, login, register, logout } },
    children
  );
}
