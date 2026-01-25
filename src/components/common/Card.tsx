import React, { useMemo, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from '@react-native-community/blur';

import { useTheme } from '@/theme';

export interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'glassmorphism' | 'elevated' | 'outlined';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const PRESS_SCALE = 0.98 as const;
const BORDER_WIDTH_DEFAULT = 1 as const;
const BORDER_WIDTH_OUTLINED = 2 as const;
const GLASS_ALPHA_BORDER = 0.14 as const;
const BLUR_AMOUNT = 14 as const;

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

/**
 * ReceiptStacker card container.
 *
 * Variants:
 * - default: surface + border + md shadow
 * - glassmorphism: BlurView + translucent background
 * - elevated: surface + lg shadow
 * - outlined: transparent + 2px border
 */
export const Card = ({
  children,
  variant = 'default',
  onPress,
  style,
  accessibilityLabel,
}: CardProps) => {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const isPressable = typeof onPress === 'function';

  const container = useMemo<ViewStyle>(() => {
    const base: ViewStyle = {
      borderRadius: theme.radius.lg,
      overflow: 'hidden',
    };

    const shadowMd = theme.isDark ? ({} as ViewStyle) : (theme.shadows.md as ViewStyle);
    const shadowLg = theme.isDark ? ({} as ViewStyle) : (theme.shadows.lg as ViewStyle);

    switch (variant) {
      case 'elevated':
        return {
          ...base,
          backgroundColor: theme.colors.surface,
          ...shadowLg,
        };
      case 'outlined':
        return {
          ...base,
          backgroundColor: 'transparent',
          borderWidth: BORDER_WIDTH_OUTLINED,
          borderColor: theme.colors.border,
        };
      case 'glassmorphism': {
        const translucent = theme.isDark
          ? theme.gradients.glass[1]
          : theme.gradients.glass[0];
        return {
          ...base,
          backgroundColor: translucent,
          borderWidth: BORDER_WIDTH_DEFAULT,
          borderColor: hexToRgba(theme.colors.text, GLASS_ALPHA_BORDER),
        };
      }
      case 'default':
      default:
        return {
          ...base,
          backgroundColor: theme.colors.surface,
          borderWidth: BORDER_WIDTH_DEFAULT,
          borderColor: theme.colors.border,
          ...shadowMd,
        };
    }
  }, [theme, variant]);

  const animateTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  const content = (
    <Animated.View style={{ transform: [{ scale }] }}>
      <View
        style={[
          styles.inner,
          {
            minHeight: theme.componentSizes.card.minHeight,
            padding: theme.componentSizes.card.padding,
          },
          container,
          style,
        ]}
      >
        {variant === 'glassmorphism' ? (
          <BlurView
            style={StyleSheet.absoluteFill}
            blurType={theme.isDark ? 'dark' : 'light'}
            blurAmount={BLUR_AMOUNT}
            reducedTransparencyFallbackColor={theme.colors.surface}
            {...(Platform.OS === 'android' ? { blurRadius: BLUR_AMOUNT } : null)}
          />
        ) : null}
        <View style={styles.content}>{children}</View>
      </View>
    </Animated.View>
  );

  if (!isPressable) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={() => animateTo(PRESS_SCALE)}
      onPressOut={() => animateTo(1)}
    >
      {content}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  inner: {},
  content: {
    flex: 1,
  },
});
