import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Modal from 'react-native-modal';
import Feather from 'react-native-vector-icons/Feather';

import { Button, Card } from '@/components/common';
import { COLORS, ICON_SIZES, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';

export type CustomColorModalProps = {
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

export const CustomColorModal = ({
  visible,
  initialColor,
  title = 'Custom Color',
  onConfirm,
  onClose,
}: CustomColorModalProps) => {
  const { colors } = useTheme();
  const [text, setText] = useState('');

  useEffect(() => {
    if (!visible) return;
    const normalized = normalizeHex(initialColor ?? '') ?? '#3B82F6';
    setText(normalized);
  }, [initialColor, visible]);

  const normalized = useMemo(() => normalizeHex(text), [text]);
  const canUse = !!normalized;

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      backdropOpacity={0.45}
      useNativeDriver
      style={styles.modal}
      avoidKeyboard
    >
      <Card variant="default" style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
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

        <View style={styles.previewRow}>
          <View
            style={[
              styles.previewSwatch,
              { backgroundColor: normalized ?? colors.surface, borderColor: colors.border },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary }]}>Hex Color</Text>
            <Text style={[TYPOGRAPHY.bodyNormal, { color: colors.text }]}>{normalized ?? 'Invalid hex'}</Text>
          </View>
        </View>

        <Text style={[TYPOGRAPHY.label, { color: colors.text, marginBottom: SPACING.xs }]}>Enter a hex value</Text>
        <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <TextInput
            accessibilityLabel="Hex color"
            value={text}
            onChangeText={setText}
            placeholder="#RRGGBB"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            keyboardType={Platform.select({ ios: 'ascii-capable', android: 'default', default: 'default' })}
            style={[TYPOGRAPHY.bodyNormal, { color: colors.text, flex: 1, paddingVertical: 0 }]}
          />
          {canUse ? <Feather name="check" size={18} color={COLORS.semantic.success} /> : null}
        </View>

        <Text style={[TYPOGRAPHY.caption, { color: colors.textSecondary, marginTop: SPACING.xs }]}
        >
          Supports #RGB and #RRGGBB.
        </Text>

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
                if (!normalized) return;
                onConfirm(normalized);
                onClose();
              }}
              fullWidth
              disabled={!canUse}
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
    overflow: 'visible',
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
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  previewSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
});
