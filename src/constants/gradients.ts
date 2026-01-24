/**
 * Design tokens: Gradients
 *
 * Usage:
 * - With `expo-linear-gradient`:
 *   `<LinearGradient colors={GRADIENTS.primary} />`
 */

export const GRADIENTS = {
  primary: ['#3b82f6', '#2563eb'],
  success: ['#10b981', '#059669'],
  warning: ['#f59e0b', '#d97706'],
  error: ['#ef4444', '#dc2626'],
  purple: ['#8b5cf6', '#7c3aed'],
  glass: ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)'],
} as const;

export type Gradients = typeof GRADIENTS;
export type GradientKey = keyof Gradients;
export type GradientColors = Gradients[GradientKey];
