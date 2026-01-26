import React, { useMemo } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';

export interface HeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  showBackButton?: boolean;
}

/**
 * Reusable screen header.
 *
 * Renders:
 * - Optional back button
 * - Title
 * - Optional right action slot
 */
export const Header = ({
  title,
  onBack,
  rightAction,
  showBackButton = Boolean(onBack),
}: HeaderProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const androidStatusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

  const styles = useMemo(
    () =>
      createStyles(colors, {
        paddingTop: Platform.select({
          ios: Math.max(insets.top, SPACING.md),
          android: Math.max(insets.top, androidStatusBarHeight, SPACING.md),
          default: SPACING.md,
        }) as number,
      }),
    [androidStatusBarHeight, colors, insets.top],
  );

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.side}>
          {showBackButton && onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={onBack}
              hitSlop={12}
              style={({ pressed }) => [styles.backButton, pressed && styles.backPressed]}
            >
              <Text style={styles.backText}>{Platform.select({ ios: '‹', android: '←', default: '←' })}</Text>
              <Text style={styles.backLabel}>Back</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.center}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        </View>

        <View style={styles.sideRight}>{rightAction}</View>
      </View>
    </View>
  );
};

const createStyles = (
  colors: { background: string; surface: string; text: string; border: string },
  opts: { paddingTop: number },
) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.background,
      paddingTop: opts.paddingTop,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    side: {
      minWidth: 80,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    sideRight: {
      minWidth: 80,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.sm,
    },
    title: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.full,
    },
    backPressed: {
      opacity: 0.75,
    },
    backText: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      marginRight: 6,
      marginTop: -1,
    },
    backLabel: {
      ...TYPOGRAPHY.label,
      color: colors.text,
    },
  });
