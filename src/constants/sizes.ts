import { GRID, SPACING } from './spacing';

/**
 * Design tokens: Sizes
 *
 * Includes:
 * - Icon sizes
 * - Component sizing (buttons, inputs, cards, etc.)
 */

export const ICON_SIZES = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 28,
  xl: 32,
  '2xl': 48,
} as const;

export type IconSizes = typeof ICON_SIZES;
export type IconSizeKey = keyof IconSizes;
export type IconSizeValue = IconSizes[IconSizeKey];

/**
 * Component sizing primitives.
 *
 * Usage:
 * - Buttons: `height: COMPONENT_SIZES.button.md.height`
 * - Inputs: `...COMPONENT_SIZES.input`
 */
export const COMPONENT_SIZES = {
  button: {
    sm: { height: 36, paddingHorizontal: SPACING.md },
    md: { height: 48, paddingHorizontal: SPACING.lg },
    lg: { height: 56, paddingHorizontal: SPACING.xl },
  },
  input: {
    height: 52,
    paddingHorizontal: SPACING.md,
    paddingVertical: GRID * 3,
  },
  card: {
    minHeight: 100,
    padding: SPACING.md,
  },
  badge: {
    sm: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm },
    md: { paddingVertical: 6, paddingHorizontal: 12 },
  },
  avatar: {
    sm: 32,
    md: 40,
    lg: 56,
    xl: 80,
  },
  iconButton: {
    sm: 32,
    md: 40,
    lg: 48,
  },
  bottomTabBar: {
    height: 80,
    scanButton: { size: 60, elevation: 24 },
  },
} as const;

export type ComponentSizes = typeof COMPONENT_SIZES;
export type ButtonSizeKey = keyof ComponentSizes['button'];
