import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { hexToRgba } from '@/utils/color';
import {
  consumePendingBiometricSetupCreds,
  disableBiometricLogin,
  enableBiometricLogin,
  getBiometricState,
  getBiometryLabel,
} from '@/services/biometricAuth';

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
const SETTINGS_KEY = '@settings' as const;

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
  const primary = COLORS.brand.primary;
  const styles = useMemo(() => createStyles({ colors, isDark, primary }), [colors, isDark, primary]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [biometryLabel, setBiometryLabel] = useState<string>('Face ID');

  useFocusEffect(
    React.useCallback(() => {
      setError('');

      let cancelled = false;
      const load = async () => {
        try {
          const s = await getBiometricState();
          if (!cancelled) setBiometryLabel(getBiometryLabel(s.kind));
        } catch {
          // ignore
        }
      };
      load();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  const navigateToLogin = async () => {
    try {
      await AsyncStorage.multiRemove([PENDING_SIGNUP_KEY]);
    } catch {
      // Non-fatal
    }
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  const finalizeSignup = async ({ biometricsEnabled }: { biometricsEnabled: boolean }) => {
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

    await AsyncStorage.multiSet([
      [AUTH_TOKEN_KEY, 'local_token'],
      [
        USER_KEY,
        JSON.stringify({
          email: account.user.email,
          name: account.user.name,
          id: account.user.id,
        }),
      ],
      [BIOMETRICS_ENABLED_KEY, biometricsEnabled ? 'true' : 'false'],
    ]);
    await persistFaceIdSetting(biometricsEnabled);
    await AsyncStorage.multiRemove([PENDING_SIGNUP_KEY]);

    emitAuthChanged();
  };

  const persistFaceIdSetting = async (enabled: boolean) => {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      const parsed = safeJsonParse<Record<string, unknown>>(raw) ?? {};
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...parsed, faceId: enabled }));
    } catch {
      // Non-fatal
    }
  };

  const handleSetupBiometrics = async () => {
    setError('');
    try {
      setSubmitting(true);

      // Prefer our shared biometric service for consistent detection/messaging.
      const state = await getBiometricState();
      if (state.state === 'notSupported' || state.state === 'notEnrolled') throw new Error(state.message);

      // Two supported entry points:
      // 1) Signup flow: PENDING_SIGNUP_KEY exists; enabling Face ID finalizes signup and logs in.
      // 2) Login flow: credentials are passed in-memory from LoginScreen after verification.
      const raw = await AsyncStorage.getItem(PENDING_SIGNUP_KEY);
      const pending = safeJsonParse<PendingSignUp>(raw);

      if (pending) {
        if (pending.email.trim().toLowerCase() !== route.params.email.trim().toLowerCase()) {
          throw new Error('Signup information mismatch. Please start again.');
        }

        await enableBiometricLogin({ email: pending.email.trim().toLowerCase(), password: pending.password });

        try {
          await finalizeSignup({ biometricsEnabled: true });
        } catch (e) {
          // If signup finalization fails after we've stored creds, clean up.
          await disableBiometricLogin();
          throw e;
        }

        return;
      }

      const creds = consumePendingBiometricSetupCreds();
      if (!creds) throw new Error('Missing Face ID setup information. Please return to Login and try again.');
      if (creds.email.trim().toLowerCase() !== route.params.email.trim().toLowerCase()) {
        throw new Error('Face ID setup information mismatch. Please return to Login and try again.');
      }

      await enableBiometricLogin({ email: creds.email.trim().toLowerCase(), password: creds.password });
      await AsyncStorage.multiSet([
        [BIOMETRICS_ENABLED_KEY, 'true'],
      ]);
      await persistFaceIdSetting(true);

      Alert.alert('Face ID Enabled', 'Face ID is now enabled for quick login.');
      navigation.goBack();
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Something went wrong';
      const lower = raw.toLowerCase();

      if (lower.includes('account') && lower.includes('already exists')) {
        await navigateToLogin();
        return;
      }

      setError(raw);
      // Don't rethrow from UI event handlers; unhandled rejections can crash release builds.
      return;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setError('');
    try {
      setSubmitting(true);
      const raw = await AsyncStorage.getItem(PENDING_SIGNUP_KEY);
      const pending = safeJsonParse<PendingSignUp>(raw);
      if (pending) {
        await finalizeSignup({ biometricsEnabled: false });
        return;
      }

      // Login flow: clear pending creds and return.
      consumePendingBiometricSetupCreds();
      navigation.goBack();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      if (msg.toLowerCase().includes('account') && msg.toLowerCase().includes('already exists')) {
        await navigateToLogin();
        return;
      }

      setError(msg);
      // Don't rethrow from UI event handlers; unhandled rejections can crash release builds.
      return;
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

        <Text style={styles.title}>{`Enable ${biometryLabel} for quick login?`}</Text>
        <Text style={styles.subtitle}>{`Use ${biometryLabel} to sign in quickly and securely.`}</Text>

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
                Use biometrics to sign in quickly and securely.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.heroIconWrap}>
          <View style={styles.heroIconCircle}>
            <MaterialCommunityIcons name="face-recognition" size={64} color={COLORS.brand.primary} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>{`Enable ${biometryLabel}`}</Text>
        <Text style={styles.sectionBody}>
          {`Secure your account with ${biometryLabel} for instant access.`}
        </Text>

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <View style={{ marginTop: SPACING.xl }}>
          <Button
            title={`Enable ${biometryLabel}`}
            onPress={handleSetupBiometrics}
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
            disabled={submitting}
            icon={<MaterialCommunityIcons name="face-recognition" size={ICON_SIZES.md} color={COLORS.common.white} />}
            accessibilityLabel={`Enable ${biometryLabel}`}
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
                Not Now
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

const createStyles = ({
  colors,
  isDark,
  primary,
}: {
  colors: { background: string; text: string; textSecondary: string; border: string; disabled: string };
  isDark: boolean;
  primary: string;
}) =>
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
      borderColor: hexToRgba(primary, isDark ? 0.28 : 0.3),
      backgroundColor: hexToRgba(primary, isDark ? 0.1 : 0.08),
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
      backgroundColor: hexToRgba(primary, isDark ? 0.14 : 0.12),
    },

    heroIconWrap: { alignItems: 'center', marginTop: SPACING.xl, marginBottom: SPACING.xl },
    heroIconCircle: {
      width: 160,
      height: 160,
      borderRadius: 80,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(primary, isDark ? 0.16 : 0.14),
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
