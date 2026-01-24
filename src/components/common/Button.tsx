import React, { useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

import { useTheme } from '@/theme';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const PRESS_SCALE = 0.97 as const;
const DISABLED_OPACITY = 0.5 as const;
const GHOST_PRESSED_OPACITY = 0.6 as const;
const BORDER_WIDTH_OUTLINE = 2 as const;

/**
 * ReceiptStacker button component.
 *
 * Features:
 * - Variants: primary/secondary/outline/ghost/danger
 * - Press animation (scale)
 * - Loading spinner
 * - Icon support
 * - Theme aware
 */
export const Button = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  style,
  accessibilityLabel,
}: ButtonProps) => {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const isDisabled = disabled || loading;

  const containerBase = useMemo<ViewStyle>(() => {
    const { height, paddingHorizontal } = theme.componentSizes.button[size];
    return {
      height,
      paddingHorizontal,
      borderRadius: theme.radius.md,
      width: fullWidth ? '100%' : undefined,
      opacity: isDisabled ? DISABLED_OPACITY : 1,
    };
  }, [fullWidth, isDisabled, size, theme.componentSizes.button, theme.radius.md]);

  const { content, textColor, indicatorColor, useGradient, gradientColors } = useMemo(() => {
    switch (variant) {
      case 'secondary':
        return {
          useGradient: false,
          gradientColors: undefined,
          content: {
            backgroundColor: theme.colors.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
          } satisfies ViewStyle,
          textColor: theme.colors.primary,
          indicatorColor: theme.colors.primary,
        };
      case 'outline':
        return {
          useGradient: false,
          gradientColors: undefined,
          content: {
            backgroundColor: 'transparent',
            borderWidth: BORDER_WIDTH_OUTLINE,
            borderColor: theme.colors.primary,
          } satisfies ViewStyle,
          textColor: theme.colors.primary,
          indicatorColor: theme.colors.primary,
        };
      case 'ghost':
        return {
          useGradient: false,
          gradientColors: undefined,
          content: {
            backgroundColor: 'transparent',
          } satisfies ViewStyle,
          textColor: theme.colors.primary,
          indicatorColor: theme.colors.primary,
        };
      case 'danger':
        return {
          useGradient: true,
          gradientColors: theme.gradients.error,
          content: {
            backgroundColor: 'transparent',
          } satisfies ViewStyle,
          textColor: theme.colors.white,
          indicatorColor: theme.colors.white,
        };
      case 'primary':
      default:
        return {
          useGradient: true,
          gradientColors: theme.gradients.primary,
          content: {
            backgroundColor: 'transparent',
          } satisfies ViewStyle,
          textColor: theme.colors.white,
          indicatorColor: theme.colors.white,
        };
    }
  }, [theme.colors, theme.gradients, variant]);

  const shadowStyle = useMemo(() => {
    if (variant === 'primary' || variant === 'danger') {
      return theme.shadows.md;
    }
    return undefined;
  }, [theme.shadows.md, variant]);

  const animateTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  const inner = (
    <View style={[styles.content, { borderRadius: theme.radius.md }, content]}>
      {useGradient && gradientColors ? (
        <LinearGradient
          colors={Array.from(gradientColors)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {loading ? (
        <ActivityIndicator color={indicatorColor} />
      ) : (
        <View style={styles.row}>
          {icon && iconPosition === 'left' ? (
            <View style={{ marginRight: theme.spacing.sm }}>{icon}</View>
          ) : null}
          <Text style={[styles.text, theme.typography.buttonText, { color: textColor }]} numberOfLines={1}>
            {title}
          </Text>
          {icon && iconPosition === 'right' ? (
            <View style={{ marginLeft: theme.spacing.sm }}>{icon}</View>
          ) : null}
        </View>
      )}
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={() => animateTo(PRESS_SCALE)}
      onPressOut={() => animateTo(1)}
      style={({ pressed }) => [
        containerBase,
        shadowStyle,
        styles.container,
        variant === 'ghost' && pressed && !isDisabled ? { opacity: GHOST_PRESSED_OPACITY } : null,
        style,
      ]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{inner}</Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    textAlign: 'center',
  },
});
