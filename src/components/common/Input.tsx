import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

export interface InputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  multiline?: boolean;
  numberOfLines?: number;
  editable?: boolean;
  maxLength?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const BORDER_WIDTH_DEFAULT = 1 as const;
const BORDER_WIDTH_FOCUSED = 2 as const;
const DISABLED_OPACITY = 0.6 as const;
const FOCUS_ANIM_DURATION_MS = 120 as const;

/**
 * ReceiptStacker input component.
 *
 * Features:
 * - Label + error message
 * - Focus border animation
 * - Validation states
 * - Optional left/right icons
 * - Character counter (when `maxLength` is provided)
 */
export const Input = ({
  value,
  onChangeText,
  placeholder,
  label,
  error,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  leftIcon,
  rightIcon,
  multiline = false,
  numberOfLines,
  editable = true,
  maxLength,
  style,
  accessibilityLabel,
}: InputProps) => {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const focusAnim = useRef(new Animated.Value(0)).current;

  const isDisabled = !editable;

  const borderWidth = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [BORDER_WIDTH_DEFAULT, BORDER_WIDTH_FOCUSED],
  });

  const borderColor = useMemo(() => {
    if (error) return theme.colors.error;
    if (focused) return theme.colors.primary;
    return theme.colors.border;
  }, [error, focused, theme.colors.border, theme.colors.error, theme.colors.primary]);

  const containerStyle = useMemo<ViewStyle>(() => {
    return {
      backgroundColor: isDisabled ? theme.colors.disabled : theme.colors.surface,
      borderRadius: theme.radius.md,
      opacity: isDisabled ? DISABLED_OPACITY : 1,
    };
  }, [isDisabled, theme.colors.disabled, theme.colors.surface, theme.radius.md]);

  const onFocus: TextInputProps['onFocus'] = () => {
    setFocused(true);
    Animated.timing(focusAnim, {
      toValue: 1,
      duration: FOCUS_ANIM_DURATION_MS,
      useNativeDriver: false,
    }).start();
  };

  const onBlur: TextInputProps['onBlur'] = () => {
    setFocused(false);
    Animated.timing(focusAnim, {
      toValue: 0,
      duration: FOCUS_ANIM_DURATION_MS,
      useNativeDriver: false,
    }).start();
  };

  const showCounter = typeof maxLength === 'number';

  const fieldSizing = useMemo(() => {
    return {
      minHeight: theme.componentSizes.input.height,
      paddingHorizontal: theme.componentSizes.input.paddingHorizontal,
      paddingVertical: theme.componentSizes.input.paddingVertical,
    } as const;
  }, [theme.componentSizes.input.height, theme.componentSizes.input.paddingHorizontal, theme.componentSizes.input.paddingVertical]);

  const metaRowSpacingStyle = useMemo<ViewStyle>(() => {
    return { marginTop: theme.spacing.xs };
  }, [theme.spacing.xs]);

  const errorColorStyle = useMemo<TextStyle>(() => {
    return { color: theme.colors.error };
  }, [theme.colors.error]);

  return (
    <View style={style}>
      {label ? (
        <Text style={[theme.typography.label, { color: theme.colors.text, marginBottom: theme.spacing.xs }]}>
          {label}
        </Text>
      ) : null}

      <Animated.View style={[styles.field, fieldSizing, containerStyle, { borderColor, borderWidth }]}>
        {leftIcon ? <View style={{ marginRight: theme.spacing.sm }}>{leftIcon}</View> : null}

        <TextInput
          accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
          style={[
            styles.input,
            theme.typography.bodyNormal,
            { color: theme.colors.text },
            multiline ? styles.multiline : null,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textTertiary}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          numberOfLines={numberOfLines}
          editable={editable}
          maxLength={maxLength}
          onFocus={onFocus}
          onBlur={onBlur}
        />

        {rightIcon ? <View style={{ marginLeft: theme.spacing.sm }}>{rightIcon}</View> : null}
      </Animated.View>

      <View style={[styles.metaRow, metaRowSpacingStyle]}>
        {error ? (
          <Text style={[theme.typography.caption, styles.flex1, errorColorStyle]}>
            {error}
          </Text>
        ) : (
          <View style={styles.flex1} />
        )}

        {showCounter ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
            {value.length}/{maxLength}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex1: {
    flex: 1,
  },
  input: {
    flex: 1,
    paddingVertical: 0,
  },
  multiline: {
    textAlignVertical: 'top',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
