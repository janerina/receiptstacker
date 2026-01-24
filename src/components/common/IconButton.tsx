import React, { useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'primary' | 'ghost';
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const PRESS_SCALE = 0.97 as const;
const DISABLED_OPACITY = 0.5 as const;
const BORDER_WIDTH = 1 as const;

/**
 * Icon-only button.
 *
 * Variants:
 * - default: surface + border
 * - primary: primary background
 * - ghost: transparent
 */
export const IconButton = ({
  icon,
  onPress,
  size = 'md',
  variant = 'default',
  disabled = false,
  style,
  accessibilityLabel,
}: IconButtonProps) => {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const dimension = theme.componentSizes.iconButton[size];

  const baseStyle = useMemo<ViewStyle>(() => {
    return {
      width: dimension,
      height: dimension,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: disabled ? DISABLED_OPACITY : 1,
    };
  }, [dimension, disabled, theme.radius.md]);

  const container = useMemo<ViewStyle>(() => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: theme.colors.primary,
          borderColor: 'transparent',
          borderWidth: 0,
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderWidth: 0,
        };
      case 'default':
      default:
        return {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: BORDER_WIDTH,
        };
    }
  }, [theme.colors, variant]);

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
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => animateTo(PRESS_SCALE)}
      onPressOut={() => animateTo(1)}
      style={[baseStyle, container, style]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <View style={styles.iconWrap}>{icon}</View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
