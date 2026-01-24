import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

import { GRID } from '@/constants';
import { useTheme } from '@/theme';

export interface BadgeProps {
  text: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

const BADGE_MD_PADDING_VERTICAL = 6 as const;

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

/**
 * Status badge.
 *
 * Notes:
 * - `primary` and `error` use gradients to match the app's brand style.
 */
export const Badge = ({ text, variant = 'default', size = 'sm', style }: BadgeProps) => {
  const theme = useTheme();

  const padding = useMemo(() => {
    if (size === 'md') {
      return { paddingVertical: BADGE_MD_PADDING_VERTICAL, paddingHorizontal: GRID * 3 };
    }
    return theme.componentSizes.badge.sm;
  }, [size, theme.componentSizes.badge.sm]);

  const { background, textColor, borderColor, useGradient, gradientColors } = useMemo(() => {
    const base = {
      background: theme.colors.surface,
      textColor: theme.colors.text,
      borderColor: theme.colors.border,
      useGradient: false,
      gradientColors: undefined as undefined | readonly [string, string],
    };

    const alphaBg = 0.14 as const;

    switch (variant) {
      case 'primary':
        return {
          ...base,
          background: 'transparent',
          textColor: theme.colors.white,
          borderColor: 'transparent',
          useGradient: true,
          gradientColors: theme.gradients.primary,
        };
      case 'success':
        return {
          ...base,
          background: hexToRgba(theme.colors.success, alphaBg),
          textColor: theme.colors.success,
          borderColor: 'transparent',
        };
      case 'warning':
        return {
          ...base,
          background: hexToRgba(theme.colors.warning, alphaBg),
          textColor: theme.colors.warning,
          borderColor: 'transparent',
        };
      case 'error':
        return {
          ...base,
          background: 'transparent',
          textColor: theme.colors.white,
          borderColor: 'transparent',
          useGradient: true,
          gradientColors: theme.gradients.error,
        };
      case 'info':
        return {
          ...base,
          background: hexToRgba(theme.colors.info, alphaBg),
          textColor: theme.colors.info,
          borderColor: 'transparent',
        };
      case 'default':
      default:
        return base;
    }
  }, [theme.colors, theme.gradients, variant]);

  const textStyle = size === 'md'
    ? [theme.typography.bodySmall, { fontWeight: '600' as const, color: textColor }]
    : [theme.typography.caption, { fontWeight: '600' as const, color: textColor }];

  return (
    <View
      style={[
        styles.container,
        padding,
        {
          borderRadius: theme.radius.full,
          borderColor,
          backgroundColor: background,
        },
        style,
      ]}
    >
      {useGradient && gradientColors ? (
        <LinearGradient
          colors={Array.from(gradientColors)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Text style={textStyle} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
});
