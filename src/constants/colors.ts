/**
 * Design tokens: Colors
 *
 * Usage:
 * - Pick a theme: `COLORS.light` or `COLORS.dark`
 * - Use semantic colors for statuses (success/warning/error/info)
 * - Use `COLORS.chart` for charts/graphs
 */
export const COLORS = {
  common: {
    white: '#ffffff',
    black: '#000000',
  },
  brand: {
    primary: '#3b82f6',
    primaryLight: '#60a5fa',
    primaryDark: '#2563eb',
  },
  semantic: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
  light: {
    background: '#ffffff',
    surface: '#ffffff',
    text: '#111827',
    textSecondary: '#6b7280',
    textTertiary: '#9ca3af',
    border: '#e5e7eb',
    disabled: '#f3f4f6',
  },
  dark: {
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    textSecondary: '#cbd5e1',
    textTertiary: '#94a3b8',
    border: '#334155',
    disabled: '#1e293b',
  },
  chart: ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'],
} as const;

export type Colors = typeof COLORS;
export type ColorMode = keyof Pick<Colors, 'light' | 'dark'>;
export type ThemeColors = Colors[ColorMode];
export type CommonColors = Colors['common'];
export type BrandColors = Colors['brand'];
export type SemanticColors = Colors['semantic'];
export type ChartColors = Colors['chart'];
