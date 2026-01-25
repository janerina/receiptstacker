/**
 * Design tokens: Colors
 *
 * Notes:
 * - Provides Prompt-26 flat keys (e.g. `COLORS.primary`, `COLORS.surface`) for convenience.
 * - Preserves existing grouped keys (`COLORS.brand/common/semantic/light/dark`) for backwards compatibility.
 */
export const COLORS = {
  // Primary Brand Color - Blue #3b82f6
  primary: '#3b82f6',
  primaryDark: '#2563eb',
  primaryLight: '#60a5fa',

  // Backgrounds (light)
  // Use a subtle app background so screens don't look "all white".
  background: '#f8fafc',
  surface: '#ffffff',

  // Backgrounds (dark)
  backgroundDark: '#0f172a',
  surfaceDark: '#1e293b',

  // Text Colors
  text: '#0f172a',
  textDark: '#f1f5f9',
  textSecondary: '#64748b',
  textSecondaryDark: '#94a3b8',
  textTertiary: '#94a3b8',
  textTertiaryDark: '#64748b',

  // Status Colors
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  // UI Elements
  border: '#e2e8f0',
  borderDark: '#334155',
  disabled: '#cbd5e1',
  disabledDark: '#475569',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',

  // Glassmorphism
  glass: 'rgba(255, 255, 255, 0.1)',
  glassDark: 'rgba(15, 23, 42, 0.8)',

  // White/Black
  white: '#ffffff',
  black: '#000000',

  // Backwards compatible grouped structure
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
    background: '#f8fafc',
    surface: '#ffffff',
    text: '#0f172a',
    textSecondary: '#64748b',
    textTertiary: '#94a3b8',
    border: '#e2e8f0',
    disabled: '#cbd5e1',
  },
  dark: {
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    textTertiary: '#64748b',
    border: '#334155',
    disabled: '#475569',
  },
  chart: ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'],
} as const;

export { GRADIENTS } from './gradients';

export type Colors = typeof COLORS;
export type ColorMode = keyof Pick<Colors, 'light' | 'dark'>;
export type ThemeColors = Colors[ColorMode];
export type CommonColors = Colors['common'];
export type BrandColors = Colors['brand'];
export type SemanticColors = Colors['semantic'];
export type ChartColors = Colors['chart'];
