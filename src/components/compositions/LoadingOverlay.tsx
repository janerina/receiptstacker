import React, { useMemo } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';

export interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

/**
 * Fullscreen loading overlay with spinner and optional message.
 */
export const LoadingOverlay = ({ visible, message }: LoadingOverlayProps) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () =>
      createStyles({
        colors,
        insetTop: insets.top,
        insetBottom: insets.bottom,
        isDark,
      }),
    [colors, insets.bottom, insets.top, isDark],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator
            size={Platform.select({ ios: 'large', android: 'large', default: 'large' })}
            color={colors.text}
          />
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (opts: {
  colors: { text: string; surface: string };
  insetTop: number;
  insetBottom: number;
  isDark: boolean;
}) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      paddingTop: Math.max(opts.insetTop, SPACING.lg),
      paddingBottom: Math.max(opts.insetBottom, SPACING.lg),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: opts.isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.25)',
    },
    card: {
      minWidth: 220,
      backgroundColor: opts.colors.surface,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.lg,
      borderRadius: 16,
      alignItems: 'center',
    },
    message: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.text,
      marginTop: SPACING.md,
      textAlign: 'center',
    },
  });
