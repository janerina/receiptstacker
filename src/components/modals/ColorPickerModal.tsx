import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import Feather from 'react-native-vector-icons/Feather';
import { ColorPicker, fromHsv } from 'react-native-color-picker';

import { Button, Card } from '@/components/common';
import { COLORS, ICON_SIZES, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';

export type ColorPickerModalProps = {
  visible: boolean;
  initialColor?: string;
  title?: string;
  onConfirm: (hexColor: string) => void;
  onClose: () => void;
};

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

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const n = normalized.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return { r, g, b };
};

export const ColorPickerModal = ({
  visible,
  initialColor,
  title = 'Custom Color',
  onConfirm,
  onClose,
}: ColorPickerModalProps) => {
  const { colors } = useTheme();

  const [selectedHex, setSelectedHex] = useState<string>('#3B82F6');

  useEffect(() => {
    if (!visible) return;
    setSelectedHex(normalizeHex(initialColor ?? '') ?? '#3B82F6');
  }, [initialColor, visible]);

  const rgb = useMemo(() => hexToRgb(selectedHex), [selectedHex]);

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      backdropOpacity={0.45}
      useNativeDriver
      style={styles.modal}
    >
      <Card variant="default" style={[styles.card, { backgroundColor: COLORS.common.white }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
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

        <View style={styles.summaryRow}>
          <View style={[styles.previewSwatch, { backgroundColor: selectedHex, borderColor: colors.border }]} />
          <View style={{ flex: 1 }}>
            <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary, marginBottom: 2 }]}>Selected Color</Text>
            <Text style={[TYPOGRAPHY.bodyNormal, { color: colors.text, fontWeight: '700' }]}>{selectedHex}</Text>
          </View>
        </View>

        <View style={styles.pickerWrap}>
          <ColorPicker
            defaultColor={selectedHex}
            onColorChange={hsv => {
              const hex = normalizeHex(fromHsv(hsv)) ?? selectedHex;
              setSelectedHex(hex);
            }}
            style={styles.picker}
          />
        </View>

        <View style={styles.rgbRow}>
          <View style={[styles.rgbBox, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Text style={[TYPOGRAPHY.bodyNormal, { color: colors.text, fontWeight: '700' }]}>{rgb?.r ?? '—'}</Text>
            <Text style={[TYPOGRAPHY.caption, { color: colors.textSecondary, marginTop: 4 }]}>R</Text>
          </View>
          <View style={[styles.rgbBox, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Text style={[TYPOGRAPHY.bodyNormal, { color: colors.text, fontWeight: '700' }]}>{rgb?.g ?? '—'}</Text>
            <Text style={[TYPOGRAPHY.caption, { color: colors.textSecondary, marginTop: 4 }]}>G</Text>
          </View>
          <View style={[styles.rgbBox, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Text style={[TYPOGRAPHY.bodyNormal, { color: colors.text, fontWeight: '700' }]}>{rgb?.b ?? '—'}</Text>
            <Text style={[TYPOGRAPHY.caption, { color: colors.textSecondary, marginTop: 4 }]}>B</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <View style={{ flex: 1 }}>
            <Button title="Cancel" variant="secondary" onPress={onClose} fullWidth />
          </View>
          <View style={{ width: SPACING.md }} />
          <View style={{ flex: 1 }}>
            <Button
              title="Use Color"
              variant="primary"
              onPress={() => {
                onConfirm(selectedHex);
                onClose();
              }}
              fullWidth
            />
          </View>
        </View>
      </Card>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modal: {
    margin: 0,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  card: {
    padding: 0,
    borderRadius: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  title: {
    ...TYPOGRAPHY.sectionHeading,
    color: '#0f172a',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  previewSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerWrap: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  picker: {
    height: 240,
    width: '100%',
  },
  rgbRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  rgbBox: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
  },
});
