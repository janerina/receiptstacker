import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';

import { Button, Card } from '@/components/common';
import { AppLogo } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { AuthStackParamList } from '@/navigation';

const ONBOARDING_COMPLETED_KEY = '@onboarding_completed' as const;

export type Props = NativeStackScreenProps<AuthStackParamList, 'Onboarding'>;

/**
 * First-time onboarding experience.
 *
 * Single-page layout (matches design spec):
 * - Theme toggle (top-right)
 * - Logo + tagline
 * - 3 feature cards
 * - Get Started button
 * - Persists completion status (never show again)
 */
export const OnboardingScreen = ({ navigation }: Props) => {
  const { colors, isDark, toggleTheme } = useTheme();

  const primary = COLORS.brand.primary;

  const gradientColors = useMemo(() => {
    // Match the Figma-like onboarding background used elsewhere in the app.
    if (isDark) return ['#0f172a', '#0a1120'] as const;
    return ['#ffffff', '#f0f9ff'] as const;
  }, [isDark]);

  const goToLogin = useCallback(() => {
    navigation.replace('Login');
  }, [navigation]);

  const setCompletedAndExit = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    goToLogin();
  }, [goToLogin]);

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
        <View style={styles.topRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle theme"
            onPress={toggleTheme}
            style={({ pressed }) => [styles.themeButton, pressed && styles.pressed]}
            hitSlop={12}
          >
            <Feather name={isDark ? 'moon' : 'sun'} size={ICON_SIZES.md} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoWrap}>
            <AppLogo size="lg" showTagline />
          </View>

          <Text style={[styles.heroTitle, { color: colors.text }]}>Your smart companion for managing{`\n`}receipts and tracking expenses</Text>

          <View style={styles.featuresWrap}>
            <Card style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: hexToRgba(primary, isDark ? 0.18 : 0.12) }]}>
                <Feather name="camera" size={24} color={primary} />
              </View>
              <View style={styles.featureTextWrap}>
                <Text style={[styles.featureTitle, { color: colors.text }]}>Scan & Store</Text>
                <Text style={[styles.featureBody, { color: colors.textSecondary }]}>Digitize receipts instantly with your camera</Text>
              </View>
            </Card>

            <Card style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: hexToRgba(COLORS.semantic.success, isDark ? 0.18 : 0.12) }]}>
                <Feather name="trending-up" size={24} color={COLORS.semantic.success} />
              </View>
              <View style={styles.featureTextWrap}>
                <Text style={[styles.featureTitle, { color: colors.text }]}>Track Expenses</Text>
                <Text style={[styles.featureBody, { color: colors.textSecondary }]}>Organize and analyze your spending habits</Text>
              </View>
            </Card>

            <Card style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: hexToRgba(COLORS.semantic.info, isDark ? 0.18 : 0.12) }]}>
                <Feather name="shield" size={24} color={COLORS.semantic.info} />
              </View>
              <View style={styles.featureTextWrap}>
                <Text style={[styles.featureTitle, { color: colors.text }]}>Secure Storage</Text>
                <Text style={[styles.featureBody, { color: colors.textSecondary }]}>Your data is local, encrypted and safe</Text>
              </View>
            </Card>
          </View>

          <View style={styles.ctaWrap}>
            <Button
              title="Get Started"
              onPress={setCompletedAndExit}
              variant="primary"
              size="lg"
              fullWidth
              accessibilityLabel="Get Started"
              icon={<Feather name="chevron-right" size={20} color={COLORS.common.white} />}
              iconPosition="right"
            />
          </View>
        </ScrollView>
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
  pressed: {
    opacity: 0.7,
  },
  topRight: {
    position: 'absolute',
    right: SPACING.lg,
    top: SPACING.lg,
    zIndex: 10,
  },
  themeButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: hexToRgba(COLORS.common.white, 0.35),
    borderWidth: 1,
    borderColor: hexToRgba('#000000', 0.06),
  },
  content: {
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  logoWrap: {
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  heroTitle: {
    ...TYPOGRAPHY.sectionHeading,
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: SPACING.xl,
  },
  featuresWrap: {
    gap: SPACING.md,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: 22,
    minHeight: 92,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    ...TYPOGRAPHY.bodyLarge,
    fontWeight: '700',
    marginBottom: 4,
  },
  featureBody: {
    ...TYPOGRAPHY.bodySmall,
    lineHeight: 18,
  },
  ctaWrap: {
    marginTop: SPACING.xxl,
  },
});

export default OnboardingScreen;
