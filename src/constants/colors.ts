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
  backgroundDark: '#070B14',
  surfaceDark: '#0E1624',

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
  borderDark: '#1E2A3B',
  disabled: '#cbd5e1',
  disabledDark: '#334155',

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
    background: '#070B14',
    surface: '#0E1624',
    text: '#F8FAFC',
    textSecondary: '#A7B2C3',
    textTertiary: '#6B7A90',
    border: '#1E2A3B',
    disabled: '#334155',
  },
  // Shared palette for charts and color pickers (tags/categories/budgets).
  // Kept deterministic (no random generation) so colors remain stable across sessions.
  chart: [
    // Blues / Indigos
    '#3B82F6',
    '#2563EB',
    '#6366F1',
    '#4F46E5',

    // Purples / Pinks
    '#8B5CF6',
    '#A855F7',
    '#EC4899',
    '#F43F5E',

    // Warm accents
    '#F97316',
    '#F59E0B',
    '#EAB308',

    // Greens / Teals
    '#22C55E',
    '#10B981',
    '#14B8A6',
    '#06B6D4',

    // Neutral
    '#64748B',
  ],
} as const;

export { GRADIENTS } from './gradients';

export type Colors = typeof COLORS;
export type ColorMode = keyof Pick<Colors, 'light' | 'dark'>;
export type ThemeColors = Colors[ColorMode];
export type CommonColors = Colors['common'];
export type BrandColors = Colors['brand'];
export type SemanticColors = Colors['semantic'];
export type ChartColors = Colors['chart'];
