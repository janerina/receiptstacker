import React, { useMemo, useRef, useState } from 'react';
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

const ACTIVE_SCALE = 1.03 as const;
const HOVER_SCALE = 1.015 as const;
const ACTIVE_LIFT_Y = -2 as const;
const HOVER_LIFT_Y = -1 as const;
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
  const lift = useRef(new Animated.Value(0)).current;
  const [isActive, setIsActive] = useState(false);

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

  const animateTo = (toScale: number, toLift: number) => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: toScale,
        useNativeDriver: true,
        speed: 20,
        bounciness: 8,
      }),
      Animated.spring(lift, {
        toValue: toLift,
        useNativeDriver: true,
        speed: 20,
        bounciness: 8,
      }),
    ]).start();
  };

  const activeShadow = useMemo<ViewStyle | undefined>(() => {
    if (!isActive || disabled) return undefined;
    if (variant === 'ghost') return undefined;
    return theme.shadows.lg as unknown as ViewStyle;
  }, [disabled, isActive, theme.shadows.lg, variant]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        setIsActive(true);
        animateTo(ACTIVE_SCALE, ACTIVE_LIFT_Y);
      }}
      onPressOut={() => {
        setIsActive(false);
        animateTo(1, 0);
      }}
      onHoverIn={() => {
        if (disabled) return;
        setIsActive(true);
        animateTo(HOVER_SCALE, HOVER_LIFT_Y);
      }}
      onHoverOut={() => {
        setIsActive(false);
        animateTo(1, 0);
      }}
      style={[baseStyle, container, activeShadow, style]}
    >
      <Animated.View style={{ transform: [{ translateY: lift }, { scale }] }}>
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
