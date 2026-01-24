import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';

export interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

/**
 * Reusable section header: title + optional action link.
 */
export const SectionHeader = ({ title, action }: SectionHeaderProps) => {
  const { colors } = useTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          hitSlop={10}
          style={({ pressed }) => [styles.actionWrap, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const createStyles = (colors: { text: string; textSecondary: string }) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    title: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
    },
    actionWrap: {
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xs,
    },
    actionText: {
      ...TYPOGRAPHY.label,
      color: colors.textSecondary,
    },
    pressed: {
      opacity: 0.7,
    },
  });
