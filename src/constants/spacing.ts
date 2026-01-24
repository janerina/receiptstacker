/**
 * Design tokens: Spacing (4px grid)
 *
 * Usage:
 * - `padding: SPACING.md`
 * - `gap: SPACING.sm`
 */

export const GRID = 4 as const;

export const SPACING = {
  xs: GRID * 1, // 4
  sm: GRID * 2, // 8
  md: GRID * 4, // 16
  lg: GRID * 6, // 24
  xl: GRID * 8, // 32
  '2xl': GRID * 12, // 48
  '3xl': GRID * 16, // 64
} as const;

export type Spacing = typeof SPACING;
export type SpacingKey = keyof Spacing;
export type SpacingValue = Spacing[SpacingKey];
