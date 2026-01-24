import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { launchImageLibrary } from 'react-native-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';

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

const extractReceiptData = (text: string) => {
  let merchant = '';
  let amount = '';
  let date = '';

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  merchant = lines[0] || '';

  const amountRegex = /\$?\s*(\d+\.\d{2})/g;
  const amountMatches = text.match(amountRegex);
  if (amountMatches && amountMatches.length > 0) {
    const amounts = amountMatches
      .map((a) => Number.parseFloat(a.replace('$', '').trim()))
      .filter((n) => Number.isFinite(n));

    if (amounts.length > 0) {
      amount = Math.max(...amounts).toFixed(2);
    }
  }

  const dateRegex = /(\d{1,2}\/\d{1,2}\/\d{2,4})|(\d{1,2}-\d{1,2}-\d{2,4})/g;
  const dateMatch = text.match(dateRegex);
  if (dateMatch && dateMatch[0]) {
    date = dateMatch[0];
  }

  return { merchant, amount, date };
};

export const ScanScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const primary = COLORS.brand.primary;

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [flashMode, setFlashMode] = useState<'off' | 'on'>('off');
  const [isProcessing, setIsProcessing] = useState(false);

  const cameraRef = useRef<Camera | null>(null);
  const device = useCameraDevice('back');

  const scanAnim = useRef(new Animated.Value(0)).current;

  const styles = useMemo(
    () =>
      createStyles({
        colors,
        insetTop: insets.top,
        insetBottom: insets.bottom,
        primary,
      }),
    [colors, insets.bottom, insets.top, primary],
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

  const processImageWithOCR = async (imageUri: string) => {
    try {
      const result: any = await TextRecognition.recognize(imageUri);

      const rawText =
        typeof result === 'string'
          ? result
          : typeof result?.text === 'string'
            ? result.text
            : Array.isArray(result)
              ? result.join('\n')
              : '';

      const extracted = extractReceiptData(rawText);

      navigation.navigate('AddManually', {
        extractedData: {
          merchant: extracted.merchant || '',
          amount: extracted.amount || '',
          date: extracted.date || new Date().toISOString(),
          imageUri,
        },
      });
    } catch (e) {
      // If OCR fails, still allow manual entry with image attached.
      console.error('OCR error:', e);
      navigation.navigate('AddManually', { extractedData: { imageUri } });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isProcessing) return;

    try {
      setIsProcessing(true);

      const photo = await cameraRef.current.takePhoto({
        flash: flashMode === 'on' ? 'on' : 'off',
      });

      const uri = ensureFileUri(photo.path);
      await processImageWithOCR(uri);
    } catch (e) {
      console.error('Capture error:', e);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
      setIsProcessing(false);
    }
  };

  const handleGalleryPick = async () => {
    if (isProcessing) return;

    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.8,
      });

      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      setIsProcessing(true);
      await processImageWithOCR(asset.uri);
    } catch (e) {
      console.error('Gallery pick error:', e);
      Alert.alert('Error', 'Failed to pick image.');
      setIsProcessing(false);
    }
  };

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
          isActive={!isProcessing}
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
                    outputRange: [0, 360 - 2],
                  }),
                },
              ],
            },
          ]}
        />
      </View>

      <Text style={styles.instruction} accessibilityRole="text">
        Position receipt in frame
      </Text>

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
      </SafeAreaView>

      {/* Bottom controls */}
      <SafeAreaView pointerEvents="box-none" style={styles.bottomControls} edges={['bottom']}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pick from gallery"
          onPress={handleGalleryPick}
          style={({ pressed }) => [styles.galleryButton, pressed && styles.pressed]}
        >
          <Feather name="image" size={ICON_SIZES.md} color={COLORS.common.white} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Capture photo"
          onPress={handleCapture}
          disabled={isProcessing}
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

        <View style={styles.bottomRightSpacer} />
      </SafeAreaView>

      {isProcessing ? (
        <View style={styles.processingOverlay} accessibilityLabel="Processing receipt">
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.processingText}>Processing receipt…</Text>
        </View>
      ) : null}
    </View>
  );
};

const FRAME_WIDTH = 280 as const;
const FRAME_HEIGHT = 360 as const;
const CORNER_SIZE = 22 as const;
const CORNER_THICKNESS = 3 as const;

const createStyles = (opts: {
  colors: { background: string; text: string };
  insetTop: number;
  insetBottom: number;
  primary: string;
}) => {
  const overlayColor = 'rgba(0,0,0,0.5)';

  const frameTop = 140;
  const frameLeft = (360 - FRAME_WIDTH) / 2;

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
      top: frameTop + FRAME_HEIGHT,
      bottom: 0,
      backgroundColor: overlayColor,
    },
    overlayLeft: {
      position: 'absolute',
      top: frameTop,
      left: 0,
      width: frameLeft,
      height: FRAME_HEIGHT,
      backgroundColor: overlayColor,
    },
    overlayRight: {
      position: 'absolute',
      top: frameTop,
      right: 0,
      width: frameLeft,
      height: FRAME_HEIGHT,
      backgroundColor: overlayColor,
    },

    frame: {
      position: 'absolute',
      top: frameTop,
      left: frameLeft,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
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
      top: frameTop + FRAME_HEIGHT + SPACING.xl,
      left: 0,
      right: 0,
      ...TYPOGRAPHY.bodyNormal,
      color: COLORS.common.white,
      textAlign: 'center',
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

    pressed: {
      opacity: 0.85,
    },
  });
};

export default ScanScreen;
