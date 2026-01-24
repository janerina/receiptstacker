import React, { useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  onClose?: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const PRESS_SCALE = 0.98 as const;
const BORDER_WIDTH = 1 as const;

/**
 * Filter/selection chip.
 *
 * Features:
 * - Selected/unselected styles
 * - Optional leading icon
 * - Optional close action
 * - Press animation
 */
export const Chip = ({
  label,
  selected = false,
  onPress,
  icon,
  onClose,
  style,
  accessibilityLabel,
}: ChipProps) => {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const containerStyle = useMemo<ViewStyle>(() => {
    return {
      borderRadius: theme.radius.full,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: BORDER_WIDTH,
      borderColor: selected ? 'transparent' : theme.colors.border,
      backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
    };
  }, [selected, theme.colors, theme.radius.full, theme.spacing.md, theme.spacing.xs]);

  const textColor = selected ? theme.colors.white : theme.colors.text;

  const animateTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  const pressable = typeof onPress === 'function';

  const content = (
    <Animated.View style={{ transform: [{ scale }] }}>
      <View style={[containerStyle, style]}>
        {icon ? <View style={{ marginRight: theme.spacing.xs }}>{icon}</View> : null}
        <Text style={[theme.typography.bodySmall, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
        {onClose ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove"
            onPress={onClose}
            hitSlop={theme.spacing.xs}
            style={{ marginLeft: theme.spacing.xs }}
          >
            <Text style={[styles.close, { color: textColor }]}>×</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );

  if (!pressable) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      onPressIn={() => animateTo(PRESS_SCALE)}
      onPressOut={() => animateTo(1)}
    >
      {content}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  close: {
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '700',
  },
});
