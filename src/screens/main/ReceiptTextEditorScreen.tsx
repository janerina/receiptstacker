import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import Clipboard from '@react-native-clipboard/clipboard';
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/common';
import { Header } from '@/components/compositions';
import { LoadingOverlay } from '@/components/compositions/LoadingOverlay';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { MainStackParamList } from '@/navigation';
import { mergeOcrTextsByLineOverlap, recognizeTextWithMlKit } from '@/services/scan/ocr';
import type { OcrLayout } from '@/services/scan/types';
import { extractReceiptData } from '@/services/scan/receiptParser';

type Props = NativeStackScreenProps<MainStackParamList, 'ReceiptTextEditor'>;

type EditableLine = {
  id: string;
  text: string;
  confidence?: number;
};

const splitToLines = (value: string): string[] => {
  // Preserve blank lines (receipt spacing), but normalize line endings.
  return (value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
};

export const ReceiptTextEditorScreen = ({ navigation, route }: Props) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;

  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | undefined>(undefined);
  const [liveConfidence, setLiveConfidence] = useState<number | undefined>(route.params.ocrConfidence);
  const [liveLayout, setLiveLayout] = useState<OcrLayout | undefined>(route.params.ocrLayout);

  const initialLines: EditableLine[] = useMemo(() => {
    const fromLayout = route.params.ocrLayout?.lines;
    if (Array.isArray(fromLayout) && fromLayout.length) {
      return fromLayout.map((l, idx) => ({
        id: `${idx}`,
        text: typeof l.text === 'string' ? l.text : '',
        confidence: typeof l.confidence === 'number' ? l.confidence : undefined,
      }));
    }

    return splitToLines(route.params.ocrTextOriginal ?? '').map((t, idx) => ({ id: `${idx}`, text: t }));
  }, [route.params.ocrLayout, route.params.ocrTextOriginal]);

  const [lines, setLines] = useState<EditableLine[]>(initialLines);
  const [viewMode, setViewMode] = useState<'receipt' | 'raw'>(() => {
    // Default to receipt view when we have structured OCR, else raw.
    return route.params.ocrLayout?.lines?.length ? 'receipt' : 'raw';
  });

  const mergedText = useMemo(() => lines.map((l) => l.text ?? '').join('\n'), [lines]);

  const derivedExtracted = useMemo(() => {
    // Always re-derive from the current edited text so the user can fix OCR
    // and immediately get better item extraction.
    try {
      return extractReceiptData(mergedText, liveLayout);
    } catch {
      return {};
    }
  }, [mergedText, liveLayout]);

  const extractedForContinue = useMemo(() => {
    const base = (route.params.extracted ?? {}) as any;
    const derived = (derivedExtracted ?? {}) as any;

    const nonEmpty: any = {};
    Object.keys(derived).forEach((k) => {
      const v = derived[k];
      if (v === undefined || v === null) return;
      if (typeof v === 'string' && v.trim().length === 0) return;
      if (Array.isArray(v) && v.length === 0) return;
      nonEmpty[k] = v;
    });

    return { ...base, ...nonEmpty };
  }, [derivedExtracted, route.params.extracted]);

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
    const extracted = extractedForContinue ?? {};

    const suggestion = detectWarrantyOrReturn(mergedText);
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
                    items: extracted.items,
                    subtotal: extracted.subtotal,
                    tax: extracted.tax,
                    categoryId: extracted.categoryId,
                    category: extracted.category,
                    imageUri: route.params.primaryImageUri,
                    ocrTextOriginal: route.params.ocrTextOriginal ?? '',
                    ocrTextEdited: mergedText,
                    ocrRawJson: route.params.ocrRawJson,
                    ocrConfidence: route.params.ocrConfidence,
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
          items: extracted.items,
          subtotal: extracted.subtotal,
          tax: extracted.tax,
          categoryId: extracted.categoryId,
          category: extracted.category,
          imageUri: route.params.primaryImageUri,
          ocrTextOriginal: route.params.ocrTextOriginal ?? '',
          ocrTextEdited: mergedText,
          ocrRawJson: route.params.ocrRawJson,
          ocrConfidence: liveConfidence,
          scanMode: route.params.source,
          partImageUris: route.params.partImageUris,
        },
      },
    });
  };

  const onCopyAll = useCallback(() => {
    Clipboard.setString(mergedText ?? '');
    Alert.alert('Copied', 'Text copied to clipboard.');
  }, [mergedText]);

  const onExport = useCallback(async () => {
    try {
      await Share.share({ message: mergedText ?? '' });
    } catch {
      // User canceled share sheet or platform error.
    }
  }, [mergedText]);

  const onRetryOcr = useCallback(() => {
    if (retrying) return;

    Alert.alert('Retry OCR?', 'This will re-run OCR on the captured image(s) and replace the current text.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Retry',
        style: 'default',
        onPress: async () => {
          const uris = Array.isArray(route.params.partImageUris) && route.params.partImageUris.length
            ? route.params.partImageUris
            : [route.params.primaryImageUri];

          setRetrying(true);
          setRetryMessage('Re-running OCR…');

          try {
            const results = [] as Array<{ text: string; confidence?: number; layout?: OcrLayout }>;

            for (let i = 0; i < uris.length; i += 1) {
              setRetryMessage(uris.length > 1 ? `Re-running OCR (${i + 1}/${uris.length})…` : 'Re-running OCR…');
              const r = await recognizeTextWithMlKit(uris[i]);
              results.push({ text: r.text, confidence: r.confidence, layout: r.layout });
            }

            const confidences = results
              .map((r) => r.confidence)
              .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
            const avg = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : undefined;
            setLiveConfidence(avg);

            if (results.length === 1 && results[0].layout?.lines?.length) {
              setLiveLayout(results[0].layout);
              setViewMode('receipt');
              setLines(
                results[0].layout.lines.map((l, idx) => ({
                  id: `${idx}`,
                  text: typeof l.text === 'string' ? l.text : '',
                  confidence: typeof l.confidence === 'number' ? l.confidence : undefined,
                })),
              );
            } else {
              // For multi-part (long receipts), we merge text and drop layout.
              setLiveLayout(undefined);
              const merged = results.length > 1 ? mergeOcrTextsByLineOverlap(results.map((r) => r.text)) : results[0]?.text ?? '';
              setLines(splitToLines(merged).map((t, idx) => ({ id: `${idx}`, text: t })));
              setViewMode('raw');
            }
          } catch {
            Alert.alert('OCR failed', 'Could not re-run OCR. Please try again.');
          } finally {
            setRetrying(false);
            setRetryMessage(undefined);
          }
        },
      },
    ]);
  }, [retrying, route.params.partImageUris, route.params.primaryImageUri, setViewMode]);

  const onDiscard = () => {
    Alert.alert('Discard changes?', 'Your OCR edits will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title="Edit Receipt Text" showBackButton onBack={onDiscard} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.metaCard}>
          <Text style={styles.metaTitle}>OCR Text</Text>
          <Text style={styles.metaBody}>
            Edit anything that looks wrong. Receipt View highlights low-confidence lines when available.
          </Text>

          <View style={{ height: SPACING.sm }} />

          <View style={styles.metaRow}>
            <Text style={styles.metaHint}>
              Confidence:{' '}
              {typeof liveConfidence === 'number' && Number.isFinite(liveConfidence)
                ? `${Math.round(liveConfidence * 100)}%`
                : '—'}
            </Text>

            <View style={styles.segmented}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Receipt view"
                onPress={() => setViewMode('receipt')}
                style={({ pressed }) => [
                  styles.segment,
                  viewMode === 'receipt' && styles.segmentActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.segmentText, viewMode === 'receipt' && styles.segmentTextActive]}>Receipt</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Raw text view"
                onPress={() => setViewMode('raw')}
                style={({ pressed }) => [
                  styles.segment,
                  viewMode === 'raw' && styles.segmentActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.segmentText, viewMode === 'raw' && styles.segmentTextActive]}>Raw</Text>
              </Pressable>
            </View>
          </View>
        </Card>

        <View style={{ height: SPACING.sm }} />

        <View style={styles.quickActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy all text"
            onPress={onCopyAll}
            style={({ pressed }) => [styles.quickActionBtn, pressed && styles.pressed]}
          >
            <Text style={styles.quickActionText}>Copy</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Export text"
            onPress={onExport}
            style={({ pressed }) => [styles.quickActionBtn, pressed && styles.pressed]}
          >
            <Text style={styles.quickActionText}>Export</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry OCR"
            onPress={onRetryOcr}
            disabled={retrying}
            style={({ pressed }) => [styles.quickActionBtn, retrying && styles.quickActionDisabled, pressed && styles.pressed]}
          >
            <Text style={styles.quickActionText}>Retry OCR</Text>
          </Pressable>
        </View>

        <View style={{ height: SPACING.md }} />

        {viewMode === 'raw' ? (
          <TextInput
            value={mergedText}
            onChangeText={(next) => {
              const nextLines = splitToLines(next);
              setLines((prev) => {
                const out: EditableLine[] = nextLines.map((t, idx) => ({
                  id: `${idx}`,
                  text: t,
                  confidence: prev[idx]?.confidence,
                }));
                return out;
              });
            }}
            multiline
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.editor}
            placeholder="OCR text will appear here..."
            placeholderTextColor={colors.textSecondary}
            textAlignVertical="top"
          />
        ) : (
          <Card style={styles.receiptCard}>
            {lines.map((l, idx) => {
              const conf = l.confidence;
              const isLow = typeof conf === 'number' && conf < 0.6;
              const isMedium = typeof conf === 'number' && conf >= 0.6 && conf < 0.8;

              return (
                <View key={l.id} style={[styles.lineRow, idx === lines.length - 1 && styles.lineRowLast]}>
                  <TextInput
                    value={l.text}
                    onChangeText={(t) => {
                      setLines((prev) => {
                        const next = prev.slice();
                        next[idx] = { ...next[idx], text: t };
                        return next;
                      });
                    }}
                    autoCorrect={false}
                    autoCapitalize="none"
                    style={[
                      styles.lineInput,
                      isLow && styles.lineLow,
                      isMedium && styles.lineMedium,
                    ]}
                    placeholder={idx === 0 ? 'Receipt text…' : undefined}
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              );
            })}
          </Card>
        )}

        <View style={{ height: SPACING.lg }} />

        <Button title="Continue" onPress={onContinue} variant="primary" />
      </ScrollView>

      <LoadingOverlay visible={retrying} message={retryMessage} />
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
    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
    metaHint: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },
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

    receiptCard: {
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    lineRow: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    lineRowLast: {
      borderBottomWidth: 0,
    },
    lineInput: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
      backgroundColor: 'transparent',
    },
    lineLow: {
      backgroundColor: 'rgba(239, 68, 68, 0.14)',
    },
    lineMedium: {
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
    },

    segmented: {
      flexDirection: 'row',
      borderRadius: RADIUS.full,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    segment: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
    },
    segmentActive: {
      backgroundColor: `${primary}1A`,
    },
    segmentText: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, fontWeight: '700' },
    segmentTextActive: { color: colors.text },
    pressed: { opacity: 0.85 },

    quickActions: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    quickActionBtn: {
      flex: 1,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickActionText: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      fontWeight: '800',
    },
    quickActionDisabled: {
      opacity: 0.45,
    },
  });

export default ReceiptTextEditorScreen;
