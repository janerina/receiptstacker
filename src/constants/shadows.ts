import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';

/**
 * Design tokens: Shadows
 *
 * Platform notes:
 * - iOS uses `shadow*` props
 * - Android uses `elevation`
 *
 * Usage:
 * `style={[styles.card, SHADOWS.md]}`
 */

const SHADOW_COLOR = '#000000' as const;

const IOS = {
  sm: {
    shadowColor: SHADOW_COLOR,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  md: {
    shadowColor: SHADOW_COLOR,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  lg: {
    shadowColor: SHADOW_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  xl: {
    shadowColor: SHADOW_COLOR,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
} as const;

const ANDROID = {
  sm: { elevation: 1 },
  md: { elevation: 3 },
  lg: { elevation: 6 },
  xl: { elevation: 12 },
} as const;

const selectShadow = (key: keyof typeof IOS): ViewStyle =>
  Platform.select<ViewStyle>({
    ios: IOS[key] as unknown as ViewStyle,
    android: ANDROID[key] as unknown as ViewStyle,
    default: IOS[key] as unknown as ViewStyle,
  }) ?? (IOS[key] as unknown as ViewStyle);

export const SHADOWS = {
  sm: selectShadow('sm'),
  md: selectShadow('md'),
  lg: selectShadow('lg'),
  xl: selectShadow('xl'),
} as const;

export type Shadows = typeof SHADOWS;
export type ShadowKey = keyof Shadows;
export type ShadowStyle = Shadows[ShadowKey];
