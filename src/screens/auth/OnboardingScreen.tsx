import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Swiper from 'react-native-swiper';
import Feather from 'react-native-vector-icons/Feather';

import { Button } from '@/components/common';
import { COLORS, COMPONENT_SIZES, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { AuthStackParamList } from '@/navigation';

const ONBOARDING_COMPLETED_KEY = '@onboarding_completed' as const;

export type Props = NativeStackScreenProps<AuthStackParamList, 'Onboarding'>;

interface Slide {
  iconName: React.ComponentProps<typeof Feather>['name'];
  heading: string;
  description: string;
}

/**
 * First-time onboarding experience with 3 swipeable slides.
 *
 * Features:
 * - Swipe between slides
 * - Pagination dots
 * - Skip (top-right)
 * - Next/Get Started button
 * - Persists completion status (never show again)
 */
export const OnboardingScreen = ({ navigation }: Props) => {
  const { colors, isDark } = useTheme();

  const [currentSlide, setCurrentSlide] = useState(0);
  const swiperRef = useRef<Swiper | null>(null);

  const slides = useMemo<Slide[]>(
    () => [
      {
        iconName: 'camera',
        heading: 'Scan Receipts Easily',
        description: 'Capture receipts with your camera and let AI extract all the details automatically',
      },
      {
        iconName: 'bar-chart-2',
        heading: 'Track Your Spending',
        description: 'Get detailed insights into your expenses with beautiful charts and reports',
      },
      {
        iconName: 'target',
        heading: 'Stay On Budget',
        description: "Set spending limits and get notified when you're approaching your budget",
      },
    ],
    [],
  );

  const primary = COLORS.brand.primary;

  const gradientColors = useMemo(() => {
    // Use tokens only (avoid hardcoding spec hexes).
    if (isDark) {
      return [COLORS.dark.background, COLORS.dark.surface] as const;
    }
    return [COLORS.light.background, hexToRgba(COLORS.brand.primaryLight, 0.18)] as const;
  }, [isDark]);

  const title = currentSlide === slides.length - 1 ? 'Get Started' : 'Next';

  const goToLogin = useCallback(() => {
    navigation.replace('Login');
  }, [navigation]);

  const setCompletedAndExit = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    goToLogin();
  }, [goToLogin]);

  const handleSkip = useCallback(async () => {
    await setCompletedAndExit();
  }, [setCompletedAndExit]);

  const handleNext = useCallback(async () => {
    if (currentSlide < slides.length - 1) {
      swiperRef.current?.scrollBy(1, true);
      return;
    }

    await setCompletedAndExit();
  }, [currentSlide, slides.length, setCompletedAndExit]);

  useEffect(() => {
    let cancelled = false;

    const checkCompletion = async () => {
      try {
        const value = await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY);
        if (cancelled) return;
        if (value === 'true') {
          goToLogin();
        }
      } catch {
        // Non-fatal: if storage fails, show onboarding.
      }
    };

    checkCompletion();

    return () => {
      cancelled = true;
    };
  }, [goToLogin]);

  return (
    <LinearGradient colors={Array.from(gradientColors)} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          onPress={handleSkip}
          style={({ pressed }) => [
            styles.skip,
            { right: SPACING.md, top: SPACING.lg },
            pressed && styles.pressed,
          ]}
          hitSlop={SPACING.sm}
        >
          <Text style={[TYPOGRAPHY.label, { color: primary }]}>Skip</Text>
        </Pressable>

        <View style={styles.content}>
          <Swiper
            ref={(ref) => {
              swiperRef.current = ref;
            }}
            loop={false}
            showsPagination={false}
            onIndexChanged={setCurrentSlide}
            scrollEnabled
          >
            {slides.map((slide) => (
              <View key={slide.heading} style={styles.slide} accessible accessibilityRole="summary">
                <View style={styles.iconWrap}>
                  <Feather
                    name={slide.iconName}
                    size={COMPONENT_SIZES.bottomTabBar.scanButton.size * 2}
                    color={primary}
                    accessibilityLabel={slide.heading}
                  />
                </View>

                <Text style={[styles.heading, { color: colors.text }]}>{slide.heading}</Text>
                <Text style={[styles.description, { color: colors.textSecondary }]}>{slide.description}</Text>
              </View>
            ))}
          </Swiper>

          <View style={styles.pagination} accessibilityRole="adjustable" accessibilityLabel="Onboarding progress">
            {slides.map((_, index) => {
              const active = index === currentSlide;
              return (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    active ? styles.dotActive : styles.dotInactive,
                    {
                      backgroundColor: active ? primary : colors.border,
                    },
                  ]}
                />
              );
            })}
          </View>

          <View style={styles.buttonRow}>
            <Button
              title={title}
              onPress={handleNext}
              variant="primary"
              size="lg"
              fullWidth
              accessibilityLabel={title}
            />
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  skip: {
    position: 'absolute',
    zIndex: 10,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  iconWrap: {
    marginBottom: SPACING.xl,
  },
  heading: {
    ...TYPOGRAPHY.pageTitle,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  description: {
    ...TYPOGRAPHY.bodyNormal,
    textAlign: 'center',
    maxWidth: COMPONENT_SIZES.bottomTabBar.scanButton.size * 5,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  dot: {
    borderRadius: 9999,
  },
  dotActive: {
    width: SPACING.lg,
    height: SPACING.sm,
  },
  dotInactive: {
    width: SPACING.sm,
    height: SPACING.sm,
  },
  buttonRow: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xl,
  },
});

export default OnboardingScreen;
