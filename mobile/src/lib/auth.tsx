import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { auth as authApi, User } from './api';
import createLogger from './logger';

const log = createLogger('auth');

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const TOKEN_KEY = 'pdv_token';

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from SecureStore on mount
  useEffect(() => {
    (async () => {
      log.debug('Restoring session from SecureStore…');
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (token) {
          const { user: me } = await authApi.me();
          setUser(me);
          log.info('Session restored', { userId: me.id, email: me.email });
        } else {
          log.debug('No stored token — user is signed out');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn('Session restore failed — clearing token', { error: msg });
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    log.debug('Attempting login', { email });
    try {
      const { accessToken, user: u } = await authApi.login(email, password);
      await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
      setUser(u);
      log.info('Login successful', { userId: u.id, email: u.email });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('Login failed', { email, error: msg });
      throw err;
    }
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    log.debug('Attempting registration', { email });
    try {
      const { accessToken, user: u } = await authApi.register(name, email, password);
      await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
      setUser(u);
      log.info('Registration successful', { userId: u.id, email: u.email });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('Registration failed', { email, error: msg });
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    const userId = user?.id;
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    setUser(null);
    log.info('User logged out', { userId });
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
