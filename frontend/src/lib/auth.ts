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
import { auth as authApi } from './api';

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
    const token = typeof window !== 'undefined' ? localStorage.getItem('pdv_token') : null;
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then(({ user: u }) => setUser(u))
      .catch(() => {
        localStorage.removeItem('pdv_token');
        localStorage.removeItem('pdv_user');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { accessToken, user: u } = await authApi.login(email, password);
    localStorage.setItem('pdv_token', accessToken);
    localStorage.setItem('pdv_user', JSON.stringify(u));
    setUser(u);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { accessToken, user: u } = await authApi.register(name, email, password);
    localStorage.setItem('pdv_token', accessToken);
    localStorage.setItem('pdv_user', JSON.stringify(u));
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('pdv_token');
    localStorage.removeItem('pdv_user');
    setUser(null);
  }, []);

  return createElement(
    AuthContext.Provider,
    { value: { user, loading, login, register, logout } },
    children
  );
}
