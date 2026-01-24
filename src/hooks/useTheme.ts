import { useContext } from 'react';

import { ThemeContext, type ThemeContextType } from '@/contexts/ThemeContext';

/**
 * Hook to access the app theme (light/dark) from `ThemeProvider`.
 *
 * @throws If used outside of `ThemeProvider`.
 */
export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};
