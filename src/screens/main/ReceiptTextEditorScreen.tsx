import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/common';
import { Header } from '@/components/compositions';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { MainStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<MainStackParamList, 'ReceiptTextEditor'>;

export const ReceiptTextEditorScreen = ({ navigation, route }: Props) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;

  const [text, setText] = useState(route.params.ocrTextOriginal ?? '');

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

  const detectWarrantyOrReturn = (input: string):
    | { alertType: 'warranty' | 'return'; durationDays: number; reason: string }
    | null => {
    const t = (input ?? '').toLowerCase();
    if (!t.trim()) return null;

    const hasWarranty = /\bwarranty\b/.test(t);
    const hasReturn = /\breturn\b|\breturn policy\b|\breturns\b/.test(t);
    if (!hasWarranty && !hasReturn) return null;

    // Try to find an explicit duration like "30 days", "1 year", "2 years".
    const m = t.match(/(\d{1,3})\s*(day|days|month|months|year|years)\b/);
    if (m) {
      const n = Number(m[1]);
      const unit = m[2];
      const days =
        unit.startsWith('day') ? n : unit.startsWith('month') ? n * 30 : unit.startsWith('year') ? n * 365 : 30;
      return {
        alertType: hasReturn && !hasWarranty ? 'return' : 'warranty',
        durationDays: Math.max(1, Math.min(days, 3650)),
        reason: `Found "${m[0]}" in text`,
      };
    }

    // Defaults when no explicit duration found.
    if (hasReturn) return { alertType: 'return', durationDays: 30, reason: 'Return policy mentioned' };
    return { alertType: 'warranty', durationDays: 365, reason: 'Warranty mentioned' };
  };

  const onContinue = () => {
    const extracted = route.params.extracted ?? {};

    const suggestion = detectWarrantyOrReturn(text);
    if (suggestion) {
      const purchaseIso = (extracted.date ?? new Date().toISOString()) as string;
      const purchaseDate = new Date(purchaseIso);
      const safePurchase = Number.isNaN(purchaseDate.getTime()) ? new Date() : purchaseDate;
      const expiry = new Date(safePurchase.getTime() + suggestion.durationDays * 24 * 60 * 60 * 1000);

      Alert.alert(
        'Warranty/Return detected',
        `${suggestion.reason}. Want to add an alert now?`,
        [
          {
            text: 'Continue',
            style: 'default',
            onPress: () => {
              // Always return to the Home tab's Add Receipt screen.
              navigation.navigate('Home' as any, {
                screen: 'AddManually',
                params: {
                  extractedData: {
                    merchant: extracted.merchant ?? '',
                    amount: extracted.amount ?? '',
                    date: extracted.date ?? new Date().toISOString(),
                    imageUri: route.params.primaryImageUri,
                    ocrTextOriginal: route.params.ocrTextOriginal ?? '',
                    ocrTextEdited: text,
                    ocrRawJson: route.params.ocrRawJson,
                    scanMode: route.params.source,
                    partImageUris: route.params.partImageUris,
                  },
                },
              });
            },
          },
          {
            text: 'Add Alert',
            onPress: () => {
              navigation.navigate('WarrantyAlerts', {
                prefill: {
                  alertType: suggestion.alertType,
                  store: extracted.merchant ?? '',
                  purchaseDate: safePurchase.toISOString(),
                  expiryDate: expiry.toISOString(),
                  title: '',
                  notes: `Auto-suggested from OCR (${suggestion.reason})`,
                },
              });
            },
          },
        ],
      );
      return;
    }

    // Always return to the Home tab's Add Receipt screen.
    navigation.navigate('Home' as any, {
      screen: 'AddManually',
      params: {
        extractedData: {
          merchant: extracted.merchant ?? '',
          amount: extracted.amount ?? '',
          date: extracted.date ?? new Date().toISOString(),
          imageUri: route.params.primaryImageUri,
          ocrTextOriginal: route.params.ocrTextOriginal ?? '',
          ocrTextEdited: text,
          ocrRawJson: route.params.ocrRawJson,
          scanMode: route.params.source,
          partImageUris: route.params.partImageUris,
        },
      },
    });
  };

  const onDiscard = () => {
    Alert.alert('Discard changes?', 'Your OCR edits will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title="Edit Receipt Text" showBackButton onBack={onDiscard} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Card style={styles.metaCard}>
          <Text style={styles.metaTitle}>OCR Text</Text>
          <Text style={styles.metaBody}>Edit anything that looks wrong. Monospace formatting helps keep receipt-like alignment.</Text>
        </Card>

        <View style={{ height: SPACING.md }} />

        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.editor}
          placeholder="OCR text will appear here..."
          placeholderTextColor={colors.textSecondary}
          textAlignVertical="top"
        />

        <View style={{ height: SPACING.lg }} />

        <Button title="Continue" onPress={onContinue} variant="primary" />
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
    metaCard: { padding: SPACING.md, borderRadius: RADIUS.lg },
    metaTitle: { ...TYPOGRAPHY.sectionHeading, color: colors.text },
    metaBody: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: SPACING.xs },
    editor: {
      minHeight: 360,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: SPACING.md,
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
    },
  });

export default ReceiptTextEditorScreen;
