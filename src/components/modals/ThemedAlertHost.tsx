import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Modal from 'react-native-modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/common';
import { registerThemedAlertHandler, type ThemedAlertPayload } from '@/services/themedAlert';
import { SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/theme';

type ResolvedButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

const resolveButtons = (payload: ThemedAlertPayload | null): ResolvedButton[] => {
  const raw = payload?.buttons ?? [];
  if (raw.length === 0) return [{ text: 'OK', style: 'default' }];

  return raw.map(b => ({
    text: b.text ?? 'OK',
    style: (b.style as ResolvedButton['style']) ?? 'default',
    onPress: typeof b.onPress === 'function' ? b.onPress : undefined,
  }));
};

export const ThemedAlertHost = () => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  const [payload, setPayload] = useState<ThemedAlertPayload | null>(null);

  const buttons = useMemo(() => resolveButtons(payload), [payload]);

  const cancelable = payload?.options?.cancelable ?? true;

  const close = useCallback(() => setPayload(null), []);

  const onButtonPress = useCallback(
    (btn: ResolvedButton) => {
      close();
      btn.onPress?.();
    },
    [close],
  );

  useEffect(() => {
    return registerThemedAlertHandler((next) => {
      // Replace any current dialog (keeps behavior similar to native alerts).
      setPayload(next);
    });
  }, []);

  if (!payload) return null;

  const safeTop = Math.max(insets.top, 12);
  const safeBottom = Math.max(insets.bottom, 12);
  const maxCardHeight = Math.max(240, windowHeight - safeTop - safeBottom - SPACING.lg * 2);
  const maxMessageHeight = Math.max(84, maxCardHeight - 160);
  const cardWidth = Math.min(520, Math.max(280, windowWidth - SPACING.lg * 2));

  return (
    <Modal
      isVisible
      onBackdropPress={cancelable ? close : undefined}
      onBackButtonPress={cancelable ? close : undefined}
      backdropOpacity={theme.isDark ? 0.6 : 0.45}
      backdropColor={theme.colors.black}
      useNativeDriver
      hideModalContentWhileAnimating
      avoidKeyboard
      propagateSwipe
      style={styles.modal}
    >
      <Card variant="default" style={[styles.card, { maxHeight: maxCardHeight, width: cardWidth }]}>
        <View style={styles.body}>
          {payload.title ? <Text style={styles.title}>{payload.title}</Text> : null}

          {payload.message ? (
            <ScrollView
              style={[styles.messageScroll, { maxHeight: maxMessageHeight }]}
              contentContainerStyle={styles.messageScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.message}>{payload.message}</Text>
            </ScrollView>
          ) : null}
        </View>

        <View style={styles.actionsRow}>
          {buttons.map((btn, idx) => {
            const isLast = idx === buttons.length - 1;
            const color =
              btn.style === 'destructive'
                ? theme.colors.error
                : btn.style === 'cancel'
                  ? theme.colors.text
                  : theme.colors.primary;

            return (
              <Pressable
                key={`${btn.text}-${idx}`}
                accessibilityRole="button"
                accessibilityLabel={btn.text}
                onPress={() => onButtonPress(btn)}
                style={({ pressed }) => [
                  styles.actionBtn,
                  !isLast && styles.actionBtnSpacer,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.actionText, { color }]}>{btn.text.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </Modal>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    modal: {
      margin: 0,
      justifyContent: 'center',
      alignItems: 'stretch',
    },
    card: {
      padding: SPACING.lg,
      maxWidth: 520,
      alignSelf: 'center',
    },
    body: {
      flexShrink: 1,
    },
    title: {
      ...TYPOGRAPHY.cardTitle,
      color: theme.colors.text,
    },
    messageScroll: {
      marginTop: SPACING.sm,
    },
    messageScrollContent: {
      paddingBottom: 0,
    },
    message: {
      ...TYPOGRAPHY.bodyNormal,
      color: theme.colors.textSecondary,
    },
    actionsRow: {
      marginTop: SPACING.lg,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    actionBtn: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: theme.radius.md,
    },
    actionBtnSpacer: {
      marginRight: SPACING.xs,
    },
    actionText: {
      ...TYPOGRAPHY.buttonText,
    },
  });
