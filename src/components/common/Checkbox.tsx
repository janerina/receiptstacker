import React, { useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export interface CheckboxProps {
  checked: boolean;
  onPress: () => void;
  label?: string;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const BORDER_WIDTH = 2 as const;
const PRESS_SCALE = 0.97 as const;
const DISABLED_OPACITY = 0.5 as const;

/**
 * Checkbox control.
 *
 * Features:
 * - Animated press feedback
 * - Optional label
 * - Theme aware
 */
export const Checkbox = ({
  checked,
  onPress,
  label,
  disabled = false,
  style,
  accessibilityLabel,
}: CheckboxProps) => {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const boxStyle = useMemo<ViewStyle>(() => {
    return {
      width: theme.iconSizes.md,
      height: theme.iconSizes.md,
      borderRadius: theme.radius.sm,
      borderWidth: BORDER_WIDTH,
      borderColor: checked ? theme.colors.primary : theme.colors.border,
      backgroundColor: checked ? theme.colors.primary : 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    };
  }, [checked, theme.colors.border, theme.colors.primary, theme.iconSizes.md, theme.radius.sm]);

  const animateTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked, disabled }}
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => animateTo(PRESS_SCALE)}
      onPressOut={() => animateTo(1)}
      style={[styles.row, disabled ? styles.disabled : null, style]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <View style={boxStyle}>
          {checked ? <Text style={[styles.check, { color: theme.colors.white }]}>✓</Text> : null}
        </View>
      </Animated.View>
      {label ? (
        <Text style={[theme.typography.bodyNormal, { color: theme.colors.text, marginLeft: theme.spacing.sm }]}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  disabled: {
    opacity: DISABLED_OPACITY,
  },
  check: {
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '700',
  },
});
