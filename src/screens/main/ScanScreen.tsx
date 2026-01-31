import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
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

import { IconButton } from '@/components/common';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { BottomTabParamList, MainStackParamList } from '@/navigation';

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

  const cameraRef = useRef<Camera | null>(null);
  const device = useCameraDevice('back');

  const scanAnim = useRef(new Animated.Value(0)).current;

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
  }, []);

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
      await new Promise<void>((resolve) => setTimeout(resolve, 250));

      const maxNumDocuments = scanMode === 'single' ? 1 : 50;
      const res: any = await withTimeout(
        (DocumentScanner as any).scanDocument({
          maxNumDocuments,
          croppedImageQuality: 100,
          responseType: ResponseType.ImageFilePath,
        }),
        45_000,
        'Document scan',
      );

      // iOS/Android native scanner may return cancel status.
      if (res?.status === ScanDocumentResponseStatus.Cancel) return;

      const scanned: string[] = Array.isArray(res?.scannedImages) ? res.scannedImages : [];
      if (!scanned.length) return;

      const uris = scanned.map(ensureFileUri);

      if (scanMode === 'single') {
        setIsProcessing(true);
        await processSingleToEditor(uris[0]);
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
      Alert.alert('Error', msg ? `Failed to scan document.\n\n${msg}` : 'Failed to scan document.');
    } finally {
      setIsCapturing(false);
      setIsEdgeScannerOpen(false);
    }
  }, [isCapturing, isProcessing, processSingleToEditor, scanMode, withTimeout]);

  const processSingleToEditor = useCallback(
    async (imageUri: string) => {
      try {
        setProcessingLabel('Running OCR…');
        setProcessingDetail('');

        const ocr = await recognizeTextWithMlKit(imageUri);

        navigation.navigate('ReceiptTextEditor', {
          source: 'single',
          primaryImageUri: imageUri,
          partImageUris: [imageUri],
          ocrTextOriginal: ocr.text,
          ocrRawJson: ocr.rawResultJson,
          extracted: ocr.extracted ?? {},
        });
      } catch (e) {
        console.error('OCR error:', e);
        navigation.navigate('Home', { screen: 'AddManually', params: { extractedData: { imageUri } } } as any);
      } finally {
        setIsProcessing(false);
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

      const session: ScanSession = {
        id: makeId(),
        mode: 'multi',
        images: captured.slice().sort((a, b) => a.order - b.order),
        createdAt: Date.now(),
      };

      const results: ScanSessionResult['results'] = [];
      for (let i = 0; i < session.images.length; i += 1) {
        const img = session.images[i];
        setProcessingDetail(`OCR ${i + 1}/${session.images.length}`);
        const ocr = await recognizeTextWithMlKit(img.uri);
        results.push({ image: img, ocr });
      }

      setLastScanSessionResult({ session, results });
      resetSession();
      navigation.navigate('ScanSessionReview');
    } catch (e) {
      console.error('Multi-session OCR error:', e);
      Alert.alert('Error', 'Failed to process the scan session. Please try again.');
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
      setProcessingDetail('');
    }
  }, [captured, isProcessing, navigation, resetSession]);

  const processLongReceipt = useCallback(async () => {
    if (isProcessing) return;
    if (!captured.length) return;

    try {
      setIsProcessing(true);
      setProcessingLabel('Processing long receipt…');

      const ordered = captured.slice().sort((a, b) => a.order - b.order);
      const texts: string[] = [];
      let rawJson: string | undefined;
      let extracted: any = {};

      for (let i = 0; i < ordered.length; i += 1) {
        setProcessingDetail(`OCR part ${i + 1}/${ordered.length}`);
        const ocr = await recognizeTextWithMlKit(ordered[i].uri);
        texts.push(ocr.text);
        rawJson = rawJson ?? ocr.rawResultJson;
        extracted = extracted?.merchant ? extracted : (ocr.extracted ?? {});
      }

      const merged = mergeOcrTextsByLineOverlap(texts);

      navigation.navigate('ReceiptTextEditor', {
        source: 'long',
        primaryImageUri: ordered[0].uri,
        partImageUris: ordered.map((p) => p.uri),
        ocrTextOriginal: merged,
        ocrRawJson: rawJson,
        extracted,
      });
      resetSession();
    } catch (e) {
      console.error('Long-receipt OCR error:', e);
      Alert.alert('Error', 'Failed to process the long receipt. Please try again.');
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
      setProcessingDetail('');
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
        12_000,
        'Camera capture',
      );

      // Captured. From here on, we are no longer "capturing".
      setIsCapturing(false);

      const uri = ensureFileUri(photo.path);
      if (scanMode === 'single') {
        setIsProcessing(true);
        await processSingleToEditor(uri);
        return;
      }

      setCaptured((prev) => {
        const order = prev.length + 1;
        const next: CapturedImage = { id: makeId(), uri, createdAt: Date.now(), order };
        return [...prev, next];
      });
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
        setIsProcessing(true);
        await processSingleToEditor(picked[0]);
        return;
      }

      setCaptured((prev) => {
        let order = prev.length;
        const next = picked.map((uri) => {
          order += 1;
          const img: CapturedImage = { id: makeId(), uri, createdAt: Date.now(), order };
          return img;
        });
        return [...prev, ...next];
      });
    } catch (e) {
      console.error('Gallery pick error:', e);
      Alert.alert('Error', 'Failed to pick image.');
      setIsProcessing(false);
    }
  };

  const removeCaptured = useCallback((id: string) => {
    setCaptured((prev) => prev.filter((p) => p.id !== id).map((p, idx) => ({ ...p, order: idx + 1 })));
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
      {device ? (
        <Camera
          ref={(ref) => {
            cameraRef.current = ref;
          }}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isFocused && !isEdgeScannerOpen}
          photo
          torch={flashMode === 'on' ? 'on' : 'off'}
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

      <Text style={styles.instruction} accessibilityRole="text">
        {scanMode === 'single'
          ? edgeSenseEnabled
            ? 'Edge Sense ON • Auto-crop enabled'
            : 'Position receipt in frame'
          : scanMode === 'multi'
            ? `Multi-Page: ${captured.length} captured`
            : `Long Receipt: Part ${Math.max(1, captured.length + 1)}`}
      </Text>

      <SafeAreaView pointerEvents="box-none" style={styles.modeSelector} edges={['top']}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setScanMode('single');
            resetSession();
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
            accessibilityRole="button"
            accessibilityLabel={edgeSenseEnabled ? 'Disable edge detection' : 'Enable edge detection'}
            onPress={() => setEdgeSenseEnabled((v) => !v)}
            style={({ pressed }) => [styles.edgeSensePill, pressed && styles.pressed]}
          >
            <Feather name={edgeSenseEnabled ? 'maximize-2' : 'square'} size={ICON_SIZES.sm} color={COLORS.common.white} />
            <Text style={styles.edgeSenseText}>{edgeSenseEnabled ? 'Edge' : 'Manual'}</Text>
          </Pressable>

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
        </View>
      </SafeAreaView>

      {/* Bottom controls */}
      <SafeAreaView pointerEvents="box-none" style={styles.bottomControls} edges={['bottom']}>
        {scanMode !== 'single' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={() => {
              if (scanMode === 'multi') void processMultiSession();
              else void processLongReceipt();
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

      {scanMode !== 'single' && captured.length ? (
        <SafeAreaView pointerEvents="box-none" style={styles.thumbnailTray} edges={['bottom']}>
          <View style={styles.thumbnailRow}>
            {captured.slice(0, 6).map((c) => (
              <Pressable
                key={c.id}
                onLongPress={() => removeCaptured(c.id)}
                style={({ pressed }) => [styles.thumbWrap, pressed && styles.pressed]}
              >
                <Image source={{ uri: c.uri }} style={styles.thumb} />
              </Pressable>
            ))}

            {captured.length > 6 ? (
              <View style={styles.morePill}>
                <Text style={styles.moreText}>+{captured.length - 6}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.thumbnailHint}>Long-press a thumbnail to remove</Text>
        </SafeAreaView>
      ) : null}

      {isProcessing || isCapturing ? (
        <View style={styles.processingOverlay} accessibilityLabel="Processing receipt">
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.processingText}>
            {isCapturing ? capturingLabel : processingLabel || 'Processing…'}
          </Text>
          {processingDetail ? <Text style={styles.processingSubText}>{processingDetail}</Text> : null}
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

    thumbnailTray: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: Math.max(opts.insetBottom, 0) + SPACING.lg,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.sm,
    },
    thumbnailRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      justifyContent: 'center',
      alignItems: 'center',
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
      textAlign: 'center',
      marginTop: SPACING.xs,
    },

    pressed: {
      opacity: 0.85,
    },
  });
};

export default ScanScreen;
