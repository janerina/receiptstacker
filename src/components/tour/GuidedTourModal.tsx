import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, InteractionManager, Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
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
  const { colors } = useTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [rect, setRect] = useState<TourRect | null>(null);

  const highlightOpacity = useRef(new Animated.Value(0)).current;
  const highlightLeft = useRef(new Animated.Value(16)).current;
  const highlightTop = useRef(new Animated.Value(16)).current;
  const highlightW = useRef(new Animated.Value(0)).current;
  const highlightH = useRef(new Animated.Value(0)).current;

  const cardTopAnim = useRef(new Animated.Value(screenH - 260)).current;
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSampleRef = useRef<TourRect | null>(null);
  const stableSamplesRef = useRef(0);

  const styles = useMemo(() => createStyles({ colors }), [colors]);

  const animateTo = useCallback(
    (next: TourRect | null) => {
      const CARD_H_EST = 260;
      const EDGE = 12;
      const PAD = 10;

      if (!next) {
        Animated.timing(highlightOpacity, {
          toValue: 0,
          duration: 160,
          easing: Easing.out(Easing.quad),
          // Keep this JS-driven because the same view also animates layout props
          // (left/top/width/height) which cannot be driven natively.
          useNativeDriver: false,
        }).start();
        return;
      }

      // Clamp highlight within the visible screen.
      const left = Math.max(EDGE, next.x - PAD);
      const top = Math.max(EDGE, next.y - PAD);
      const right = Math.min(screenW - EDGE, next.x + next.width + PAD);
      const bottom = Math.min(screenH - EDGE, next.y + next.height + PAD);
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);

      // Prefer showing the card below the target; if it won't fit, place it above.
      const below = next.y + next.height + 16;
      const above = next.y - CARD_H_EST - 16;
      const cardTop = below + CARD_H_EST <= screenH - EDGE ? below : Math.max(EDGE, above);

      Animated.parallel([
        Animated.timing(highlightOpacity, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.quad),
          // Keep this JS-driven because the highlight view also animates layout props.
          useNativeDriver: false,
        }),
        Animated.timing(highlightLeft, {
          toValue: left,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(highlightTop, {
          toValue: top,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(highlightW, {
          toValue: width,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(highlightH, {
          toValue: height,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(cardTopAnim, {
          toValue: cardTop,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    },
    [cardTopAnim, highlightH, highlightLeft, highlightOpacity, highlightTop, highlightW, screenH, screenW],
  );

  const measureTarget = useCallback(
    (attempt = 0) => {
      const MAX_ATTEMPTS = 10;
      const RETRY_MS = 120;
      const STABLE_EPS = 1.5;
      const STABLE_SAMPLES_REQUIRED = 1;

      const step = steps[stepIndex];
      const node = step?.ref?.current;
      const canMeasure = !!node && typeof (node as any).measureInWindow === 'function';

      if (!canMeasure) {
        if (attempt < MAX_ATTEMPTS) {
          retryTimer.current = setTimeout(() => measureTarget(attempt + 1), RETRY_MS);
          return;
        }
        setRect(null);
        animateTo(null);
        return;
      }

      try {
        (node as any).measureInWindow((x: number, y: number, width: number, height: number) => {
          const visibleW = Math.min(screenW, x + width) - Math.max(0, x);
          const visibleH = Math.min(screenH, y + height) - Math.max(0, y);

          const valid =
            Number.isFinite(x) &&
            Number.isFinite(y) &&
            Number.isFinite(width) &&
            Number.isFinite(height) &&
            width > 2 &&
            height > 2 &&
            visibleW > 2 &&
            visibleH > 2;

          if (!valid) {
            if (attempt < MAX_ATTEMPTS) {
              retryTimer.current = setTimeout(() => measureTarget(attempt + 1), RETRY_MS);
              return;
            }
            setRect(null);
            animateTo(null);
            return;
          }

          const next = { x, y, width, height };

          // When the underlying screen is scrolling/animating, the first valid
          // measurement can be transient. Keep sampling until it stabilizes.
          const prev = lastSampleRef.current;
          const stable =
            !!prev &&
            Math.abs(prev.x - next.x) <= STABLE_EPS &&
            Math.abs(prev.y - next.y) <= STABLE_EPS &&
            Math.abs(prev.width - next.width) <= STABLE_EPS &&
            Math.abs(prev.height - next.height) <= STABLE_EPS;

          lastSampleRef.current = next;
          stableSamplesRef.current = stable ? stableSamplesRef.current + 1 : 0;

          // Animate immediately so the highlight tracks motion.
          animateTo(next);

          if (stableSamplesRef.current < STABLE_SAMPLES_REQUIRED && attempt < MAX_ATTEMPTS) {
            retryTimer.current = setTimeout(() => measureTarget(attempt + 1), RETRY_MS);
            return;
          }

          // Finalize once the rect is stable (or we hit max attempts).
          setRect(next);
        });
      } catch {
        if (attempt < MAX_ATTEMPTS) {
          retryTimer.current = setTimeout(() => measureTarget(attempt + 1), RETRY_MS);
          return;
        }
        setRect(null);
        animateTo(null);
      }
    },
    [animateTo, screenH, screenW, stepIndex, steps],
  );

  useEffect(() => {
    if (!visible) return;
    // Reset stabilization when the step changes.
    lastSampleRef.current = null;
    stableSamplesRef.current = 0;
  }, [stepIndex, visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }

    // Ensure layout has settled (tab switches, scroll, animations) before measuring.
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        // Retry measurement until the target is mounted and laid out.
        measureTarget(0);
      });
    });

    return () => {
      cancelled = true;
      task.cancel();
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [measureTarget, stepIndex, visible]);

  // Keep card top in sync on orientation/size changes.
  useEffect(() => {
    if (!visible) return;
    if (rect) {
      animateTo(rect);
    } else {
      cardTopAnim.setValue(screenH - 260);
    }
  }, [animateTo, cardTopAnim, rect, screenH, visible]);

  // Prevent stale highlights when restarting the tour or moving to a new step.
  useEffect(() => {
    if (!visible) return;
    setRect(null);
    animateTo(null);
  }, [animateTo, stepIndex, visible]);

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
        <Animated.View
          pointerEvents="none"
          style={[
            styles.highlight,
            {
              opacity: highlightOpacity,
              left: highlightLeft,
              top: highlightTop,
              width: highlightW,
              height: highlightH,
            },
          ]}
        />

        <Animated.View style={[styles.card, { top: cardTopAnim }] as any}>
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
                  onNext();
                }}
                style={({ pressed }) => [styles.nextBtn, pressed && styles.nextPressed]}
              >
                <Text style={styles.nextText}>{isLast ? 'Done' : 'Next'} </Text>
                <Feather name="chevron-right" size={18} color={COLORS.common.white} />
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const createStyles = ({
  colors,
}: {
  colors: { background: string; surface: string; text: string; textSecondary: string; border: string };
}) => {
  const cardBg = colors.surface;
  const cardBorder = colors.border;

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
