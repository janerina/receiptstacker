import React, { useMemo, useRef, useState } from 'react';
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

const ACTIVE_SCALE = 1.02 as const;
const HOVER_SCALE = 1.01 as const;
const ACTIVE_LIFT_Y = -3 as const;
const HOVER_LIFT_Y = -2 as const;
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
  const lift = useRef(new Animated.Value(0)).current;
  const [isActive, setIsActive] = useState(false);

  const flattenedStyle = useMemo(() => (StyleSheet.flatten(style) ?? {}) as ViewStyle, [style]);

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

  const interactionShadow: ViewStyle | undefined = isActive
    ? Platform.select<ViewStyle>({
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 10 },
        },
        android: { elevation: 10 },
        default: {
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 10 },
        },
      })
    : undefined;

  const content = (
    <Animated.View
      style={[
        {
          flex: flattenedStyle.flex,
          flexGrow: flattenedStyle.flexGrow,
          flexShrink: flattenedStyle.flexShrink,
          flexBasis: flattenedStyle.flexBasis,
          alignSelf: flattenedStyle.alignSelf,
          width: flattenedStyle.width,
          minWidth: flattenedStyle.minWidth,
          maxWidth: flattenedStyle.maxWidth,
          height: flattenedStyle.height,
          minHeight: flattenedStyle.minHeight,
          maxHeight: flattenedStyle.maxHeight,
          margin: flattenedStyle.margin,
          marginHorizontal: flattenedStyle.marginHorizontal,
          marginVertical: flattenedStyle.marginVertical,
          marginTop: flattenedStyle.marginTop,
          marginBottom: flattenedStyle.marginBottom,
          marginLeft: flattenedStyle.marginLeft,
          marginRight: flattenedStyle.marginRight,
          position: flattenedStyle.position,
          top: flattenedStyle.top,
          right: flattenedStyle.right,
          bottom: flattenedStyle.bottom,
          left: flattenedStyle.left,
        },
        { transform: [{ translateY: lift }, { scale }] },
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            minHeight: theme.componentSizes.card.minHeight,
            padding: theme.componentSizes.card.padding,
          },
          container,
          interactionShadow,
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
      onPressIn={() => {
        setIsActive(true);
        animateTo(ACTIVE_SCALE, ACTIVE_LIFT_Y);
      }}
      onPressOut={() => {
        setIsActive(false);
        animateTo(1, 0);
      }}
      onHoverIn={() => {
        setIsActive(true);
        animateTo(HOVER_SCALE, HOVER_LIFT_Y);
      }}
      onHoverOut={() => {
        setIsActive(false);
        animateTo(1, 0);
      }}
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
