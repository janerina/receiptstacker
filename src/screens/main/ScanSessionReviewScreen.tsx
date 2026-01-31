import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';

import { Button, Card } from '@/components/common';
import { Header } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { MainStackParamList } from '@/navigation';
import { getLastScanSessionResult, setLastScanSessionResult } from '@/services/scan/sessionStore';

type Props = NativeStackScreenProps<MainStackParamList, 'ScanSessionReview'>;

export const ScanSessionReviewScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;

  const data = getLastScanSessionResult();

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

  const onClose = () => {
    setLastScanSessionResult(null);
    navigation.goBack();
  };

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Header title="Scan Results" showBackButton onBack={() => navigation.goBack()} />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No scan session found</Text>
          <Text style={styles.emptyBody}>Start a multi-page scan to see results here.</Text>
          <View style={{ height: SPACING.lg }} />
          <Button title="Back" onPress={() => navigation.goBack()} variant="primary" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title={`Scan Results (${data.results.length})`} showBackButton onBack={onClose} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {data.results.map((r) => {
          const merchant = r.ocr.extracted?.merchant?.trim() || 'Receipt';
          const amount = r.ocr.extracted?.amount?.trim();
          const date = r.ocr.extracted?.date?.trim();

          return (
            <Pressable
              key={r.image.id}
              onPress={() => {
                navigation.navigate('ReceiptTextEditor', {
                  source: 'multi',
                  primaryImageUri: r.image.uri,
                  partImageUris: [r.image.uri],
                  ocrTextOriginal: r.ocr.text,
                  ocrRawJson: r.ocr.rawResultJson,
                  extracted: r.ocr.extracted ?? {},
                });
              }}
              style={({ pressed }) => [styles.rowPressable, pressed && styles.pressed]}
            >
              <Card style={styles.rowCard}>
                <View style={styles.rowHeader}>
                  <View style={styles.rowIcon}>
                    <Feather name="file-text" size={ICON_SIZES.md} color={primary} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {merchant}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {amount ? `$${amount}` : '—'} {date ? `• ${date}` : ''}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textSecondary} />
                </View>
              </Card>
            </Pressable>
          );
        })}

        <View style={{ height: SPACING.xl }} />

        <Button title="Done" onPress={onClose} variant="primary" />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
  primary,
}: {
  colors: { background: string; text: string; textSecondary: string; surface: string; border: string };
  primary: string;
}) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: SPACING.lg },
    empty: { flex: 1, justifyContent: 'center', padding: SPACING.lg },
    emptyTitle: { ...TYPOGRAPHY.sectionHeading, color: colors.text, textAlign: 'center' },
    emptyBody: { ...TYPOGRAPHY.bodyNormal, color: colors.textSecondary, textAlign: 'center', marginTop: SPACING.sm },

    rowPressable: { marginBottom: SPACING.md },
    rowCard: { borderRadius: RADIUS.lg, padding: SPACING.md },
    rowHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
    rowIcon: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.full,
      backgroundColor: `${primary}1A`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: { flex: 1 },
    rowTitle: { ...TYPOGRAPHY.cardTitle, color: colors.text },
    rowSub: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: 2 },

    pressed: { opacity: 0.85 },
  });

export default ScanSessionReviewScreen;
