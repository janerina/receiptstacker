import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import ReactNativeBiometrics from 'react-native-biometrics';

import { emitAuthChanged } from '@/utils/authEvents';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthContextValue extends AuthState {
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithBiometrics: () => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (user: Partial<User>) => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  children: React.ReactNode;
}

const AUTH_TOKEN_KEY = '@auth_token' as const;
const USER_KEY = '@user' as const;

const safeJsonParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [storedToken, storedUser] = await AsyncStorage.multiGet([AUTH_TOKEN_KEY, USER_KEY]).then((pairs) =>
        pairs.map(([, v]) => v),
      );

      const parsedUser = safeJsonParse<User>(storedUser);

      setToken(storedToken ?? null);
      setUser(parsedUser);
    } catch {
      setToken(null);
      setUser(null);
      setError('Failed to restore session');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await hydrate();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  const persistSession = useCallback(async (nextToken: string, nextUser: User) => {
    await AsyncStorage.multiSet([
      [AUTH_TOKEN_KEY, nextToken],
      [USER_KEY, JSON.stringify(nextUser)],
    ]);
  }, []);

  const clearSession = useCallback(async () => {
    await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, USER_KEY]);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      setError(null);

      try {
        if (!email.trim() || !password) {
          throw new Error('Email and password are required');
        }

        // Mock API.
        await new Promise<void>((resolve) => setTimeout(() => resolve(), 600));

        const nextUser: User = {
          id: String(Date.now()),
          name: 'ReceiptStacker User',
          email: email.trim(),
        };
        const nextToken = `mock_token_${Date.now()}`;

        await persistSession(nextToken, nextUser);

        setUser(nextUser);
        setToken(nextToken);

        emitAuthChanged();
      } catch (e) {
        setUser(null);
        setToken(null);
        setError(e instanceof Error ? e.message : 'Login failed');
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [persistSession],
  );

  const loginWithBiometrics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rnBiometrics = new ReactNativeBiometrics();
      const { available } = await rnBiometrics.isSensorAvailable();
      if (!available) {
        throw new Error('Biometric authentication not available');
      }

      const { success } = await rnBiometrics.simplePrompt({
        promptMessage: 'Authenticate to login',
        cancelButtonText: 'Cancel',
      });

      if (!success) {
        throw new Error('Biometric authentication failed');
      }

      // If a session exists, just re-hydrate and notify.
      await hydrate();
      const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (!storedToken) {
        throw new Error('No saved session found. Please login with email first.');
      }

      emitAuthChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Biometric login failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [hydrate]);

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      setIsLoading(true);
      setError(null);

      try {
        if (!name.trim() || !email.trim() || !password) {
          throw new Error('Name, email, and password are required');
        }

        // Mock API.
        await new Promise<void>((resolve) => setTimeout(() => resolve(), 700));

        const nextUser: User = {
          id: String(Date.now()),
          name: name.trim(),
          email: email.trim(),
        };
        const nextToken = `mock_token_${Date.now()}`;

        await persistSession(nextToken, nextUser);

        setUser(nextUser);
        setToken(nextToken);
        emitAuthChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Signup failed');
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [persistSession],
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await clearSession();
      setUser(null);
      setToken(null);
      emitAuthChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Logout failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [clearSession]);

  const updateProfile = useCallback(
    async (partial: Partial<User>) => {
      setIsLoading(true);
      setError(null);
      try {
        const current = user;
        const currentToken = token;
        if (!current || !currentToken) {
          throw new Error('Not authenticated');
        }

        const nextUser: User = { ...current, ...partial };
        await persistSession(currentToken, nextUser);
        setUser(nextUser);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update profile');
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [persistSession, token, user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token),
      isLoading,
      error,
      login,
      loginWithBiometrics,
      signup,
      logout,
      updateProfile,
      clearError: () => setError(null),
    }),
    [error, isLoading, login, loginWithBiometrics, logout, signup, token, updateProfile, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
