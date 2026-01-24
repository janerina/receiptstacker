import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import Feather from 'react-native-vector-icons/Feather';

import { Button, Card } from '@/components/common';
import { COLORS, ICON_SIZES, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';

export type ConfirmationVariant = 'default' | 'danger';

export interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  message: string;
  variant?: ConfirmationVariant;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
  disableBackdropClose?: boolean;
}

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

export const ConfirmationModal = ({
  visible,
  title,
  message,
  variant = 'default',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onClose,
  disableBackdropClose = false,
}: ConfirmationModalProps) => {
  const { colors } = useTheme();

  const accent = variant === 'danger' ? COLORS.semantic.error : COLORS.brand.primary;
  const iconName = variant === 'danger' ? 'alert-triangle' : 'help-circle';

  const styles = useMemo(() => createStyles(colors, accent), [colors, accent]);

  const maybeClose = () => {
    if (!disableBackdropClose) onClose();
  };

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={maybeClose}
      onBackButtonPress={maybeClose}
      backdropOpacity={0.55}
      useNativeDriver
    >
      <Card style={styles.card} variant="default">
        <View style={styles.iconWrap}>
          <View style={[styles.iconCircle, { backgroundColor: toRgba(accent, 0.16) }]}>
            <Feather name={iconName} size={ICON_SIZES.lg} color={accent} />
          </View>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        <View style={styles.actionsRow}>
          <Button title={cancelText} onPress={onClose} variant="secondary" style={styles.actionLeft} />
          <Button
            title={confirmText}
            onPress={onConfirm}
            variant={variant === 'danger' ? 'danger' : 'primary'}
            style={styles.actionRight}
          />
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.closeHit}>
          <Feather name="x" size={ICON_SIZES.md} color={colors.textSecondary} />
        </Pressable>
      </Card>
    </Modal>
  );
};

const createStyles = (
  colors: {
    text: string;
    textSecondary: string;
  },
  accent: string,
) =>
  StyleSheet.create({
    card: {
      padding: SPACING.xl,
      position: 'relative',
    },
    iconWrap: {
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    iconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: toRgba(accent, 0.35),
    },
    title: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      textAlign: 'center',
      marginBottom: SPACING.sm,
    },
    message: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: SPACING.lg,
    },
    actionsRow: {
      flexDirection: 'row',
    },
    actionLeft: {
      flex: 1,
      marginRight: SPACING.sm,
    },
    actionRight: {
      flex: 1,
      marginLeft: SPACING.sm,
    },
    closeHit: {
      position: 'absolute',
      top: SPACING.md,
      right: SPACING.md,
      padding: SPACING.sm,
    },
  });
