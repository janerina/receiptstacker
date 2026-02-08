import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import ColorPicker, { HueSlider, InputWidget, Panel1, type ColorPickerRef } from 'reanimated-color-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ICON_SIZES, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';

export type ColorPickerModalProps = {
  visible: boolean;
  anchorRef?: React.RefObject<View>;
  initialColor?: string;
  title?: string;
  onChange?: (hexColor: string) => void;
  onConfirm?: (hexColor: string) => void;
  onClose: () => void;
};

type AnchorRect = { x: number; y: number; width: number; height: number };

const normalizeHex = (input: string): string | null => {
  const raw = input.trim().replace(/^#/, '').toUpperCase();
  if (/^[0-9A-F]{6}$/.test(raw)) return `#${raw}`;
  if (/^[0-9A-F]{3}$/.test(raw)) {
    const r = raw[0];
    const g = raw[1];
    const b = raw[2];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
};

export const ColorPickerModal = ({
  visible,
  anchorRef,
  initialColor,
  title,
  onChange,
  onConfirm,
  onClose,
}: ColorPickerModalProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pickerRef = useRef<ColorPickerRef>(null);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const [selectedHex, setSelectedHex] = useState<string>('#3B82F6');
  const [pickerValue, setPickerValue] = useState<string>('#3B82F6');
  const [pickerSeed, setPickerSeed] = useState<number>(0);
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);
  const [popoverSize, setPopoverSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const emitColor = useCallback(
    (hexColor: string) => {
      onChange?.(hexColor);
      onConfirm?.(hexColor);
    },
    [onChange, onConfirm],
  );

  useEffect(() => {
    if (!visible) return;
    const next = normalizeHex(initialColor ?? '') ?? '#3B82F6';
    setSelectedHex(next);
    setPickerValue(next);
    setPickerSeed(s => s + 1);
  }, [initialColor, visible]);

  useEffect(() => {
    if (!visible) {
      setAnchorRect(null);
      return;
    }

    const node = anchorRef?.current;
    if (!node || typeof (node as any).measureInWindow !== 'function') {
      setAnchorRect(null);
      return;
    }

    const raf = requestAnimationFrame(() => {
      (node as any).measureInWindow((x: number, y: number, width: number, height: number) => {
        setAnchorRect({ x, y, width, height });
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [anchorRef, visible]);

  const window = Dimensions.get('window');
  const popoverWidth = 340;
  const popoverPad = 12;

  const popoverPosition = useMemo(() => {
    const maxLeft = Math.max(popoverPad, window.width - popoverWidth - popoverPad);

    const anchorCenterX = anchorRect ? anchorRect.x + anchorRect.width / 2 : window.width / 2;
    const left = Math.min(maxLeft, Math.max(popoverPad, anchorCenterX - popoverWidth / 2));

    const belowY = anchorRect ? anchorRect.y + anchorRect.height + 8 : window.height / 2;
    const availableBottom = window.height - Math.max(insets.bottom, 12) - popoverPad;
    const height = popoverSize.height || 320;
    const fitsBelow = belowY + height <= availableBottom;
    const aboveY = anchorRect ? anchorRect.y - height - 8 : Math.max(insets.top, 12) + popoverPad;

    const topRaw = fitsBelow ? belowY : aboveY;
    const topMin = Math.max(Math.max(insets.top, 12) + popoverPad, 0);
    const topMax = Math.max(topMin, availableBottom - height);
    const top = Math.min(topMax, Math.max(topMin, topRaw));

    return { left, top };
  }, [anchorRect, insets.bottom, insets.top, popoverSize.height, window.height, window.width]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdropRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />

        <View
          style={[styles.popover, { left: popoverPosition.left, top: popoverPosition.top }]}
          onLayout={e => {
            const { width, height } = e.nativeEvent.layout;
            if (width !== popoverSize.width || height !== popoverSize.height) {
              setPopoverSize({ width, height });
            }
          }}
        >
          {title ? (
            <View style={styles.popoverTitleRow}>
              <Text style={[styles.popoverTitle, { color: colors.text }]}>{title}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                hitSlop={10}
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.85 }]}
              >
                <Feather name="x" size={ICON_SIZES.md} color={colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}

          <ColorPicker
            ref={pickerRef}
            key={`picker-${pickerSeed}`}
            value={pickerValue}
            onChangeJS={c => {
              const next = (normalizeHex(c.hex) ?? c.hex).toUpperCase();
              setSelectedHex(next);
              emitColor(next);
            }}
            onCompleteJS={c => {
              const next = (normalizeHex(c.hex) ?? c.hex).toUpperCase();
              setSelectedHex(next);
              emitColor(next);
            }}
          >
            <Panel1 style={styles.panel} />

            <View style={styles.bottomBar}>
              <View style={styles.hueRow}>
                <Feather name="droplet" size={18} color={colors.text} />
                <View style={[styles.previewDot, { backgroundColor: selectedHex }]} />
                <HueSlider style={styles.hueSlider} />
              </View>

              <View style={styles.rgbWidgetWrap}>
                <InputWidget
                  defaultFormat="RGB"
                  formats={['RGB'] as const}
                  disableAlphaChannel
                  iconColor="transparent"
                  containerStyle={styles.rgbWidgetContainer}
                  inputStyle={styles.rgbInput}
                  inputTitleStyle={styles.rgbTitle}
                  inputProps={{ keyboardType: 'number-pad' }}
                />
              </View>
            </View>
          </ColorPicker>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors: {
  surface: string;
  border: string;
  text: string;
  textSecondary: string;
}) =>
  StyleSheet.create({
    backdropRoot: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.12)',
    },
    popover: {
      position: 'absolute',
      width: 340,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      elevation: 10,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 10 },
    },
    popoverTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    popoverTitle: {
      ...TYPOGRAPHY.sectionHeading,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    panel: {
      height: 210,
      width: '100%',
    },
    bottomBar: {
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
    },
    hueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    previewDot: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: colors.border,
    },
    hueSlider: {
      flex: 1,
      height: 16,
      borderRadius: 10,
    },
    rgbWidgetWrap: {
      marginTop: SPACING.md,
    },
    rgbWidgetContainer: {
      paddingTop: 0,
    },
    rgbInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 6,
      paddingVertical: 10,
      paddingHorizontal: 10,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    rgbTitle: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
    },
  });
