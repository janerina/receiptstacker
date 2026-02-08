import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, InteractionManager, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DocumentScanner, { ResponseType, ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';
import Feather from 'react-native-vector-icons/Feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { launchCamera, type Asset } from 'react-native-image-picker';

import { Button, Card } from '@/components/common';
import { LoadingOverlay } from '@/components/compositions/LoadingOverlay';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { MainStackParamList } from '@/navigation/types';
import { useTheme } from '@/hooks/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'AddReceiptScanOnly'>;

// Keep these aligned with the working ScanScreen Edge Sense options,
// but intentionally duplicated to avoid touching the main Scan flow.
const EDGE_SENSE_SCAN_ONLY = {
  cropQuality: 95,
  scannerTimeoutMs: 45_000,
};

const ensureFileUri = (uri: string) => {
  const trimmed = String(uri || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('file://')) return trimmed;
  // react-native-document-scanner-plugin returns file paths on both platforms.
  return `file://${trimmed}`;
};

const pickBestImageUri = (asset?: Asset | null) => {
  if (!asset) return '';
  return asset.uri ?? '';
};

const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const AddReceiptScanOnlyScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;

  const [scannedUri, setScannedUri] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Opening scanner...');

  const startedRef = useRef(false);
  const lastScanStartAtRef = useRef<number>(0);

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

  const openFallbackCamera = useCallback(async () => {
    try {
      const result = await launchCamera({
        mediaType: 'photo',
        quality: 0.8,
        includeBase64: false,
        saveToPhotos: false,
      });

      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert('Camera Error', result.errorMessage || 'Failed to open camera.');
        return;
      }

      const uri = pickBestImageUri(result.assets?.[0]);
      if (uri) setScannedUri(uri);
    } catch {
      Alert.alert('Error', 'Failed to open camera.');
    }
  }, []);

  const openScanner = useCallback(async () => {
    if (busy) return;

    try {
      setBusyLabel('Opening scanner...');
      setBusy(true);
      lastScanStartAtRef.current = Date.now();

      const scannerOptions: any = {
        croppedImageQuality: EDGE_SENSE_SCAN_ONLY.cropQuality,
        responseType: ResponseType.ImageFilePath,
      };

      // Explicitly single-page only.
      if (Platform.OS === 'android') {
        scannerOptions.maxNumDocuments = 1;
      }

      const res: any = await withTimeout(
        (DocumentScanner as any).scanDocument(scannerOptions),
        EDGE_SENSE_SCAN_ONLY.scannerTimeoutMs,
        'Document scan',
      );

      if (res?.status === ScanDocumentResponseStatus.Cancel) {
        // Some Play Services/ML Kit failures show a "Something went wrong" UI and then
        // the only option is Cancel, which maps to Activity.RESULT_CANCELED.
        // If the scanner closes very quickly, offer a retry instead of bouncing out.
        const elapsedMs = Date.now() - (lastScanStartAtRef.current || 0);
        if (elapsedMs > 0 && elapsedMs < 2000) {
          Alert.alert(
            'Scanner unavailable',
            'Edge Sense scanner closed unexpectedly. This is usually caused by Google Play services being missing, disabled, or updating.\n\nTry again in a moment.',
            [
              { text: 'Back', style: 'cancel', onPress: () => navigation.goBack() },
              { text: 'Try Again', onPress: () => void openScanner() },
            ],
          );
          return;
        }

        // User canceled normally: return to Add Receipt.
        navigation.goBack();
        return;
      }

      const scanned: string[] = Array.isArray(res?.scannedImages) ? res.scannedImages : [];
      const first = scanned[0];
      const uri = ensureFileUri(first);
      if (!uri) {
        // On some devices/emulators the native scanner UI can fail (often Play Services/ML Kit)
        // and returns no images. Offer a fallback camera so the user isn't blocked.
        Alert.alert(
          'Scanner unavailable',
          'The Edge Sense scanner did not return an image. You can try again, or use the standard camera instead.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
            { text: 'Use Camera', onPress: () => void openFallbackCamera() },
            { text: 'Try Again', onPress: () => void openScanner() },
          ],
        );
        return;
      }

      setScannedUri(uri);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      const lower = (msg || '').toLowerCase();
      const looksLikePlayServices =
        lower.includes('google') ||
        lower.includes('play services') ||
        lower.includes('gms') ||
        lower.includes('mlkit') ||
        lower.includes('ml kit');

      if (Platform.OS === 'android' && looksLikePlayServices) {
        Alert.alert(
          'Scanner unavailable',
          'The Edge Sense scanner failed to open. This can happen on some emulators or devices missing/updating Google Play services.\n\nYou can still attach a photo using Choose File.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
        return;
      }

      Alert.alert('Error', msg ? `Failed to scan document.\n\n${msg}` : 'Failed to scan document.');
      navigation.goBack();
    } finally {
      setBusy(false);
    }
  }, [busy, navigation, openFallbackCamera]);

  useEffect(() => {
    // Auto-open scanner on first mount.
    if (startedRef.current) return;
    startedRef.current = true;

    // Wait until navigation transitions/layout settle before opening the native scanner.
    const task = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        void openScanner();
      }, 250);
    });

    return () => {
      task.cancel();
    };
  }, [openScanner]);

  const onUsePhoto = useCallback(() => {
    if (!scannedUri) return;

    // Navigate back to the existing Add Receipt screen with the scanned image.
    // Works from both Main stack and Home stack, since both have an AddManually route.
    (navigation as any).navigate('AddManually', {
      scannedImageUri: scannedUri,
      scannedImageToken: Date.now(),
    });
  }, [navigation, scannedUri]);

  const onRetake = useCallback(() => {
    setScannedUri('');
    void openScanner();
  }, [openScanner]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <Feather name="arrow-left" size={ICON_SIZES.md} color={colors.text} />
        </Pressable>

        <Text style={styles.headerTitle}>Review Scan</Text>

        <View style={styles.headerRightSpacer} />
      </View>

      <View style={styles.body}>
        {scannedUri ? (
          <Card variant="default" style={styles.previewCard}>
            <Image source={{ uri: scannedUri }} style={styles.previewImage} resizeMode="contain" />
          </Card>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Opening camera...</Text>
          </View>
        )}

        <View style={styles.actions}>
          <Button
            title="Retake"
            variant="secondary"
            onPress={onRetake}
            disabled={busy}
            style={styles.actionLeft}
          />
          <Button
            title="Use Photo"
            variant="primary"
            onPress={onUsePhoto}
            disabled={!scannedUri || busy}
            style={styles.actionRight}
          />
        </View>
      </View>

      <LoadingOverlay visible={busy} message={busyLabel} />
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
}: {
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
  };
  primary: string;
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    pressed: {
      opacity: 0.85,
    },
    header: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    headerTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
    },
    headerRightSpacer: {
      width: 44,
      height: 44,
    },
    body: {
      flex: 1,
      padding: SPACING.lg,
      justifyContent: 'space-between',
    },
    previewCard: {
      flex: 1,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: SPACING.md,
    },
    previewImage: {
      flex: 1,
      width: '100%',
      borderRadius: 14,
      backgroundColor: '#000',
    },
    placeholder: {
      flex: 1,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
    },
    actions: {
      flexDirection: 'row',
      gap: SPACING.md,
      paddingTop: SPACING.lg,
    },
    actionLeft: {
      flex: 1,
    },
    actionRight: {
      flex: 1,
    },
  });

export default AddReceiptScanOnlyScreen;
