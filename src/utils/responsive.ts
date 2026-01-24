import { Dimensions, PixelRatio, Platform } from 'react-native';

import { SPACING } from '@/constants';

/**
 * Base layout size used for scaling.
 *
 * iPhone X/11 Pro width (375) is a common baseline.
 */
const GUIDELINE_BASE_WIDTH = 375;

/**
 * Current screen dimensions (window).
 */
const getWindow = () => Dimensions.get('window');

/**
 * Converts a width percentage (e.g. "50%") into dp.
 */
export const wp = (percentage: string): number => {
  const value = Number.parseFloat(percentage);
  if (Number.isNaN(value)) return 0;

  const { width } = getWindow();
  return PixelRatio.roundToNearestPixel((width * value) / 100);
};

/**
 * Converts a height percentage (e.g. "25%") into dp.
 */
export const hp = (percentage: string): number => {
  const value = Number.parseFloat(percentage);
  if (Number.isNaN(value)) return 0;

  const { height } = getWindow();
  return PixelRatio.roundToNearestPixel((height * value) / 100);
};

/**
 * Scales a font size based on the device width.
 */
export const scaleFontSize = (size: number): number => {
  const { width } = getWindow();
  const scale = width / GUIDELINE_BASE_WIDTH;
  const newSize = size * scale;
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

/**
 * Platform helpers.
 */
export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';

/**
 * Breakpoints based on width.
 */
const getDeviceSize = () => {
  const { width } = getWindow();

  if (width < 360) return 'small';
  if (width < 414) return 'medium';
  return 'large';
};

export const isSmallDevice = getDeviceSize() === 'small';
export const isMediumDevice = getDeviceSize() === 'medium';
export const isLargeDevice = getDeviceSize() === 'large';

/**
 * Notch heuristic.
 *
 * Notes:
 * - Without an external dependency, notch detection is best-effort.
 * - This covers common iPhone notch sizes.
 */
export const hasNotch = (() => {
  if (!isIOS) return false;

  const { width, height } = getWindow();
  const w = Math.min(width, height);
  const h = Math.max(width, height);

  const KNOWN_NOTCH_DIMS = new Set([
    '375x812', // iPhone X/XS/11 Pro
    '414x896', // iPhone XR/XS Max/11/11 Pro Max
    '390x844', // iPhone 12/13/14
    '428x926', // iPhone 12/13/14 Pro Max
    '393x852', // iPhone 14/15 Pro
    '430x932', // iPhone 14/15 Pro Max
  ]);

  return KNOWN_NOTCH_DIMS.has(`${w}x${h}`);
})();

/**
 * Returns a sensible default padding for screens.
 */
export const getResponsivePadding = (): number => {
  const size = getDeviceSize();

  switch (size) {
    case 'small':
      return SPACING.md;
    case 'large':
      return SPACING.xl;
    case 'medium':
    default:
      return SPACING.lg;
  }
};

/**
 * Scales a base font size with guard rails.
 */
export const getResponsiveFontSize = (baseSize: number): number => {
  const scaled = scaleFontSize(baseSize);

  // Guard rails for readability.
  return Platform.select({
    ios: Math.max(baseSize - 1, Math.min(scaled, baseSize + 3)),
    android: Math.max(baseSize - 1, Math.min(scaled, baseSize + 4)),
    default: Math.max(baseSize - 1, Math.min(scaled, baseSize + 4)),
  }) as number;
};
