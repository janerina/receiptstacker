import type { TextStyle } from 'react-native';

/**
 * Design tokens: Typography
 *
 * Notes:
 * - Font sizes and weights are intentionally limited per spec.
 * - Presets are safe to spread into React Native `Text` styles.
 */

export const FONT_SIZES = {
  12: 12,
  14: 14,
  16: 16,
  18: 18,
  20: 20,
  24: 24,
  30: 30,
  36: 36,
} as const;

export type FontSize = keyof typeof FONT_SIZES;

export const LINE_HEIGHTS = {
  12: 16,
  14: 20,
  16: 24,
  18: 28,
  20: 28,
  24: 32,
  30: 36,
  36: 40,
} as const;

export type LineHeight = (typeof LINE_HEIGHTS)[FontSize];

/**
 * React Native expects `fontWeight` as a string.
 * Values are restricted to the allowed weights.
 */
export const FONT_WEIGHTS = {
  400: '400',
  500: '500',
  600: '600',
  700: '700',
} as const;

export type FontWeight = (typeof FONT_WEIGHTS)[keyof typeof FONT_WEIGHTS];

export type TypographyPreset = Readonly<Pick<TextStyle, 'fontSize' | 'fontWeight' | 'lineHeight' | 'letterSpacing'>>;

/**
 * Common typography presets.
 *
 * Usage:
 * `style={[TYPOGRAPHY.pageTitle, { color: theme.text }]}`
 */
export const TYPOGRAPHY = {
  pageTitle: {
    fontSize: FONT_SIZES[30],
    fontWeight: FONT_WEIGHTS[700],
    lineHeight: LINE_HEIGHTS[30],
    letterSpacing: -0.5,
  },
  sectionHeading: {
    fontSize: FONT_SIZES[24],
    fontWeight: FONT_WEIGHTS[600],
    lineHeight: LINE_HEIGHTS[24],
    letterSpacing: -0.5,
  },
  cardTitle: {
    fontSize: FONT_SIZES[18],
    fontWeight: FONT_WEIGHTS[600],
    lineHeight: LINE_HEIGHTS[18],
    letterSpacing: 0,
  },
  bodyLarge: {
    fontSize: FONT_SIZES[18],
    fontWeight: FONT_WEIGHTS[400],
    lineHeight: LINE_HEIGHTS[18],
    letterSpacing: 0,
  },
  bodyNormal: {
    fontSize: FONT_SIZES[16],
    fontWeight: FONT_WEIGHTS[400],
    lineHeight: LINE_HEIGHTS[16],
    letterSpacing: 0,
  },
  bodySmall: {
    fontSize: FONT_SIZES[14],
    fontWeight: FONT_WEIGHTS[400],
    lineHeight: LINE_HEIGHTS[14],
    letterSpacing: 0,
  },
  caption: {
    fontSize: FONT_SIZES[12],
    fontWeight: FONT_WEIGHTS[400],
    lineHeight: LINE_HEIGHTS[12],
    letterSpacing: 0,
  },
  buttonText: {
    fontSize: FONT_SIZES[16],
    fontWeight: FONT_WEIGHTS[600],
    lineHeight: LINE_HEIGHTS[16],
    letterSpacing: 0.5,
  },
  label: {
    fontSize: FONT_SIZES[14],
    fontWeight: FONT_WEIGHTS[500],
    lineHeight: LINE_HEIGHTS[14],
    letterSpacing: 0,
  },
} as const satisfies Record<string, TypographyPreset>;

export type Typography = typeof TYPOGRAPHY;
