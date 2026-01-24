import {
  COLORS,
  GRADIENTS,
  ICON_SIZES,
  RADIUS,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
  COMPONENT_SIZES,
} from '@/constants';

/**
 * App theme mode.
 */
export type ThemeMode = 'light' | 'dark';

/**
 * Theme colors surface.
 *
 * Includes:
 * - Mode-specific base colors (`background`, `text`, etc.)
 * - Brand colors (`primary*`)
 * - Semantic colors (`success`, `error`, etc.)
 */
type ModeColors = typeof COLORS.light | typeof COLORS.dark;

export type ThemeColors =
  & ModeColors
  & typeof COLORS.common
  & typeof COLORS.brand
  & typeof COLORS.semantic;

/**
 * Full theme object used by components.
 */
export interface Theme {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  chartColors: typeof COLORS.chart;
  spacing: typeof SPACING;
  radius: typeof RADIUS;
  shadows: typeof SHADOWS;
  gradients: typeof GRADIENTS;
  typography: typeof TYPOGRAPHY;
  iconSizes: typeof ICON_SIZES;
  componentSizes: typeof COMPONENT_SIZES;
}

/**
 * Creates a theme from the provided mode.
 */
export const createTheme = (mode: ThemeMode): Theme => {
  const base = COLORS[mode];

  return {
    mode,
    isDark: mode === 'dark',
    colors: {
      ...base,
      ...COLORS.common,
      ...COLORS.brand,
      ...COLORS.semantic,
    } as ThemeColors,
    chartColors: COLORS.chart,
    spacing: SPACING,
    radius: RADIUS,
    shadows: SHADOWS,
    gradients: GRADIENTS,
    typography: TYPOGRAPHY,
    iconSizes: ICON_SIZES,
    componentSizes: COMPONENT_SIZES,
  };
};
