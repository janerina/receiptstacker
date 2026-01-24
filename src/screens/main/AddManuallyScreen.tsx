import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/common';
import { SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { MainStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<MainStackParamList, 'AddManually'>;

/**
 * Placeholder manual entry screen.
 *
 * Prompt 09 navigates here with OCR-extracted data.
 * You can replace this with your full manual entry flow later.
 */
export const AddManuallyScreen = ({ navigation, route }: Props) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const extracted = route.params?.extractedData;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Add Manually</Text>
        <Text style={styles.subtitle}>OCR results are passed here for editing.</Text>

        <Card variant="default" style={styles.card}>
          <Text style={styles.row}>Merchant: {extracted?.merchant ?? ''}</Text>
          <Text style={styles.row}>Amount: {extracted?.amount ?? ''}</Text>
          <Text style={styles.row}>Date: {extracted?.date ?? ''}</Text>
          <Text style={styles.row} numberOfLines={2}>
            Image: {extracted?.imageUri ?? ''}
          </Text>
        </Card>

        <View style={styles.actions}>
          <Button title="Done" onPress={() => navigation.goBack()} variant="primary" size="lg" fullWidth />
        </View>
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
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
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
    },
    card: {
      marginTop: SPACING.xl,
    },
    row: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      marginBottom: SPACING.sm,
    },
    actions: {
      marginTop: SPACING.xl,
    },
  });

export default AddManuallyScreen;
