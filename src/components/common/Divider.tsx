import React, { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  spacing?: 'xs' | 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

/**
 * Divider separator.
 *
 * Usage:
 * - Horizontal: section separation
 * - Vertical: split columns or inline groups
 */
export const Divider = ({
  orientation = 'horizontal',
  spacing = 'md',
  style,
}: DividerProps) => {
  const theme = useTheme();

  const marginStyle = useMemo<ViewStyle>(() => {
    const space = theme.spacing[spacing];
    return orientation === 'horizontal' ? { marginVertical: space } : { marginHorizontal: space };
  }, [orientation, spacing, theme.spacing]);

  const baseStyle: ViewStyle =
    orientation === 'horizontal'
      ? { height: StyleSheet.hairlineWidth, width: '100%' }
      : { width: StyleSheet.hairlineWidth, height: '100%' };

  return (
    <View
      style={[
        baseStyle,
        marginStyle,
        { backgroundColor: theme.colors.border },
        style,
      ]}
    />
  );
};
