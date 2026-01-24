import React, { createContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import type { Theme, ThemeMode } from './theme';
import { createTheme } from './theme';

export interface ThemeProviderProps {
  children: React.ReactNode;
  /**
   * When provided, overrides system color scheme.
   * If omitted, the provider follows the OS color scheme.
   */
  mode?: ThemeMode;
}

export interface ThemeContextValue {
  theme: Theme;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Provides the ReceiptStacker theme to the component tree.
 *
 * Usage:
 * `
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 * `
 */
export const ThemeProvider = ({ children, mode }: ThemeProviderProps) => {
  const systemScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (systemScheme === 'dark' ? 'dark' : 'light');

  const theme = useMemo(() => createTheme(resolvedMode), [resolvedMode]);

  return <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>;
};
