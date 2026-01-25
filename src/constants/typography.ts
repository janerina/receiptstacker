import { Platform, type TextStyle } from 'react-native';

/**
 * Design tokens: Typography
 *
 * Notes:
 * - Font sizes and weights are intentionally limited per spec.
 * - Presets are safe to spread into React Native `Text` styles.
 */

export const FONT_SIZES = {
  12: 12,
  13: 13,
  14: 14,
  15: 15,
  16: 16,
  18: 18,
  20: 20,
  22: 22,
  24: 24,
  28: 28,
  30: 30,
  36: 36,
} as const;

export type FontSize = keyof typeof FONT_SIZES;

export const LINE_HEIGHTS = {
  12: 16,
  13: 18,
  14: 20,
  15: 22,
  16: 24,
  18: 28,
  20: 28,
  22: 30,
  24: 32,
  28: 34,
  30: 36,
  36: 40,
} as const;

export type LineHeight = (typeof LINE_HEIGHTS)[FontSize];

/**
 * React Native expects `fontWeight` as a string.
 * Values are restricted to the allowed weights.
 */
export const FONT_WEIGHTS = {
  300: '300',
  400: '400',
  500: '500',
  600: '600',
  700: '700',
} as const;

export type FontWeight = (typeof FONT_WEIGHTS)[keyof typeof FONT_WEIGHTS];

export type TypographyPreset = Readonly<Pick<TextStyle, 'fontFamily' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'letterSpacing'>>;

const DEFAULT_FONT_FAMILY = Platform.select({ ios: 'System', android: 'sans-serif' }) as string | undefined;

/**
 * Common typography presets.
 *
 * Usage:
 * `style={[TYPOGRAPHY.pageTitle, { color: theme.text }]}`
 */
export const TYPOGRAPHY = {
  pageTitle: {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: FONT_SIZES[24],
    fontWeight: FONT_WEIGHTS[500],
    lineHeight: LINE_HEIGHTS[24],
    letterSpacing: -0.2,
  },
  sectionHeading: {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: FONT_SIZES[20],
    fontWeight: FONT_WEIGHTS[500],
    lineHeight: LINE_HEIGHTS[20],
    letterSpacing: -0.1,
  },
  cardTitle: {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: FONT_SIZES[16],
    fontWeight: FONT_WEIGHTS[500],
    lineHeight: LINE_HEIGHTS[16],
    letterSpacing: 0,
  },
  bodyLarge: {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: FONT_SIZES[16],
    fontWeight: FONT_WEIGHTS[400],
    lineHeight: LINE_HEIGHTS[16],
    letterSpacing: 0,
  },
  bodyNormal: {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: FONT_SIZES[15],
    fontWeight: FONT_WEIGHTS[400],
    lineHeight: LINE_HEIGHTS[15],
    letterSpacing: 0,
  },
  bodySmall: {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: FONT_SIZES[13],
    fontWeight: FONT_WEIGHTS[400],
    lineHeight: LINE_HEIGHTS[13],
    letterSpacing: 0,
  },
  caption: {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: FONT_SIZES[12],
    fontWeight: FONT_WEIGHTS[400],
    lineHeight: LINE_HEIGHTS[12],
    letterSpacing: 0,
  },
  buttonText: {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: FONT_SIZES[15],
    fontWeight: FONT_WEIGHTS[500],
    lineHeight: LINE_HEIGHTS[15],
    letterSpacing: 0.2,
  },
  label: {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: FONT_SIZES[13],
    fontWeight: FONT_WEIGHTS[500],
    lineHeight: LINE_HEIGHTS[13],
    letterSpacing: 0,
  },
} as const satisfies Record<string, TypographyPreset>;

export type Typography = typeof TYPOGRAPHY;
