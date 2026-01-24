/**
 * Design tokens: Border Radius
 *
 * Usage:
 * - `borderRadius: RADIUS.md`
 * - `borderRadius: RADIUS.full` for pills/circles
 */

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export type Radius = typeof RADIUS;
export type RadiusKey = keyof Radius;
export type RadiusValue = Radius[RadiusKey];
