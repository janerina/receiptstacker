import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { launchImageLibrary } from 'react-native-image-picker';

import DocumentScanner, { ResponseType, ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';

import { recognizeTextWithMlKit, mergeOcrTextsByLineOverlap } from '@/services/scan/ocr';
import { setLastScanSessionResult } from '@/services/scan/sessionStore';
import type { CapturedImage, ScanMode, ScanSession, ScanSessionResult } from '@/services/scan/types';
import {
  addReceipt,
  deleteReceipt,
  getReceiptById,
  saveReceiptImages,
  saveReceiptItems,
  saveReceiptOcrData,
  saveReceiptParsedData,
  updateReceipt,
} from '@/services/database';

import { IconButton } from '@/components/common';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { BottomTabParamList, MainStackParamList } from '@/navigation';
import { GuidedTourModal, type GuidedTourStep } from '@/components/tour';
import {
  clearTourStage,
  getScanOnlyPreference,
  getTourStage,
  isTourCompleted,
  saveScanOnlyPreference,
  saveTourCompleted,
  setTourStage,
} from '@/services/storage';

type Props = CompositeScreenProps<
  BottomTabScreenProps<BottomTabParamList, 'Scan'>,
  NativeStackScreenProps<MainStackParamList, 'BottomTabs'>
>;

const toRgba = (hexOrColor: string, alpha: number) => {
  const c = hexOrColor.trim();

  if (/^#([0-9a-fA-F]{3})$/.test(c)) {
    const r = parseInt(c[1] + c[1], 16);
    const g = parseInt(c[2] + c[2], 16);
    const b = parseInt(c[3] + c[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (/^#([0-9a-fA-F]{6})$/.test(c)) {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return hexOrColor;
};

const ensureFileUri = (pathOrUri: string) => {
  if (pathOrUri.startsWith('file://')) return pathOrUri;
  return `file://${pathOrUri}`;
};

const makeId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const EDGE_SENSE_TUNING = {
  cameraReleaseDelayMs: Platform.OS === 'android' ? 500 : 160,
  scannerTimeoutMs: Platform.OS === 'android' ? 60_000 : 45_000,
  // VisionCamera capture can occasionally hang when the app is backgrounded or camera is contended.
  cameraCaptureTimeoutMs: Platform.OS === 'android' ? 15_000 : 12_000,
  // Android-only in the scanner module; iOS ignores it.
  // Keep this conservative; some Android ML Kit scanner backends behave poorly with high limits.
  maxNumDocumentsAndroid: 10,
  cropQuality: Platform.OS === 'android' ? 100 : 100,
} as const;

export const ScanScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const primary = COLORS.brand.primary;

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [flashMode, setFlashMode] = useState<'off' | 'on'>('off');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturingLabel, setCapturingLabel] = useState('Capturing…');
  const [isEdgeScannerOpen, setIsEdgeScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('single');
  const [captured, setCaptured] = useState<CapturedImage[]>([]);
  const [processingLabel, setProcessingLabel] = useState<string>('');
  const [processingDetail, setProcessingDetail] = useState<string>('');
  const [edgeSenseEnabled, setEdgeSenseEnabled] = useState(true);
  const [scanOnly, setScanOnly] = useState(false);
  const [activeDocumentId, setActiveDocumentId] = useState<string>(() => makeId());
  const [tipsVisible, setTipsVisible] = useState(false);
  const [preview, setPreview] = useState<CapturedImage | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [singlePreview, setSinglePreview] = useState<null | { receiptId: string; imageUri: string }>(null);
  const [multiPagePreview, setMultiPagePreview] = useState<null | { receiptId: string; imageUri: string; capturedId: string }>(null);
  const [multiPagePreviewQueue, setMultiPagePreviewQueue] = useState<
    Array<{ receiptId: string; imageUri: string; capturedId: string }>
  >([]);
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(1);

  const cameraRef = useRef<Camera | null>(null);
  const device = useCameraDevice('back');

  const cancelRequestedRef = useRef(false);

  const scanAnim = useRef(new Animated.Value(0)).current;

  // --- Guided tour (staged flow) ---
  const modeSelectorRef = useRef<View>(null);
  const edgeSenseRef = useRef<View>(null);
  const captureRef = useRef<View>(null);
  const [tourVisible, setTourVisible] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const tourSteps: GuidedTourStep[] = useMemo(
    () => [
      {
        key: 'mode',
        title: 'Choose a Scan Mode',
        body: 'Pick Single, Multi, or Long depending on your receipt and how many pages/parts you need.',
        ref: modeSelectorRef,
      },
      {
        key: 'edge',
        title: 'Edge Sense',
        body: 'Use Edge Sense for automatic edge detection and cropping (recommended).',
        ref: edgeSenseRef,
      },
      {
        key: 'capture',
        title: 'Capture',
        body: 'Tap to capture. For Multi/Long, capture multiple parts then press Done to process OCR.',
        ref: captureRef,
      },
    ],
    [],
  );

  const cancelTour = useCallback(async () => {
    setTourVisible(false);
    setTourStep(0);
    try {
      await saveTourCompleted(true);
      await clearTourStage();
    } catch {
      // non-fatal
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const run = async () => {
        const [completed, stage] = await Promise.all([isTourCompleted(), getTourStage()]);
        if (!active) return;
        if (!completed && stage === 'scan') {
          setTourStep(0);
          setTourVisible(true);
        }
      };
      run().catch(() => undefined);
      return () => {
        active = false;
      };
    }, []),
  );

  const handleTourNext = useCallback(() => {
    if (tourStep >= tourSteps.length - 1) {
      setTourVisible(false);
      setTourStep(0);
      setTourStage('analytics')
        .catch(() => undefined)
        .finally(() => {
          (navigation as any)?.navigate?.('Analytics');
        });
      return;
    }
    setTourStep((s) => s + 1);
  }, [navigation, tourStep, tourSteps.length]);

  const frameMetrics = useMemo(() => {
    const horizontalMargin = SPACING.lg;
    const topReserved = Math.max(insets.top, 0) + 120;
    const bottomReserved = Math.max(insets.bottom, 0) + 210;

    const frameWidth = Math.max(240, screenWidth - horizontalMargin * 2);
    const maxFrameHeight = Math.max(260, screenHeight - topReserved - bottomReserved);

    // Receipts are tall; bias height a bit, but keep within viewport.
    const preferredHeight = frameWidth * 1.6;
    const frameHeight = Math.max(260, Math.min(maxFrameHeight, preferredHeight));

    const frameTop = topReserved + Math.max(0, (maxFrameHeight - frameHeight) / 2);
    const frameLeft = (screenWidth - frameWidth) / 2;

    return {
      frameWidth,
      frameHeight,
      frameTop,
      frameLeft,
    };
  }, [insets.bottom, insets.top, screenHeight, screenWidth]);

  const styles = useMemo(
    () =>
      createStyles({
        colors,
        insetTop: insets.top,
        insetBottom: insets.bottom,
        primary,
        frame: frameMetrics,
      }),
    [colors, frameMetrics, insets.bottom, insets.top, primary],
  );

  useEffect(() => {
    let mounted = true;

    const request = async () => {
      try {
        const status = await Camera.requestCameraPermission();
        if (!mounted) return;
        setHasPermission(status === 'granted');
      } catch {
        if (!mounted) return;
        setHasPermission(false);
      }
    };

    request();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getScanOnlyPreference()
      .then((v) => {
        if (!mounted) return;
        if (typeof v === 'boolean') setScanOnly(v);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const toggleScanOnly = useCallback(() => {
    setScanOnly((prev) => {
      const next = !prev;
      saveScanOnlyPreference(next).catch(() => undefined);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!device) return;
    const neutral = typeof device.neutralZoom === 'number' ? device.neutralZoom : 1;
    setZoom((z) => (Number.isFinite(z) && z > 0 ? z : neutral));
  }, [device]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [scanAnim]);

  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert('Settings', 'Please enable camera permission in settings.');
    }
  };

  const handleFlashToggle = () => {
    setFlashMode((prev) => (prev === 'off' ? 'on' : 'off'));
  };

  const resetSession = useCallback(() => {
    setCaptured([]);
    setProcessingLabel('');
    setProcessingDetail('');
    setPreview(null);
    setReviewVisible(false);
    cancelRequestedRef.current = false;
  }, []);

  const requestCancel = useCallback(() => {
    if (!isProcessing) return;
    cancelRequestedRef.current = true;
    setProcessingLabel('Canceling…');
    setProcessingDetail('');
  }, [isProcessing]);

  const createDraftReceipt = useCallback(
    async (imageUri: string, mode: ScanMode, documentId: string): Promise<string> => {
      const receiptId = makeId();

      // Persist a draft right away so the scan isn't lost.
      const nowIso = new Date().toISOString();
      await addReceipt({
        id: receiptId,
        documentId,
        merchant: 'Scanned Receipt',
        amount: 0,
        date: nowIso,
        categoryId: 'other',
        scanMode: mode,
        imageUri,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      await saveReceiptImages(receiptId, [{ imageType: 'original', filePath: imageUri }]);
      return receiptId;
    },
    [],
  );

  const advanceMultiPagePreview = useCallback(() => {
    setMultiPagePreviewQueue((prev) => {
      const next = prev.slice();
      const head = next.shift();
      setMultiPagePreview(head ?? null);
      return next;
    });
  }, []);

  const processSingleOcrForReceipt = useCallback(
    async (receiptId: string, imageUri: string, opts?: { navigateToEditor?: boolean }) => {
      try {
        setIsProcessing(true);
        setProcessingLabel('Running OCR…');
        setProcessingDetail('');
        cancelRequestedRef.current = false;

        const ocr = await recognizeTextWithMlKit(imageUri);

        if (cancelRequestedRef.current) return;

        try {
          await saveReceiptOcrData(receiptId, {
            originalText: ocr.text,
            rawResultJson: ocr.rawResultJson,
            engine: 'mlkit',
            confidence: ocr.confidence,
          });
        } catch {
          // ignore
        }

        try {
          await saveReceiptParsedData(receiptId, ocr.extracted ?? {});

          const ex = (ocr.extracted ?? {}) as any;
          const merchant = typeof ex.merchant === 'string' && ex.merchant.trim().length ? ex.merchant.trim() : undefined;
          const amount = typeof ex.amount === 'string' && ex.amount.trim().length ? Number(ex.amount) : NaN;
          const dateIso = typeof ex.date === 'string' && ex.date.trim().length ? ex.date : undefined;
          const categoryId = typeof ex.categoryId === 'string' && ex.categoryId.trim().length ? ex.categoryId : undefined;
          const paymentMethod = typeof ex.paymentMethod === 'string' && ex.paymentMethod.trim().length ? ex.paymentMethod.trim() : undefined;

          const next: any = { imageUri };
          if (merchant) next.merchant = merchant;
          if (Number.isFinite(amount)) next.amount = amount;
          if (dateIso) next.date = dateIso;
          if (categoryId) next.categoryId = categoryId;
          if (paymentMethod) next.paymentMethod = paymentMethod;
          await updateReceipt(receiptId, next);
        } catch {
          // ignore
        }

        // Best-effort: persist initial parsed line items right away.
        try {
          const items = (ocr.extracted as any)?.items;
          if (Array.isArray(items) && items.length) {
            await saveReceiptItems(
              receiptId,
              items
                .map((it: any) => ({
                  itemName: typeof it?.name === 'string' ? it.name : '',
                  quantity: typeof it?.quantity === 'number' ? it.quantity : 1,
                  unitPrice: typeof it?.unitPrice === 'number' ? it.unitPrice : undefined,
                  totalPrice: typeof it?.totalPrice === 'number' ? it.totalPrice : 0,
                  itemConfidence: typeof it?.confidence === 'number' ? it.confidence : undefined,
                }))
                .filter((it: any) => String(it.itemName).trim().length > 0),
            );
          }
        } catch {
          // ignore
        }

        if (opts?.navigateToEditor !== false) {
          const stackNav: any = (navigation as any).getParent?.() ?? navigation;
          stackNav.navigate('ReceiptTextEditor', {
            source: 'single',
            receiptId,
            primaryImageUri: imageUri,
            partImageUris: [imageUri],
            ocrTextOriginal: ocr.text,
            ocrRawJson: ocr.rawResultJson,
            ocrConfidence: ocr.confidence,
            ocrLayout: ocr.layout,
            extracted: ocr.extracted ?? {},
          });
        }
      } catch (e) {
        console.error('OCR error:', e);
        Alert.alert('OCR failed', 'Could not read text from the image. You can still enter the receipt manually.');
        if (opts?.navigateToEditor !== false) {
          const stackNav: any = (navigation as any).getParent?.() ?? navigation;
          stackNav.navigate('AddManually', { receiptId, extractedData: { imageUri } });
        }
      } finally {
        setIsProcessing(false);
        setProcessingLabel('');
        setProcessingDetail('');
        cancelRequestedRef.current = false;
      }
    },
    [navigation],
  );

  const withTimeout = useCallback(async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (t) clearTimeout(t);
    }
  }, []);

  const scanWithEdgeSense = useCallback(async () => {
    if (isCapturing || isProcessing) return;

    try {
      setCapturingLabel('Opening scanner…');
      setIsCapturing(true);
      setIsEdgeScannerOpen(true);

      // Give VisionCamera a moment to release the camera before opening the native scanner.
      await new Promise<void>((resolve) => setTimeout(resolve, EDGE_SENSE_TUNING.cameraReleaseDelayMs));

      const maxNumDocuments = scanMode === 'single' ? 1 : EDGE_SENSE_TUNING.maxNumDocumentsAndroid;

      const scannerOptions: any = {
        croppedImageQuality: EDGE_SENSE_TUNING.cropQuality,
        responseType: ResponseType.ImageFilePath,
      };
      if (Platform.OS === 'android') {
        scannerOptions.maxNumDocuments = maxNumDocuments;
      }

      const res: any = await withTimeout(
        (DocumentScanner as any).scanDocument(scannerOptions),
        EDGE_SENSE_TUNING.scannerTimeoutMs,
        'Document scan',
      );

      // iOS/Android native scanner may return cancel status.
      if (res?.status === ScanDocumentResponseStatus.Cancel) return;

      const scanned: string[] = Array.isArray(res?.scannedImages) ? res.scannedImages : [];
      if (!scanned.length) return;

      const uris = scanned.map(ensureFileUri);

      if (scanMode === 'single') {
        try {
          setProcessingLabel('Saving scan…');
          setProcessingDetail('');
          const receiptId = await createDraftReceipt(uris[0], 'single', activeDocumentId);
          setSinglePreview({ receiptId, imageUri: uris[0] });
        } catch (e) {
          console.error('Draft save error:', e);
          Alert.alert('Error', 'Failed to save the scan. Please try again.');
        }
        return;
      }

      if (scanMode === 'multi') {
        try {
          setCapturingLabel('Saving…');
          const itemsForPreview: Array<{ receiptId: string; imageUri: string; capturedId: string }> = [];

          for (const uri of uris) {
            const receiptId = await createDraftReceipt(uri, 'multi', activeDocumentId);
            const capturedId = makeId();
            itemsForPreview.push({ receiptId, imageUri: uri, capturedId });
          }

          // Append to captured and kick off per-page preview flow.
          setCaptured((prev) => {
            let order = prev.length;
            const nextCaptured: CapturedImage[] = itemsForPreview.map((p) => {
              order += 1;
              return { id: p.capturedId, uri: p.imageUri, receiptId: p.receiptId, createdAt: Date.now(), order };
            });
            return [...prev, ...nextCaptured];
          });

          // If a preview is already open, queue these; else open immediately.
          setMultiPagePreviewQueue((prev) => {
            const combined = [...prev, ...itemsForPreview];
            if (!multiPagePreview) {
              const [head, ...rest] = combined;
              setMultiPagePreview(head ?? null);
              return rest;
            }
            return combined;
          });
        } catch (e) {
          console.error('Draft save error:', e);
          Alert.alert('Error', 'Failed to save the scan. Please try again.');
        }
        return;
      }

      setCaptured((prev) => {
        let order = prev.length;
        const next = uris.map((uri) => {
          order += 1;
          const img: CapturedImage = { id: makeId(), uri, createdAt: Date.now(), order };
          return img;
        });
        return [...prev, ...next];
      });
    } catch (e) {
      console.error('Edge-sense scan error:', e);
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
          'The Edge Sense scanner failed to open. This can happen on some emulators or devices missing/updating Google Play services.\n\nYou can continue using Manual mode (camera capture) instead.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Use Manual',
              onPress: () => {
                setEdgeSenseEnabled(false);
              },
            },
          ],
        );
        return;
      }

      Alert.alert('Error', msg ? `Failed to scan document.\n\n${msg}` : 'Failed to scan document.');
    } finally {
      setIsCapturing(false);
      setIsEdgeScannerOpen(false);
    }
  }, [activeDocumentId, createDraftReceipt, isCapturing, isProcessing, multiPagePreview, scanMode, withTimeout]);

  const processSingleToEditor = useCallback(
    async (imageUri: string) => {
      const receiptId = makeId();
      try {
        setProcessingLabel('Saving scan…');
        setProcessingDetail('');

        cancelRequestedRef.current = false;

        // Persist a draft right away so the scan is not lost if the user backs out.
        // Best-effort; do not block the UX.
        try {
          const nowIso = new Date().toISOString();
          const existing = await getReceiptById(receiptId);
          if (!existing) {
            await addReceipt({
              id: receiptId,
              merchant: 'Scanned Receipt',
              amount: 0,
              date: nowIso,
              categoryId: 'other',
              scanMode: 'single',
              imageUri,
              createdAt: nowIso,
              updatedAt: nowIso,
            });
          }
          await saveReceiptImages(receiptId, [{ imageType: 'original', filePath: imageUri }]);
          setProcessingDetail('Image saved');
        } catch {
          // ignore
        }

        setProcessingLabel('Running OCR…');

        const ocr = await recognizeTextWithMlKit(imageUri);

        if (cancelRequestedRef.current) {
          return;
        }

        try {
          await saveReceiptOcrData(receiptId, {
            originalText: ocr.text,
            rawResultJson: ocr.rawResultJson,
            engine: 'mlkit',
            confidence: ocr.confidence,
          });
        } catch {
          // ignore
        }

        try {
          await saveReceiptParsedData(receiptId, ocr.extracted ?? {});

          const ex = (ocr.extracted ?? {}) as any;
          const merchant = typeof ex.merchant === 'string' && ex.merchant.trim().length ? ex.merchant.trim() : undefined;
          const amount = typeof ex.amount === 'string' && ex.amount.trim().length ? Number(ex.amount) : NaN;
          const dateIso = typeof ex.date === 'string' && ex.date.trim().length ? ex.date : undefined;
          const categoryId = typeof ex.categoryId === 'string' && ex.categoryId.trim().length ? ex.categoryId : undefined;
          const paymentMethod = typeof ex.paymentMethod === 'string' && ex.paymentMethod.trim().length ? ex.paymentMethod.trim() : undefined;

          const next: any = { imageUri };
          if (merchant) next.merchant = merchant;
          if (Number.isFinite(amount)) next.amount = amount;
          if (dateIso) next.date = dateIso;
          if (categoryId) next.categoryId = categoryId;
          if (paymentMethod) next.paymentMethod = paymentMethod;
          await updateReceipt(receiptId, next);
        } catch {
          // ignore
        }

        // Best-effort: persist initial parsed line items right away so the receipt has
        // searchable/viewable items even before the user reviews OCR.
        try {
          const items = (ocr.extracted as any)?.items;
          if (Array.isArray(items) && items.length) {
            await saveReceiptItems(
              receiptId,
              items
                .map((it: any) => ({
                  itemName: typeof it?.name === 'string' ? it.name : '',
                  quantity: typeof it?.quantity === 'number' ? it.quantity : 1,
                  unitPrice: typeof it?.unitPrice === 'number' ? it.unitPrice : undefined,
                  totalPrice: typeof it?.totalPrice === 'number' ? it.totalPrice : 0,
                  itemConfidence: typeof it?.confidence === 'number' ? it.confidence : undefined,
                }))
                .filter((it: any) => String(it.itemName).trim().length > 0),
            );
          }
        } catch {
          // ignore
        }

        const stackNav: any = (navigation as any).getParent?.() ?? navigation;
        stackNav.navigate('ReceiptTextEditor', {
          source: 'single',
          receiptId,
          primaryImageUri: imageUri,
          partImageUris: [imageUri],
          ocrTextOriginal: ocr.text,
          ocrRawJson: ocr.rawResultJson,
          ocrConfidence: ocr.confidence,
          ocrLayout: ocr.layout,
          extracted: ocr.extracted ?? {},
        });
      } catch (e) {
        console.error('OCR error:', e);
        Alert.alert('OCR failed', 'Could not read text from the image. You can still enter the receipt manually.');
        const stackNav: any = (navigation as any).getParent?.() ?? navigation;
        stackNav.navigate('AddManually', { receiptId, extractedData: { imageUri } });
      } finally {
        setIsProcessing(false);
        cancelRequestedRef.current = false;
      }
    },
    [navigation],
  );

  const processMultiSession = useCallback(async () => {
    if (isProcessing) return;
    if (!captured.length) return;

    try {
      setIsProcessing(true);
      setProcessingLabel('Processing receipts…');
      cancelRequestedRef.current = false;

      const session: ScanSession = {
        id: makeId(),
        mode: 'multi',
        images: captured.slice().sort((a, b) => a.order - b.order),
        createdAt: Date.now(),
      };

      const results: ScanSessionResult['results'] = [];
      for (let i = 0; i < session.images.length; i += 1) {
        if (cancelRequestedRef.current) throw new Error('cancelled');
        const img = session.images[i];
        setProcessingDetail(`OCR ${i + 1}/${session.images.length}`);
        const ocr = await recognizeTextWithMlKit(img.uri);
        results.push({ image: img, ocr });
      }

      setLastScanSessionResult({ session, results });
      resetSession();
      navigation.navigate('ScanSessionReview');
    } catch (e) {
      if (e instanceof Error && e.message === 'cancelled') {
        resetSession();
      } else {
        console.error('Multi-session OCR error:', e);
        Alert.alert('Error', 'Failed to process the scan session. Please try again.');
      }
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
      setProcessingDetail('');
      cancelRequestedRef.current = false;
    }
  }, [captured, isProcessing, navigation, resetSession]);

  const processLongReceipt = useCallback(async () => {
    if (isProcessing) return;
    if (!captured.length) return;

    try {
      setIsProcessing(true);
      setProcessingLabel('Processing long receipt…');
      cancelRequestedRef.current = false;

      const ordered = captured.slice().sort((a, b) => a.order - b.order);
      const texts: string[] = [];
      let rawJson: string | undefined;
      let extracted: any = {};
      const confidences: number[] = [];

      for (let i = 0; i < ordered.length; i += 1) {
        if (cancelRequestedRef.current) throw new Error('cancelled');
        setProcessingDetail(`OCR part ${i + 1}/${ordered.length}`);
        const ocr = await recognizeTextWithMlKit(ordered[i].uri);
        texts.push(ocr.text);
        rawJson = rawJson ?? ocr.rawResultJson;
        extracted = extracted?.merchant ? extracted : (ocr.extracted ?? {});
        if (typeof ocr.confidence === 'number' && Number.isFinite(ocr.confidence)) confidences.push(ocr.confidence);
      }

      const merged = mergeOcrTextsByLineOverlap(texts);
      const avgConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : undefined;

      navigation.navigate('ReceiptTextEditor', {
        source: 'long',
        primaryImageUri: ordered[0].uri,
        partImageUris: ordered.map((p) => p.uri),
        ocrTextOriginal: merged,
        ocrRawJson: rawJson,
        ocrConfidence: avgConfidence,
        extracted,
      });
      resetSession();
    } catch (e) {
      if (e instanceof Error && e.message === 'cancelled') {
        resetSession();
      } else {
        console.error('Long-receipt OCR error:', e);
        Alert.alert('Error', 'Failed to process the long receipt. Please try again.');
      }
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
      setProcessingDetail('');
      cancelRequestedRef.current = false;
    }
  }, [captured, isProcessing, navigation, resetSession]);

  const handleCapture = async () => {
    if (edgeSenseEnabled) {
      await scanWithEdgeSense();
      return;
    }

    if (!cameraRef.current || isCapturing || isProcessing) return;

    try {
      setCapturingLabel('Capturing…');
      setIsCapturing(true);

      const photo = await withTimeout(
        cameraRef.current.takePhoto({
          flash: flashMode === 'on' ? 'on' : 'off',
          qualityPrioritization: 'quality',
        }),
        EDGE_SENSE_TUNING.cameraCaptureTimeoutMs,
        'Camera capture',
      );

      // Captured. From here on, we are no longer "capturing".
      setIsCapturing(false);

      const uri = ensureFileUri(photo.path);
      if (scanMode === 'single') {
        try {
          setCapturingLabel('Saving…');
          const receiptId = await createDraftReceipt(uri, 'single', activeDocumentId);
          setSinglePreview({ receiptId, imageUri: uri });
        } catch (e) {
          console.error('Draft save error:', e);
          Alert.alert('Error', 'Failed to save the scan. Please try again.');
        }
        return;
      }

      if (scanMode === 'multi') {
        try {
          setCapturingLabel('Saving…');
          const receiptId = await createDraftReceipt(uri, 'multi', activeDocumentId);
          const capturedId = makeId();
          const createdAt = Date.now();

          setCaptured((prev) => {
            const order = prev.length + 1;
            const next: CapturedImage = { id: capturedId, uri, receiptId, createdAt, order };
            return [...prev, next];
          });

          const item = { receiptId, imageUri: uri, capturedId };
          setMultiPagePreviewQueue((prev) => {
            const combined = [...prev, item];
            if (!multiPagePreview) {
              const [head, ...rest] = combined;
              setMultiPagePreview(head ?? null);
              return rest;
            }
            return combined;
          });
        } catch (e) {
          console.error('Draft save error:', e);
          Alert.alert('Error', 'Failed to save the scan. Please try again.');
        }
        return;
      }

      // Long: treat each part as a page (saved as its own receipt) and review immediately.
      try {
        setCapturingLabel('Saving…');
        const receiptId = await createDraftReceipt(uri, 'long', activeDocumentId);
        const capturedId = makeId();
        const createdAt = Date.now();

        setCaptured((prev) => {
          const order = prev.length + 1;
          const next: CapturedImage = { id: capturedId, uri, receiptId, createdAt, order };
          return [...prev, next];
        });

        setMultiPagePreviewQueue((prev) => {
          const item = { receiptId, imageUri: uri, capturedId };
          const combined = [...prev, item];
          if (!multiPagePreview) {
            const [head, ...rest] = combined;
            setMultiPagePreview(head ?? null);
            return rest;
          }
          return combined;
        });
      } catch (e) {
        console.error('Draft save error:', e);
        Alert.alert('Error', 'Failed to save the scan. Please try again.');
      }
    } catch (e) {
      console.error('Capture error:', e);
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', msg ? `Failed to capture photo.\n\n${msg}` : 'Failed to capture photo. Please try again.');
      setIsProcessing(false);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleGalleryPick = async () => {
    if (isProcessing) return;

    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: scanMode === 'single' ? 1 : 0,
        quality: 0.8,
      });

      const assets = res.assets ?? [];
      const picked = assets.filter((a) => Boolean(a.uri)).map((a) => a.uri as string);
      if (!picked.length) return;

      if (scanMode === 'single') {
        const uri = ensureFileUri(picked[0]);
        try {
          setProcessingLabel('Saving scan…');
          setProcessingDetail('');
          const receiptId = await createDraftReceipt(uri, 'single', activeDocumentId);
          setSinglePreview({ receiptId, imageUri: uri });
        } catch (e) {
          console.error('Draft save error:', e);
          Alert.alert('Error', 'Failed to save the scan. Please try again.');
        }
        return;
      }

      if (scanMode === 'multi') {
        try {
          setProcessingLabel('Saving scans…');
          setProcessingDetail('');

          const itemsForPreview: Array<{ receiptId: string; imageUri: string; capturedId: string }> = [];
          for (const p of picked) {
            const uri = ensureFileUri(p);
            const receiptId = await createDraftReceipt(uri, 'multi', activeDocumentId);
            const capturedId = makeId();
            itemsForPreview.push({ receiptId, imageUri: uri, capturedId });
          }

          setCaptured((prev) => {
            let order = prev.length;
            const nextCaptured: CapturedImage[] = itemsForPreview.map((p) => {
              order += 1;
              return { id: p.capturedId, uri: p.imageUri, receiptId: p.receiptId, createdAt: Date.now(), order };
            });
            return [...prev, ...nextCaptured];
          });

          setMultiPagePreviewQueue((prev) => {
            const combined = [...prev, ...itemsForPreview];
            if (!multiPagePreview) {
              const [head, ...rest] = combined;
              setMultiPagePreview(head ?? null);
              return rest;
            }
            return combined;
          });
        } catch (e) {
          console.error('Gallery save error:', e);
          Alert.alert('Error', 'Failed to save selected images.');
        } finally {
          setProcessingLabel('');
          setProcessingDetail('');
        }
        return;
      }

      // Long: save selected images as individual parts (receipts) and review each.
      try {
        setProcessingLabel('Saving scans…');
        setProcessingDetail('');

        const itemsForPreview: Array<{ receiptId: string; imageUri: string; capturedId: string }> = [];
        for (const p of picked) {
          const uri = ensureFileUri(p);
          const receiptId = await createDraftReceipt(uri, 'long', activeDocumentId);
          const capturedId = makeId();
          itemsForPreview.push({ receiptId, imageUri: uri, capturedId });
        }

        setCaptured((prev) => {
          let order = prev.length;
          const nextCaptured: CapturedImage[] = itemsForPreview.map((p) => {
            order += 1;
            return { id: p.capturedId, uri: p.imageUri, receiptId: p.receiptId, createdAt: Date.now(), order };
          });
          return [...prev, ...nextCaptured];
        });

        setMultiPagePreviewQueue((prev) => {
          const combined = [...prev, ...itemsForPreview];
          if (!multiPagePreview) {
            const [head, ...rest] = combined;
            setMultiPagePreview(head ?? null);
            return rest;
          }
          return combined;
        });
      } catch (e) {
        console.error('Gallery save error:', e);
        Alert.alert('Error', 'Failed to save selected images.');
      } finally {
        setProcessingLabel('');
        setProcessingDetail('');
      }
    } catch (e) {
      console.error('Gallery pick error:', e);
      Alert.alert('Error', 'Failed to pick image.');
      setIsProcessing(false);
    }
  };

  const removeCaptured = useCallback((id: string, receiptId?: string) => {
    if (receiptId) {
      deleteReceipt(receiptId).catch(() => undefined);
    }
    setCaptured((prev) => prev.filter((p) => p.id !== id).map((p, idx) => ({ ...p, order: idx + 1 })));
  }, []);

  const moveCaptured = useCallback((id: string, delta: -1 | 1) => {
    setCaptured((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0) return prev;
      const nextIdx = idx + delta;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;

      const next = prev.slice();
      const [item] = next.splice(idx, 1);
      next.splice(nextIdx, 0, item);
      return next.map((p, i) => ({ ...p, order: i + 1 }));
    });
  }, []);

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.permissionContainer} edges={['top', 'bottom']}>
        <Text style={styles.permissionText}>Requesting camera permission…</Text>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.permissionContainer} edges={['top', 'bottom']}>
        <Text style={styles.permissionError} accessibilityRole="alert">
          Camera permission denied
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          onPress={openSettings}
          style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
        >
          <Text style={styles.settingsButtonText}>Open Settings</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {device && !isEdgeScannerOpen ? (
        <Camera
          ref={(ref) => {
            cameraRef.current = ref;
          }}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isFocused}
          photo
          torch={flashMode === 'on' ? 'on' : 'off'}
          zoom={clamp(zoom, device.minZoom, Math.min(device.maxZoom, 5))}
        />
      ) : (
        <SafeAreaView style={styles.permissionContainer} edges={['top', 'bottom']}>
          <Text style={styles.permissionError} accessibilityRole="alert">
            No camera device available
          </Text>
        </SafeAreaView>
      )}

      {!edgeSenseEnabled ? (
        <>
          {/* Dark overlay pieces with center cutout */}
          <View pointerEvents="none" style={styles.overlayTop} />
          <View pointerEvents="none" style={styles.overlayLeft} />
          <View pointerEvents="none" style={styles.overlayRight} />
          <View pointerEvents="none" style={styles.overlayBottom} />

          {/* Frame border + corners */}
          <View pointerEvents="none" style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {showGrid ? (
              <>
                <View style={[styles.gridLineV, { left: '33.333%' }]} />
                <View style={[styles.gridLineV, { left: '66.666%' }]} />
                <View style={[styles.gridLineH, { top: '33.333%' }]} />
                <View style={[styles.gridLineH, { top: '66.666%' }]} />
              </>
            ) : null}

            <Animated.View
              style={[
                styles.scanLine,
                {
                  transform: [
                    {
                      translateY: scanAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.max(0, frameMetrics.frameHeight - 2)],
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>
        </>
      ) : null}

      {!edgeSenseEnabled && scanMode === 'long' && captured.length > 0 ? (
        <View pointerEvents="none" style={styles.overlapGuide}>
          <Text style={styles.overlapTitle}>Overlap guide</Text>
          <Text style={styles.overlapSub}>Align the next shot so this bottom strip repeats at the top.</Text>
          <View style={styles.overlapImageWrap}>
            <Image source={{ uri: captured[captured.length - 1].uri }} style={styles.overlapImage} />
          </View>
        </View>
      ) : null}

      <Text style={styles.instruction} accessibilityRole="text">
        {scanMode === 'single'
          ? edgeSenseEnabled
            ? 'Edge Sense ON • Auto-crop enabled'
            : 'Position receipt in frame'
          : scanMode === 'multi'
            ? `Multi-Page: ${captured.length} captured • Tap Done to OCR`
            : `Long Receipt: capture overlapping parts (20–30%) • Part ${Math.max(1, captured.length + 1)}`}
      </Text>

      <SafeAreaView ref={modeSelectorRef} collapsable={false} pointerEvents="box-none" style={styles.modeSelector} edges={['top']}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setScanMode('single');
            resetSession();
            setActiveDocumentId(makeId());
          }}
          style={({ pressed }) => [styles.modePill, scanMode === 'single' && styles.modePillActive, pressed && styles.pressed]}
        >
          <Text style={[styles.modePillText, scanMode === 'single' && styles.modePillTextActive]}>Single</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setScanMode('multi');
            resetSession();
            setActiveDocumentId(makeId());
          }}
          style={({ pressed }) => [styles.modePill, scanMode === 'multi' && styles.modePillActive, pressed && styles.pressed]}
        >
          <Text style={[styles.modePillText, scanMode === 'multi' && styles.modePillTextActive]}>Multi</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setScanMode('long');
            resetSession();
            setActiveDocumentId(makeId());
          }}
          style={({ pressed }) => [styles.modePill, scanMode === 'long' && styles.modePillActive, pressed && styles.pressed]}
        >
          <Text style={[styles.modePillText, scanMode === 'long' && styles.modePillTextActive]}>Long</Text>
        </Pressable>
      </SafeAreaView>

      {/* Top overlay buttons */}
      <SafeAreaView pointerEvents="box-none" style={styles.topControls} edges={['top']}>
        <IconButton
          size="md"
          variant="ghost"
          icon={<Feather name="chevron-left" size={ICON_SIZES.md} color={COLORS.common.white} />}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Back"
          style={styles.overlayIconButton}
        />

        <View style={styles.topRightGroup}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={scanOnly ? 'Disable scan only' : 'Enable scan only'}
            accessibilityState={{ checked: scanOnly }}
            onPress={toggleScanOnly}
            style={({ pressed }) => [styles.scanOnlyPill, pressed && styles.pressed]}
          >
            <Feather name={scanOnly ? 'check-square' : 'square'} size={ICON_SIZES.sm} color={COLORS.common.white} />
            <Text style={styles.scanOnlyText}>Scan Only</Text>
          </Pressable>

          <View ref={edgeSenseRef} collapsable={false}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={edgeSenseEnabled ? 'Disable edge detection' : 'Enable edge detection'}
              onPress={() => {
                setEdgeSenseEnabled((v) => !v);
              }}
              style={({ pressed }) => [styles.edgeSensePill, pressed && styles.pressed]}
            >
              <Feather name={edgeSenseEnabled ? 'maximize-2' : 'square'} size={ICON_SIZES.sm} color={COLORS.common.white} />
              <Text style={styles.edgeSenseText}>{edgeSenseEnabled ? 'Edge' : 'Manual'}</Text>
            </Pressable>
          </View>

          <IconButton
            size="md"
            variant="ghost"
            icon={
              <Feather
                name={flashMode === 'on' ? 'zap' : 'zap-off'}
                size={ICON_SIZES.md}
                color={COLORS.common.white}
              />
            }
            onPress={handleFlashToggle}
            accessibilityLabel="Toggle flash"
            style={styles.overlayIconButton}
          />

          <IconButton
            size="md"
            variant="ghost"
            icon={<Feather name="info" size={ICON_SIZES.md} color={COLORS.common.white} />}
            onPress={() => setTipsVisible(true)}
            accessibilityLabel="Scan tips"
            style={styles.overlayIconButton}
          />
        </View>
      </SafeAreaView>

      {!edgeSenseEnabled ? (
        <View pointerEvents="box-none" style={styles.manualSideControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showGrid ? 'Hide grid' : 'Show grid'}
            onPress={() => setShowGrid((v) => !v)}
            style={({ pressed }) => [
              styles.sideControlButton,
              showGrid && styles.sideControlButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Feather name="grid" size={ICON_SIZES.md} color={COLORS.common.white} />
          </Pressable>

          <View style={styles.zoomPill}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              onPress={() =>
                setZoom((z) => clamp(z - 0.25, device?.minZoom ?? 0, Math.min(device?.maxZoom ?? 1, 5)))
              }
              style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
            >
              <Feather name="minus" size={ICON_SIZES.sm} color={COLORS.common.white} />
            </Pressable>

            <Text style={styles.zoomLabel}>{zoom.toFixed(2)}x</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              onPress={() =>
                setZoom((z) => clamp(z + 0.25, device?.minZoom ?? 0, Math.min(device?.maxZoom ?? 1, 5)))
              }
              style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
            >
              <Feather name="plus" size={ICON_SIZES.sm} color={COLORS.common.white} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Bottom controls */}
      <SafeAreaView pointerEvents="box-none" style={styles.bottomControls} edges={['bottom']}>
        {scanMode !== 'single' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={() => {
              // Open a quick review before OCR so users can reorder/remove pages.
              setReviewVisible(true);
            }}
            disabled={!captured.length || isProcessing}
            style={({ pressed }) => [
              styles.doneButton,
              (pressed && !isProcessing) && styles.pressed,
              (!captured.length || isProcessing) && styles.doneDisabled,
            ]}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick from gallery"
            onPress={handleGalleryPick}
            style={({ pressed }) => [styles.galleryButton, pressed && styles.pressed]}
          >
            <Feather name="image" size={ICON_SIZES.md} color={COLORS.common.white} />
          </Pressable>
        )}

        <View ref={captureRef} collapsable={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Capture photo"
            onPress={handleCapture}
            disabled={isProcessing || isCapturing}
            style={({ pressed }) => [styles.capturePressable, pressed && styles.capturePressed]}
          >
            <LinearGradient
              colors={Array.from([COLORS.brand.primary, COLORS.brand.primaryDark])}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.captureButton}
            >
              <Feather name="camera" size={32} color={COLORS.common.white} />
            </LinearGradient>
          </Pressable>
        </View>

        {scanMode === 'single' ? (
          <View style={styles.bottomRightSpacer} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick from gallery"
            onPress={handleGalleryPick}
            style={({ pressed }) => [styles.galleryButton, pressed && styles.pressed]}
          >
            <Feather name="image" size={ICON_SIZES.md} color={COLORS.common.white} />
          </Pressable>
        )}
      </SafeAreaView>

      <GuidedTourModal
        visible={tourVisible}
        stepIndex={tourStep}
        steps={tourSteps}
        onClose={() => {
          void cancelTour();
        }}
        onSkip={() => {
          void cancelTour();
        }}
        onNext={handleTourNext}
      />

      {scanMode !== 'single' && captured.length ? (
        <SafeAreaView pointerEvents="box-none" style={styles.thumbnailTray} edges={['bottom']}>
          <View style={styles.thumbnailRow}>
            {captured.slice(0, 6).map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setPreview(c)}
                onLongPress={() => removeCaptured(c.id, c.receiptId)}
                style={({ pressed }) => [styles.thumbWrap, pressed && styles.pressed]}
              >
                <Image source={{ uri: c.uri }} style={styles.thumb} />
                <View pointerEvents="none" style={styles.thumbNumberBadge}>
                  <Text style={styles.thumbNumberText}>{c.order}</Text>
                </View>
              </Pressable>
            ))}

            {captured.length > 6 ? (
              <View style={styles.morePill}>
                <Text style={styles.moreText}>+{captured.length - 6}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.thumbnailFooter}>
            <Text style={styles.thumbnailHint}>Tap to preview • Long-press to remove</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Review captured pages"
              onPress={() => setReviewVisible(true)}
              style={({ pressed }) => [styles.managePill, pressed && styles.pressed]}
            >
              <Feather name="list" size={ICON_SIZES.sm} color={COLORS.common.white} />
              <Text style={styles.manageText}>Review</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : null}

      <Modal
        visible={Boolean(singlePreview)}
        transparent
        animationType="slide"
        onRequestClose={() => setSinglePreview(null)}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.singlePreviewModal} edges={['top', 'bottom']}>
            <View style={styles.singlePreviewHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close preview"
                onPress={() => setSinglePreview(null)}
                style={({ pressed }) => [styles.singlePreviewIconBtn, pressed && styles.pressed]}
              >
                <Feather name="x" size={ICON_SIZES.md} color={COLORS.common.white} />
              </Pressable>

              <Text style={styles.singlePreviewTitle} numberOfLines={1}>
                Review Scan
              </Text>

              <View style={styles.singlePreviewHeaderSpacer} />
            </View>

            {singlePreview?.imageUri ? (
              <Image source={{ uri: singlePreview.imageUri }} style={styles.singlePreviewImage} resizeMode="contain" />
            ) : null}

            <View style={styles.singlePreviewFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retake"
                onPress={async () => {
                  const current = singlePreview;
                  setSinglePreview(null);
                  if (!current?.receiptId) return;
                  try {
                    await deleteReceipt(current.receiptId);
                  } catch {
                    // ignore
                  }
                }}
                style={({ pressed }) => [styles.singlePreviewBtn, styles.singlePreviewBtnDanger, pressed && styles.pressed]}
              >
                <Text style={styles.singlePreviewBtnText}>Retake</Text>
              </Pressable>

              {scanOnly ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                  onPress={() => {
                    setSinglePreview(null);
                    // Prepare a fresh documentId for the next single scan.
                    setActiveDocumentId(makeId());
                  }}
                  style={({ pressed }) => [styles.singlePreviewBtn, styles.singlePreviewBtnSecondary, pressed && styles.pressed]}
                >
                  <Text style={styles.singlePreviewBtnTextDark}>Done</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Run OCR"
                  onPress={() => {
                    const current = singlePreview;
                    if (!current) return;
                    setSinglePreview(null);
                    void processSingleOcrForReceipt(current.receiptId, current.imageUri, { navigateToEditor: false }).finally(() => {
                      // Prepare a fresh documentId for the next single scan.
                      setActiveDocumentId(makeId());
                    });
                  }}
                  style={({ pressed }) => [styles.singlePreviewBtn, styles.singlePreviewBtnPrimary, pressed && styles.pressed]}
                >
                  <Text style={styles.singlePreviewBtnText}>OCR</Text>
                </Pressable>
              )}
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={Boolean(multiPagePreview)}
        transparent
        animationType="slide"
        onRequestClose={() => setMultiPagePreview(null)}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.singlePreviewModal} edges={['top', 'bottom']}>
            <View style={styles.singlePreviewHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close preview"
                onPress={() => setMultiPagePreview(null)}
                style={({ pressed }) => [styles.singlePreviewIconBtn, pressed && styles.pressed]}
              >
                <Feather name="x" size={ICON_SIZES.md} color={COLORS.common.white} />
              </Pressable>

              <Text style={styles.singlePreviewTitle} numberOfLines={1}>
                Review Page
              </Text>

              <View style={styles.singlePreviewHeaderSpacer} />
            </View>

            {multiPagePreview?.imageUri ? (
              <Image source={{ uri: multiPagePreview.imageUri }} style={styles.singlePreviewImage} resizeMode="contain" />
            ) : null}

            <View style={styles.singlePreviewFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retake"
                onPress={async () => {
                  const current = multiPagePreview;
                  setMultiPagePreview(null);
                  if (!current?.receiptId) return;

                  // Remove from captured list first (so the UI stays consistent).
                  setCaptured((prev) => prev.filter((p) => p.id !== current.capturedId).map((p, idx) => ({ ...p, order: idx + 1 })));

                  try {
                    await deleteReceipt(current.receiptId);
                  } catch {
                    // ignore
                  }

                  // After retake, continue with any queued previews.
                  advanceMultiPagePreview();
                }}
                style={({ pressed }) => [styles.singlePreviewBtn, styles.singlePreviewBtnDanger, pressed && styles.pressed]}
              >
                <Text style={styles.singlePreviewBtnText}>Retake</Text>
              </Pressable>

              {scanOnly ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                  onPress={() => {
                    setMultiPagePreview(null);
                    advanceMultiPagePreview();
                  }}
                  style={({ pressed }) => [styles.singlePreviewBtn, styles.singlePreviewBtnSecondary, pressed && styles.pressed]}
                >
                  <Text style={styles.singlePreviewBtnTextDark}>Done</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Run OCR"
                  onPress={() => {
                    const current = multiPagePreview;
                    if (!current) return;
                    setMultiPagePreview(null);
                    void processSingleOcrForReceipt(current.receiptId, current.imageUri, { navigateToEditor: false }).finally(() => {
                      advanceMultiPagePreview();
                    });
                  }}
                  style={({ pressed }) => [styles.singlePreviewBtn, styles.singlePreviewBtnPrimary, pressed && styles.pressed]}
                >
                  <Text style={styles.singlePreviewBtnText}>OCR</Text>
                </Pressable>
              )}
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={tipsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTipsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.tipsModal} edges={['top', 'bottom']}>
            <View style={styles.tipsHeader}>
              <Text style={styles.tipsTitle}>Scan Tips</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close tips"
                onPress={() => setTipsVisible(false)}
                style={({ pressed }) => [styles.tipsCloseBtn, pressed && styles.pressed]}
              >
                <Feather name="x" size={ICON_SIZES.md} color={colors.text} />
              </Pressable>
            </View>

            <View style={{ height: SPACING.sm }} />

            <View style={styles.tipsBlock}>
              <Text style={styles.tipsBlockTitle}>Edge Sense (recommended)</Text>
              <Text style={styles.tipsBody}>Uses native document scanning to auto-detect edges and crop.</Text>
            </View>

            <View style={styles.tipsBlock}>
              <Text style={styles.tipsBlockTitle}>Multi-Page</Text>
              <Text style={styles.tipsBody}>Scan multiple receipts/pages, then tap Done to OCR them as a batch.</Text>
            </View>

            <View style={styles.tipsBlock}>
              <Text style={styles.tipsBlockTitle}>Long Receipt</Text>
              <Text style={styles.tipsBody}>
                Capture the receipt in parts with 20–30% overlap (so text repeats between shots). Keep it flat and avoid glare.
              </Text>
            </View>

            <View style={{ height: SPACING.md }} />
            <Pressable
              accessibilityRole="button"
              onPress={() => setTipsVisible(false)}
              style={({ pressed }) => [styles.tipsPrimaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.tipsPrimaryText}>Got it</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={Boolean(preview)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.previewModal} edges={['top', 'bottom']}>
            <View style={styles.previewHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close preview"
                onPress={() => setPreview(null)}
                style={({ pressed }) => [styles.previewIconBtn, pressed && styles.pressed]}
              >
                <Feather name="chevron-left" size={ICON_SIZES.md} color={COLORS.common.white} />
              </Pressable>

              <Text style={styles.previewTitle} numberOfLines={1}>
                {scanMode === 'long' ? `Part ${preview?.order ?? ''}` : `Page ${preview?.order ?? ''}`}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove captured image"
                onPress={() => {
                  if (!preview) return;
                  const id = preview.id;
                  setPreview(null);
                  removeCaptured(id);
                }}
                style={({ pressed }) => [styles.previewIconBtn, pressed && styles.pressed]}
              >
                <Feather name="trash-2" size={ICON_SIZES.md} color={COLORS.common.white} />
              </Pressable>
            </View>

            {preview ? <Image source={{ uri: preview.uri }} style={styles.previewImage} resizeMode="contain" /> : null}

            {preview && captured.length > 1 ? (
              <View style={styles.previewActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Move left"
                  onPress={() => moveCaptured(preview.id, -1)}
                  style={({ pressed }) => [styles.previewActionBtn, pressed && styles.pressed]}
                >
                  <Feather name="arrow-left" size={ICON_SIZES.md} color={COLORS.common.white} />
                  <Text style={styles.previewActionText}>Move</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Move right"
                  onPress={() => moveCaptured(preview.id, 1)}
                  style={({ pressed }) => [styles.previewActionBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.previewActionText}>Move</Text>
                  <Feather name="arrow-right" size={ICON_SIZES.md} color={COLORS.common.white} />
                </Pressable>
              </View>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={reviewVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReviewVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.reviewModal} edges={['top', 'bottom']}>
            <View style={styles.reviewHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close review"
                onPress={() => setReviewVisible(false)}
                style={({ pressed }) => [styles.reviewIconBtn, pressed && styles.pressed]}
              >
                <Feather name="chevron-down" size={ICON_SIZES.md} color={colors.text} />
              </Pressable>

              <View style={styles.reviewHeaderText}>
                <Text style={styles.reviewTitle} numberOfLines={1}>
                  {scanMode === 'multi' ? 'Review Pages' : 'Review Parts'}
                </Text>
                <Text style={styles.reviewSub} numberOfLines={1}>
                  {captured.length} captured • Reorder or remove pages
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear all"
                onPress={() => {
                  Alert.alert('Clear all?', 'Remove all captured images from this scan session?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: () => {
                        setCaptured([]);
                        setPreview(null);
                      },
                    },
                  ]);
                }}
                style={({ pressed }) => [styles.reviewIconBtn, pressed && styles.pressed]}
              >
                <Feather name="trash-2" size={ICON_SIZES.md} color={colors.text} />
              </Pressable>
            </View>

            <View style={{ height: SPACING.sm }} />

            <FlatList
              data={captured.slice().sort((a, b) => a.order - b.order)}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.reviewList}
              renderItem={({ item }) => {
                return (
                  <View style={styles.reviewRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Open preview"
                      onPress={() => setPreview(item)}
                      style={({ pressed }) => [styles.reviewThumbWrap, pressed && styles.pressed]}
                    >
                      <Image source={{ uri: item.uri }} style={styles.reviewThumb} />
                      <View pointerEvents="none" style={styles.reviewOrderBadge}>
                        <Text style={styles.reviewOrderText}>{item.order}</Text>
                      </View>
                    </Pressable>

                    <View style={styles.reviewRowMid}>
                      <Text style={styles.reviewRowTitle} numberOfLines={1}>
                        {scanMode === 'multi' ? `Page ${item.order}` : `Part ${item.order}`}
                      </Text>
                      <Text style={styles.reviewRowMeta} numberOfLines={1}>
                        Tap thumbnail to preview
                      </Text>
                    </View>

                    <View style={styles.reviewRowActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Move up"
                        onPress={() => moveCaptured(item.id, -1)}
                        disabled={item.order <= 1}
                        style={({ pressed }) => [
                          styles.reviewActionBtn,
                          (pressed && item.order > 1) && styles.pressed,
                          item.order <= 1 && styles.reviewActionDisabled,
                        ]}
                      >
                        <Feather name="chevron-up" size={ICON_SIZES.md} color={colors.text} />
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Move down"
                        onPress={() => moveCaptured(item.id, 1)}
                        disabled={item.order >= captured.length}
                        style={({ pressed }) => [
                          styles.reviewActionBtn,
                          (pressed && item.order < captured.length) && styles.pressed,
                          item.order >= captured.length && styles.reviewActionDisabled,
                        ]}
                      >
                        <Feather name="chevron-down" size={ICON_SIZES.md} color={colors.text} />
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Remove"
                        onPress={() => removeCaptured(item.id)}
                        style={({ pressed }) => [styles.reviewActionBtn, pressed && styles.pressed]}
                      >
                        <Feather name="x" size={ICON_SIZES.md} color={colors.text} />
                      </Pressable>
                    </View>
                  </View>
                );
              }}
              showsVerticalScrollIndicator={false}
            />

            <View style={styles.reviewFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done"
                onPress={() => {
                  setReviewVisible(false);
                  resetSession();
                  setActiveDocumentId(makeId());
                }}
                disabled={!captured.length || isProcessing}
                style={({ pressed }) => [
                  styles.reviewPrimaryBtn,
                  (pressed && !isProcessing) && styles.pressed,
                  (!captured.length || isProcessing) && styles.reviewPrimaryDisabled,
                ]}
              >
                <Feather name="check" size={ICON_SIZES.md} color={COLORS.common.white} />
                <Text style={styles.reviewPrimaryText}>Done</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {isProcessing || isCapturing ? (
        <View style={styles.processingOverlay} accessibilityLabel="Processing receipt">
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.processingText}>
            {isCapturing ? capturingLabel : processingLabel || 'Processing…'}
          </Text>
          {processingDetail ? <Text style={styles.processingSubText}>{processingDetail}</Text> : null}
          {isProcessing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel processing"
              onPress={requestCancel}
              style={({ pressed }) => [styles.processingCancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.processingCancelText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const CORNER_SIZE = 22 as const;
const CORNER_THICKNESS = 3 as const;

const createStyles = (opts: {
  colors: { background: string; text: string };
  insetTop: number;
  insetBottom: number;
  primary: string;
  frame: { frameWidth: number; frameHeight: number; frameTop: number; frameLeft: number };
}) => {
  const overlayColor = 'rgba(0,0,0,0.5)';
  const frameTop = opts.frame.frameTop;
  const frameLeft = opts.frame.frameLeft;
  const frameWidth = opts.frame.frameWidth;
  const frameHeight = opts.frame.frameHeight;

  const sideControlsTop = frameTop + Math.max(0, frameHeight / 2 - 72);

  const topOffset = Math.max(opts.insetTop, 0) + SPACING.lg;
  const bottomOffset = Math.max(opts.insetBottom, 0) + SPACING['2xl'];

  const overlayBtn: ViewStyle = {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: RADIUS.full,
  };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: opts.colors.background,
    },

    permissionContainer: {
      flex: 1,
      backgroundColor: opts.colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.lg,
    },
    permissionText: {
      ...TYPOGRAPHY.bodyNormal,
      color: opts.colors.text,
      textAlign: 'center',
    },
    permissionError: {
      ...TYPOGRAPHY.sectionHeading,
      color: opts.colors.text,
      textAlign: 'center',
      marginBottom: SPACING.lg,
    },

    settingsButton: {
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
      borderRadius: RADIUS.md,
      backgroundColor: opts.primary,
    },
    settingsButtonText: {
      ...TYPOGRAPHY.buttonText,
      color: COLORS.common.white,
    },

    overlayTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: frameTop,
      backgroundColor: overlayColor,
    },
    overlayBottom: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: frameTop + frameHeight,
      bottom: 0,
      backgroundColor: overlayColor,
    },
    overlayLeft: {
      position: 'absolute',
      top: frameTop,
      left: 0,
      width: frameLeft,
      height: frameHeight,
      backgroundColor: overlayColor,
    },
    overlayRight: {
      position: 'absolute',
      top: frameTop,
      right: 0,
      width: frameLeft,
      height: frameHeight,
      backgroundColor: overlayColor,
    },

    frame: {
      position: 'absolute',
      top: frameTop,
      left: frameLeft,
      width: frameWidth,
      height: frameHeight,
      borderRadius: RADIUS.lg,
      borderWidth: 2,
      borderColor: COLORS.common.white,
      overflow: 'hidden',
    },

    gridLineV: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 1,
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    gridLineH: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    corner: {
      position: 'absolute',
      width: CORNER_SIZE,
      height: CORNER_SIZE,
      borderColor: opts.primary,
    },
    cornerTL: {
      top: 0,
      left: 0,
      borderLeftWidth: CORNER_THICKNESS,
      borderTopWidth: CORNER_THICKNESS,
      borderTopLeftRadius: RADIUS.lg,
    },
    cornerTR: {
      top: 0,
      right: 0,
      borderRightWidth: CORNER_THICKNESS,
      borderTopWidth: CORNER_THICKNESS,
      borderTopRightRadius: RADIUS.lg,
    },
    cornerBL: {
      bottom: 0,
      left: 0,
      borderLeftWidth: CORNER_THICKNESS,
      borderBottomWidth: CORNER_THICKNESS,
      borderBottomLeftRadius: RADIUS.lg,
    },
    cornerBR: {
      bottom: 0,
      right: 0,
      borderRightWidth: CORNER_THICKNESS,
      borderBottomWidth: CORNER_THICKNESS,
      borderBottomRightRadius: RADIUS.lg,
    },

    scanLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: toRgba(opts.primary, 0.9),
    },

    instruction: {
      position: 'absolute',
      top: frameTop + frameHeight + SPACING.lg,
      left: 0,
      right: 0,
      ...TYPOGRAPHY.bodyNormal,
      color: COLORS.common.white,
      textAlign: 'center',
    },

    modeSelector: {
      position: 'absolute',
      top: topOffset + 54,
      left: SPACING.md,
      right: SPACING.md,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: SPACING.sm,
    },
    modePill: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    modePillActive: {
      backgroundColor: toRgba(opts.primary, 0.9),
      borderColor: toRgba(opts.primary, 0.9),
    },
    modePillText: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '600',
    },
    modePillTextActive: {
      color: COLORS.common.white,
    },

    topControls: {
      position: 'absolute',
      top: topOffset,
      left: SPACING.md,
      right: SPACING.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    overlayIconButton: overlayBtn,

    topRightGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },

    manualSideControls: {
      position: 'absolute',
      right: SPACING.md,
      top: sideControlsTop,
      alignItems: 'center',
      gap: SPACING.sm,
    },
    sideControlButton: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sideControlButtonActive: {
      backgroundColor: toRgba(opts.primary, 0.85),
      borderColor: toRgba(opts.primary, 0.9),
    },

    zoomPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
    },
    zoomButton: {
      width: 34,
      height: 34,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(255,255,255,0.14)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    zoomLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '800',
      minWidth: 56,
      textAlign: 'center',
    },

    edgeSensePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    scanOnlyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    scanOnlyText: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '800',
    },
    edgeSenseText: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '800',
    },

    bottomControls: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: bottomOffset,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING['2xl'],
    },

    doneButton: {
      width: 56,
      height: 56,
      borderRadius: RADIUS.full,
      backgroundColor: toRgba(opts.primary, 0.9),
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneDisabled: {
      opacity: 0.4,
    },
    doneText: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '800',
    },
    galleryButton: {
      width: 56,
      height: 56,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    capturePressable: {
      width: 72,
      height: 72,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    capturePressed: {
      transform: [{ scale: 0.95 }],
    },
    captureButton: {
      width: 72,
      height: 72,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },

    bottomRightSpacer: {
      width: 56,
      height: 56,
    },

    processingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.8)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.lg,
    },
    processingText: {
      ...TYPOGRAPHY.bodyNormal,
      color: COLORS.common.white,
      marginTop: SPACING.md,
      textAlign: 'center',
    },

    processingSubText: {
      ...TYPOGRAPHY.bodySmall,
      color: 'rgba(255,255,255,0.8)',
      marginTop: SPACING.sm,
      textAlign: 'center',
    },

    processingCancelButton: {
      marginTop: SPACING.lg,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
    },
    processingCancelText: {
      ...TYPOGRAPHY.bodyNormal,
      color: COLORS.common.white,
      fontWeight: '800',
    },

    overlapGuide: {
      position: 'absolute',
      right: SPACING.md,
      bottom: bottomOffset + 120,
      width: 220,
      borderRadius: RADIUS.lg,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      padding: SPACING.sm,
    },
    overlapTitle: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '900',
    },
    overlapSub: {
      ...TYPOGRAPHY.bodySmall,
      color: 'rgba(255,255,255,0.85)',
      marginTop: 2,
    },
    overlapImageWrap: {
      marginTop: SPACING.sm,
      width: '100%',
      height: 64,
      borderRadius: RADIUS.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      backgroundColor: 'rgba(255,255,255,0.05)',
    },
    overlapImage: {
      width: '100%',
      height: 220,
      position: 'absolute',
      bottom: 0,
      resizeMode: 'cover',
    },

    thumbnailTray: {
      position: 'absolute',
      left: 0,
      right: 0,
      // Keep thumbnails above the capture controls so they don't overlap the scan button.
      bottom: bottomOffset + 72 + SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.sm,
    },
    thumbnailRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },

    thumbnailFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
      marginTop: SPACING.xs,
    },
    thumbWrap: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    thumb: {
      width: 44,
      height: 44,
      resizeMode: 'cover',
    },
    morePill: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    moreText: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '700',
    },
    thumbnailHint: {
      ...TYPOGRAPHY.bodySmall,
      color: 'rgba(255,255,255,0.85)',
      flex: 1,
    },

    managePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    manageText: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '800',
    },

    thumbNumberBadge: {
      position: 'absolute',
      top: 4,
      left: 4,
      minWidth: 18,
      height: 18,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    thumbNumberText: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '800',
      fontSize: 11,
    },

    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.75)',
      justifyContent: 'center',
      padding: SPACING.lg,
    },

    tipsModal: {
      borderRadius: RADIUS.lg,
      backgroundColor: opts.colors.background,
      padding: SPACING.lg,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
    },
    tipsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
    },
    tipsTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: opts.colors.text,
    },
    tipsCloseBtn: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
    },
    tipsBlock: {
      marginTop: SPACING.md,
    },
    tipsBlockTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: opts.colors.text,
    },
    tipsBody: {
      ...TYPOGRAPHY.bodySmall,
      color: 'rgba(255,255,255,0.75)',
      marginTop: 4,
    },
    tipsPrimaryBtn: {
      height: 48,
      borderRadius: RADIUS.lg,
      backgroundColor: toRgba(opts.primary, 0.95),
      alignItems: 'center',
      justifyContent: 'center',
    },
    tipsPrimaryText: {
      ...TYPOGRAPHY.buttonText,
      color: COLORS.common.white,
    },

    previewModal: {
      flex: 1,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
    },
    previewTitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: COLORS.common.white,
      fontWeight: '800',
      flex: 1,
      textAlign: 'center',
      marginHorizontal: SPACING.sm,
    },
    previewIconBtn: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    previewImage: {
      flex: 1,
      width: '100%',
    },
    previewActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.lg,
      gap: SPACING.md,
    },
    previewActionBtn: {
      flex: 1,
      height: 48,
      borderRadius: RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: SPACING.sm,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    previewActionText: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '800',
    },

    reviewModal: {
      flex: 1,
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
      backgroundColor: opts.colors.background,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
    },
    reviewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.08)',
      gap: SPACING.md,
    },
    reviewHeaderText: {
      flex: 1,
    },
    reviewTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: opts.colors.text,
    },
    reviewSub: {
      ...TYPOGRAPHY.bodySmall,
      color: 'rgba(255,255,255,0.75)',
      marginTop: 2,
    },
    reviewIconBtn: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
    },
    reviewList: {
      padding: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    reviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    reviewThumbWrap: {
      width: 56,
      height: 56,
      borderRadius: RADIUS.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    reviewThumb: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    reviewOrderBadge: {
      position: 'absolute',
      top: 6,
      left: 6,
      minWidth: 18,
      height: 18,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    reviewOrderText: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '800',
      fontSize: 11,
    },
    reviewRowMid: {
      flex: 1,
    },
    reviewRowTitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: opts.colors.text,
      fontWeight: '800',
    },
    reviewRowMeta: {
      ...TYPOGRAPHY.bodySmall,
      color: 'rgba(255,255,255,0.7)',
      marginTop: 2,
    },
    reviewRowActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    reviewActionBtn: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
    },
    reviewActionDisabled: {
      opacity: 0.35,
    },
    reviewFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.lg,
      paddingTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.08)',
    },
    reviewSecondaryBtn: {
      flex: 1,
      height: 48,
      borderRadius: RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: SPACING.sm,
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
    },
    reviewSecondaryText: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.text,
      fontWeight: '800',
    },
    reviewPrimaryBtn: {
      flex: 2,
      height: 48,
      borderRadius: RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: SPACING.sm,
      backgroundColor: toRgba(opts.primary, 0.95),
    },
    reviewPrimaryDisabled: {
      opacity: 0.45,
    },
    reviewPrimaryText: {
      ...TYPOGRAPHY.buttonText,
      color: COLORS.common.white,
    },

    pressed: {
      opacity: 0.85,
    },

    singlePreviewModal: {
      width: '92%',
      maxWidth: 520,
      alignSelf: 'center',
      backgroundColor: '#0B1220',
      borderRadius: RADIUS.xl,
      overflow: 'hidden',
    },
    singlePreviewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(255,255,255,0.12)',
      gap: SPACING.sm,
    },
    singlePreviewIconBtn: {
      padding: SPACING.sm,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(255,255,255,0.10)',
    },
    singlePreviewTitle: {
      flex: 1,
      ...TYPOGRAPHY.cardTitle,
      color: COLORS.common.white,
      textAlign: 'center',
    },
    singlePreviewHeaderSpacer: {
      width: 40,
    },
    singlePreviewImage: {
      width: '100%',
      height: 360,
      backgroundColor: '#000',
    },
    singlePreviewFooter: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      padding: SPACING.md,
      justifyContent: 'space-between',
      backgroundColor: '#0B1220',
    },
    singlePreviewBtn: {
      flexGrow: 1,
      flexBasis: '48%',
      paddingVertical: SPACING.md,
      borderRadius: RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    singlePreviewBtnPrimary: {
      backgroundColor: opts.primary,
    },
    singlePreviewBtnSecondary: {
      backgroundColor: 'rgba(255,255,255,0.92)',
    },
    singlePreviewBtnDanger: {
      backgroundColor: '#DC2626',
    },
    singlePreviewBtnText: {
      ...TYPOGRAPHY.buttonText,
      color: COLORS.common.white,
    },
    singlePreviewBtnTextDark: {
      ...TYPOGRAPHY.buttonText,
      color: '#0B1220',
    },
  });
};

export default ScanScreen;
