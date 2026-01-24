import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';

/**
 * Legacy placeholder screen.
 *
 * This file is currently unused, but is kept compiling.
 */
export const MainScreen = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Home</Text>
        <Text style={styles.subtitle}>This screen is not currently used.</Text>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors: { background: string; text: string; textSecondary: string }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.lg,
    },
    title: {
      ...TYPOGRAPHY.pageTitle,
      color: colors.text,
      textAlign: 'center',
    },
    subtitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.sm,
      maxWidth: 360,
    },
  });

export default MainScreen;
