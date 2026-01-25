import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import ReactNativeBiometrics from 'react-native-biometrics';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { Button, IconButton } from '@/components/common';
import { AppLogo } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { AuthStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { registerLocalAccount } from '@/services/localAuth';
import { emitAuthChanged } from '@/utils/authEvents';

export type Props = NativeStackScreenProps<AuthStackParamList, 'BiometricSetup'>;

type PendingSignUp = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  recovery?:
    | { pin: string }
    | { securityQuestions: Array<{ question: string; answer: string }> }
    | { recoveryPhrase: string };
};

const PENDING_SIGNUP_KEY = '@pending_signup' as const;
const AUTH_TOKEN_KEY = '@auth_token' as const;
const USER_KEY = '@user' as const;
const BIOMETRICS_ENABLED_KEY = '@biometrics_enabled' as const;

const safeJsonParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const BiometricSetupScreen = ({ navigation, route }: Props) => {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      setError('');
      return undefined;
    }, []),
  );

  const finalizeSignup = async () => {
    const raw = await AsyncStorage.getItem(PENDING_SIGNUP_KEY);
    const pending = safeJsonParse<PendingSignUp>(raw);
    if (!pending) throw new Error('Missing signup information. Please start again.');
    if (pending.email.trim().toLowerCase() !== route.params.email.trim().toLowerCase()) {
      throw new Error('Signup information mismatch. Please start again.');
    }
    if (!pending.recovery) throw new Error('Missing recovery setup. Please complete Security Setup.');

    const name = `${pending.firstName} ${pending.lastName}`.trim();
    const email = pending.email.trim().toLowerCase();

    const account = await registerLocalAccount({
      name,
      email,
      password: pending.password,
      recovery: pending.recovery,
    });

    await AsyncStorage.setItem(AUTH_TOKEN_KEY, 'local_token');
    await AsyncStorage.setItem(
      USER_KEY,
      JSON.stringify({
        email: account.user.email,
        name: account.user.name,
        id: account.user.id,
      }),
    );
    await AsyncStorage.removeItem(PENDING_SIGNUP_KEY);

    emitAuthChanged();
  };

  const handleSetupBiometrics = async () => {
    setError('');
    try {
      setSubmitting(true);

      const rnBiometrics = new ReactNativeBiometrics();
      const { available } = await rnBiometrics.isSensorAvailable();
      if (!available) {
        throw new Error('Biometric authentication not available on this device.');
      }

      const { success } = await rnBiometrics.simplePrompt({
        promptMessage: 'Enable biometric authentication',
        cancelButtonText: 'Cancel',
      });
      if (!success) {
        throw new Error('Biometric setup was cancelled.');
      }

      await AsyncStorage.setItem(BIOMETRICS_ENABLED_KEY, 'true');
      await finalizeSignup();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      throw e;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setError('');
    try {
      setSubmitting(true);
      await AsyncStorage.setItem(BIOMETRICS_ENABLED_KEY, 'false');
      await finalizeSignup();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      throw e;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <IconButton
            accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onPress={toggleTheme}
            icon={<Feather name={isDark ? 'sun' : 'moon'} size={ICON_SIZES.md} color={colors.text} />}
          />
        </View>

        <View style={{ marginTop: SPACING.sm, alignItems: 'center' }}>
          <AppLogo size="md" showTagline={true} />
        </View>

        <Text style={styles.title}>Biometric Authentication</Text>
        <Text style={styles.subtitle}>Secure your account with biometrics</Text>

        <View style={styles.stepperRow} accessibilityLabel="Signup progress">
          <View style={[styles.step, styles.stepActive]} />
          <View style={[styles.step, styles.stepActive]} />
          <View style={[styles.step, styles.stepActive]} />
          <View style={styles.step} />
        </View>

        <View style={styles.callout}>
          <View style={styles.calloutRow}>
            <View style={styles.calloutIconWrap}>
              <MaterialCommunityIcons name="face-recognition" size={ICON_SIZES.md} color={COLORS.brand.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[TYPOGRAPHY.label, { color: colors.text }]}>Quick & Secure Access</Text>
              <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary, marginTop: 4 }]}>
                Use Face ID, Touch ID, or fingerprint to sign in quickly and securely.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.heroIconWrap}>
          <View style={styles.heroIconCircle}>
            <MaterialCommunityIcons name="face-recognition" size={64} color={COLORS.brand.primary} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Enable Biometric Authentication</Text>
        <Text style={styles.sectionBody}>
          Secure your account with facial recognition or fingerprint scanning for instant access.
        </Text>

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <View style={{ marginTop: SPACING.xl }}>
          <Button
            title="Set Up Biometric Authentication"
            onPress={handleSetupBiometrics}
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
            disabled={submitting}
            icon={<MaterialCommunityIcons name="face-recognition" size={ICON_SIZES.md} color={COLORS.common.white} />}
            accessibilityLabel="Set Up Biometric Authentication"
          />

          <View style={{ marginTop: SPACING.md }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip for Now"
              disabled={submitting}
              onPress={handleSkip}
              android_ripple={!submitting ? { color: 'rgba(0,0,0,0.08)', foreground: true } : undefined}
              style={({ pressed }) => [
                styles.secondaryCta,
                { backgroundColor: colors.disabled },
                pressed && !submitting ? styles.secondaryCtaPressed : null,
              ]}
            >
              <Text style={[TYPOGRAPHY.buttonText, { color: colors.text }]} numberOfLines={1}>
                Skip for Now
              </Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Text style={[TYPOGRAPHY.label, { color: colors.textSecondary }]}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: { background: string; text: string; textSecondary: string; border: string; disabled: string }) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg },

    topBar: {
      width: '100%',
      alignItems: 'flex-end',
      marginBottom: SPACING.sm,
    },

    title: { ...TYPOGRAPHY.pageTitle, color: colors.text, textAlign: 'center', marginTop: SPACING.lg },
    subtitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.sm,
      marginBottom: SPACING.lg,
    },

    stepperRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.sm,
      marginBottom: SPACING.xl,
    },
    step: {
      width: 56,
      height: 8,
      borderRadius: RADIUS.full,
      backgroundColor: colors.disabled,
    },
    stepActive: {
      backgroundColor: COLORS.brand.primary,
    },

    callout: {
      borderRadius: RADIUS.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(59,130,246,0.30)',
      backgroundColor: 'rgba(59,130,246,0.08)',
      padding: SPACING.lg,
      marginBottom: SPACING.xl,
    },
    calloutRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.md,
    },
    calloutIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(59,130,246,0.12)',
    },

    heroIconWrap: { alignItems: 'center', marginTop: SPACING.xl, marginBottom: SPACING.xl },
    heroIconCircle: {
      width: 160,
      height: 160,
      borderRadius: 80,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(59,130,246,0.14)',
    },

    sectionTitle: { ...TYPOGRAPHY.cardTitle, color: colors.text, textAlign: 'center' },
    sectionBody: { ...TYPOGRAPHY.bodyNormal, color: colors.textSecondary, textAlign: 'center', marginTop: SPACING.sm },

    error: { ...TYPOGRAPHY.bodySmall, color: COLORS.semantic.error, textAlign: 'center', marginTop: SPACING.lg },

    secondaryCta: {
      height: 64,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      overflow: 'hidden',
    },
    secondaryCtaPressed: {
      transform: [{ scale: 0.985 }],
      opacity: 0.96,
    },

    backBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      height: 48,
      marginTop: SPACING.lg,
    },

    pressed: { opacity: 0.7 },
  });

export default BiometricSetupScreen;
