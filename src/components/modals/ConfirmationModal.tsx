import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Modal from 'react-native-modal';
import Feather from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const accent = variant === 'danger' ? COLORS.semantic.error : COLORS.brand.primary;
  const iconName = variant === 'danger' ? 'alert-triangle' : 'help-circle';

  const styles = useMemo(() => createStyles(colors, accent), [colors, accent]);

  const maxCardHeight = useMemo(() => {
    const safeTop = Math.max(insets.top, 12);
    const safeBottom = Math.max(insets.bottom, 12);
    const available = windowHeight - safeTop - safeBottom - SPACING.lg * 2;
    return Math.max(260, available);
  }, [insets.bottom, insets.top, windowHeight]);

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
      avoidKeyboard
      propagateSwipe
      style={styles.modal}
    >
      <Card style={[styles.card, { maxHeight: maxCardHeight }]} variant="default">
        <View style={styles.iconWrap}>
          <View style={[styles.iconCircle, { backgroundColor: toRgba(accent, 0.16) }]}>
            <Feather name={iconName} size={ICON_SIZES.lg} color={accent} />
          </View>
        </View>

        <Text style={styles.title}>{title}</Text>

        <ScrollView
          style={styles.messageScroll}
          contentContainerStyle={styles.messageScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.message}>{message}</Text>
        </ScrollView>

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
    modal: {
      margin: SPACING.lg,
      justifyContent: 'center',
    },
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
    messageScroll: {
      flexGrow: 0,
      minHeight: 0,
      marginBottom: SPACING.lg,
    },
    messageScrollContent: {
      paddingBottom: 0,
    },
    message: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      textAlign: 'center',
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
