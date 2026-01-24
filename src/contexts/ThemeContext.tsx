import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import { COLORS } from '@/constants';

/**
 * Theme preference storage key.
 */
const THEME_STORAGE_KEY = 'receiptstacker.theme' as const;

export interface ThemeContextType {
  isDark: boolean;
  colors: typeof COLORS.light | typeof COLORS.dark;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Theme provider that manages light/dark mode.
 *
 * Features:
 * - Persists user preference via AsyncStorage
 * - Falls back to OS scheme if no preference is stored
 */
export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const systemScheme = useColorScheme();
  const [storedTheme, setStoredTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const value = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (cancelled) return;

        if (value === 'light' || value === 'dark') {
          setStoredTheme(value);
        }
      } catch {
        // Non-fatal: if storage fails, app will follow system scheme.
      }
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedTheme: 'light' | 'dark' = useMemo(() => {
    if (storedTheme) return storedTheme;
    return systemScheme === 'dark' ? 'dark' : 'light';
  }, [storedTheme, systemScheme]);

  const colors = useMemo(() => COLORS[resolvedTheme], [resolvedTheme]);

  const setTheme = useCallback((theme: 'light' | 'dark') => {
    setStoredTheme(theme);
    // Fire-and-forget persistence. UI should update immediately.
    AsyncStorage.setItem(THEME_STORAGE_KEY, theme).catch(() => undefined);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  const value = useMemo<ThemeContextType>(
    () => ({
      isDark: resolvedTheme === 'dark',
      colors,
      toggleTheme,
      setTheme,
    }),
    [colors, resolvedTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
