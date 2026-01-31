import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Modal from 'react-native-modal';
import Feather from 'react-native-vector-icons/Feather';

import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';

export type TourRect = { x: number; y: number; width: number; height: number };

export type GuidedTourStep = {
  key: string;
  title: string;
  body: string;
  ref?: React.RefObject<View>;
};

type Props = {
  visible: boolean;
  stepIndex: number;
  steps: GuidedTourStep[];
  onClose: () => void;
  onNext: () => void;
  onSkip?: () => void;
  backdropOpacity?: number;
};

export const GuidedTourModal = ({
  visible,
  stepIndex,
  steps,
  onClose,
  onNext,
  onSkip,
  backdropOpacity = 0.55,
}: Props) => {
  const { colors, isDark } = useTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [rect, setRect] = useState<TourRect | null>(null);

  const styles = useMemo(() => createStyles({ colors, isDark }), [colors, isDark]);

  const measureTarget = useCallback(() => {
    const step = steps[stepIndex];
    const node = step?.ref?.current;
    if (!node) {
      setRect(null);
      return;
    }

    node.measureInWindow((x, y, width, height) => {
      setRect({ x, y, width, height });
    });
  }, [stepIndex, steps]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      measureTarget();
    }, 250);
    return () => clearTimeout(t);
  }, [measureTarget, stepIndex, visible]);

  const cardTop = useMemo(() => {
    if (!rect) return screenH - 260;
    const preferred = rect.y + rect.height + 16;
    return Math.min(preferred, screenH - 260);
  }, [rect, screenH]);

  const isLast = stepIndex >= steps.length - 1;

  return (
    <Modal
      isVisible={visible}
      style={styles.modal}
      backdropOpacity={backdropOpacity}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      useNativeDriver
    >
      <View style={styles.overlay}>
        {rect ? (
          <View
            pointerEvents="none"
            style={[
              styles.highlight,
              {
                left: Math.max(12, rect.x - 10),
                top: Math.max(12, rect.y - 10),
                width: Math.min(screenW - 24, rect.width + 20),
                height: rect.height + 20,
              },
            ]}
          />
        ) : null}

        <View style={[styles.card, { top: cardTop }]}>
          <View style={styles.headerRow}>
            <View style={styles.stepPill}>
              <Text style={styles.stepPillText}>{stepIndex + 1}</Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {steps[stepIndex]?.title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close tutorial"
              onPress={onClose}
              hitSlop={12}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            >
              <Feather name="x" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.body}>{steps[stepIndex]?.body}</Text>

          <View style={styles.footerRow}>
            <View style={styles.dots}>
              {steps.map((_, idx) => (
                <View
                  key={idx}
                  style={[styles.dot, idx === stepIndex ? styles.dotActive : styles.dotInactive]}
                />
              ))}
            </View>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip tutorial"
                onPress={onSkip ?? onClose}
                style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
              >
                <Text style={styles.skipText}>Skip</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isLast ? 'Done' : 'Next'}
                onPress={() => {
                  setRect(null);
                  onNext();
                }}
                style={({ pressed }) => [styles.nextBtn, pressed && styles.nextPressed]}
              >
                <Text style={styles.nextText}>{isLast ? 'Done' : 'Next'} </Text>
                <Feather name="chevron-right" size={18} color={COLORS.common.white} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = ({
  colors,
  isDark,
}: {
  colors: { background: string; surface: string; text: string; textSecondary: string; border: string };
  isDark: boolean;
}) => {
  const cardBg = isDark ? '#0B1220' : colors.surface;
  const cardBorder = isDark ? '#1E2A3B' : colors.border;

  return StyleSheet.create({
    modal: {
      margin: 0,
      justifyContent: 'flex-start',
    },
    overlay: {
      flex: 1,
    },
    highlight: {
      position: 'absolute',
      borderWidth: 2,
      borderColor: COLORS.brand.primary,
      borderRadius: RADIUS.lg,
      backgroundColor: 'transparent',
    },
    card: {
      position: 'absolute',
      left: 16,
      right: 16,
      backgroundColor: cardBg,
      borderWidth: 1,
      borderColor: cardBorder,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      ...(SHADOWS.lg as ViewStyle),
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    stepPill: {
      backgroundColor: isDark ? 'rgba(59,130,246,0.22)' : 'rgba(59,130,246,0.12)',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginRight: SPACING.sm,
    },
    stepPillText: {
      color: COLORS.brand.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    title: {
      flex: 1,
      color: colors.text,
      ...(TYPOGRAPHY.cardTitle as any),
      fontWeight: '700',
    },
    closeBtn: {
      padding: 4,
      borderRadius: 10,
    },
    pressed: {
      opacity: 0.7,
    },
    body: {
      color: colors.textSecondary,
      ...(TYPOGRAPHY.bodyNormal as any),
      marginBottom: SPACING.lg,
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dots: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 999,
    },
    dotActive: {
      backgroundColor: COLORS.brand.primary,
    },
    dotInactive: {
      backgroundColor: isDark ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.65)',
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    skipBtn: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
    },
    skipText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    nextBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: COLORS.brand.primary,
    },
    nextPressed: {
      backgroundColor: COLORS.brand.primaryDark,
    },
    nextText: {
      color: COLORS.common.white,
      fontSize: 14,
      fontWeight: '700',
    },
  });
};
