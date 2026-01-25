import React, { useMemo, useRef, useState } from 'react';
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

const PRESS_SCALE = 0.965 as const;
const DISABLED_OPACITY = 0.5 as const;
const GHOST_PRESSED_OPACITY = 0.6 as const;
const BORDER_WIDTH_OUTLINE = 2 as const;
const PRESSED_TRANSLATE_Y = 1 as const;

/**
 * ReceiptStacker button component.
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
  const [isPressed, setIsPressed] = useState(false);

  const isDisabled = disabled || loading;
  const { height, paddingHorizontal } = theme.componentSizes.button[size];

  const containerBase = useMemo<ViewStyle>(() => {
    // For primary disabled, use a distinct grey background (not opacity-only).
    const useOpacity = !(variant === 'primary' && isDisabled);

    return {
      height,
      borderRadius: theme.radius.lg,
      width: fullWidth ? '100%' : undefined,
      opacity: useOpacity && isDisabled ? DISABLED_OPACITY : 1,
    };
  }, [fullWidth, height, isDisabled, theme.radius.lg, variant]);

  const { content, textColor, indicatorColor, useGradient, gradientColors } = useMemo(() => {
    switch (variant) {
      case 'secondary':
        return {
          useGradient: false,
          gradientColors: undefined as string[] | undefined,
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
          gradientColors: undefined as string[] | undefined,
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
          gradientColors: undefined as string[] | undefined,
          content: {
            backgroundColor: 'transparent',
          } satisfies ViewStyle,
          textColor: theme.colors.primary,
          indicatorColor: theme.colors.primary,
        };
      case 'danger':
        return {
          useGradient: true,
          gradientColors: Array.from(theme.gradients.error),
          content: {
            backgroundColor: theme.colors.error,
          } satisfies ViewStyle,
          textColor: theme.colors.white,
          indicatorColor: theme.colors.white,
        };
      case 'primary':
      default:
        if (isDisabled) {
          return {
            useGradient: false,
            gradientColors: undefined as string[] | undefined,
            content: {
              backgroundColor: theme.colors.disabled,
            } satisfies ViewStyle,
            textColor: theme.colors.textSecondary,
            indicatorColor: theme.colors.textSecondary,
          };
        }

        return {
          useGradient: true,
          gradientColors: Array.from(theme.gradients.primary),
          content: {
            // Visible fallback if gradient/native module fails.
            backgroundColor: theme.colors.primary,
          } satisfies ViewStyle,
          textColor: theme.colors.white,
          indicatorColor: theme.colors.white,
        };
    }
  }, [isDisabled, theme.colors, theme.gradients, variant]);

  const shadowStyle = useMemo(() => {
    if ((variant === 'primary' || variant === 'danger') && !isDisabled) return theme.shadows.md;
    return undefined;
  }, [isDisabled, theme.shadows.md, variant]);

  const pressedShadowStyle = useMemo(() => {
    if ((variant === 'primary' || variant === 'danger') && !isDisabled) return theme.shadows.sm;
    return undefined;
  }, [isDisabled, theme.shadows.sm, variant]);

  const animateTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  const rippleColor = useMemo(() => {
    if (variant === 'primary' || variant === 'danger') return 'rgba(255,255,255,0.32)';
    return 'rgba(59,130,246,0.28)';
  }, [variant]);

  const pressedOverlayColor = useMemo(() => {
    if (variant === 'primary' || variant === 'danger') return 'rgba(0,0,0,0.16)';
    if (variant === 'secondary') return 'rgba(59,130,246,0.06)';
    if (variant === 'outline') return 'rgba(59,130,246,0.08)';
    return 'transparent';
  }, [variant]);

  return (
    <Animated.View
      style={[
        containerBase,
        isPressed ? pressedShadowStyle : shadowStyle,
        style,
        {
          transform: [{ scale }, { translateY: isPressed && !isDisabled ? PRESSED_TRANSLATE_Y : 0 }],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        disabled={isDisabled}
        onPress={onPress}
        onPressIn={() => {
          setIsPressed(true);
          animateTo(PRESS_SCALE);
        }}
        onPressOut={() => {
          setIsPressed(false);
          animateTo(1);
        }}
        android_ripple={
          isDisabled
            ? undefined
            : {
                color: rippleColor,
                foreground: true,
              }
        }
        style={({ pressed }) => [
          styles.pressable,
          { borderRadius: theme.radius.lg, overflow: 'hidden' },
          variant === 'ghost' && pressed && !isDisabled ? { opacity: GHOST_PRESSED_OPACITY } : null,
          pressed && !isDisabled && variant !== 'ghost' ? { opacity: 0.95 } : null,
        ]}
      >
        {({ pressed }) => (
          <View
            style={[
              styles.content,
              {
                borderRadius: theme.radius.lg,
                paddingHorizontal,
              },
              content,
            ]}
          >
            {useGradient && gradientColors ? (
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                // Ensure the gradient never draws above the label.
                style={[StyleSheet.absoluteFill, { zIndex: 0 }]}
                pointerEvents="none"
              />
            ) : null}

            {pressed && !isDisabled && variant !== 'ghost' && pressedOverlayColor !== 'transparent' ? (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: pressedOverlayColor, zIndex: 0 }]} />
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
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: {
    zIndex: 1,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    textAlign: 'center',
  },
});
