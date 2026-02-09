import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';

import { Button, Checkbox, IconButton, Input } from '@/components/common';
import { AppLogo } from '@/components/compositions';
import { KeyboardAwareFormScroll } from '@/components/layout/KeyboardAwareFormScroll';
import { COLORS, ICON_SIZES, SPACING, TYPOGRAPHY } from '@/constants';
import type { AuthStackParamList } from '@/navigation';
import { useTheme as useAppTheme } from '@/hooks/useTheme';
import { useTheme as useDesignTheme } from '@/theme';
import { emitAuthChanged } from '@/utils/authEvents';
import { normalizeEmail, verifyLocalLogin } from '@/services/localAuth';
import {
  consumePendingBiometricSetupCreds,
  getBiometricCredentials,
  getBiometricState,
  getBiometryLabel,
  setPendingBiometricSetupCreds,
  type BiometricState,
} from '@/services/biometricAuth';

export type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

interface FormErrors {
  email: string;
  password: string;
}

const AUTH_TOKEN_KEY = '@auth_token' as const;
const USER_KEY = '@user' as const;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * ReceiptStacker Login screen.
 *
 * Features:
 * - Email/password login with validation
 * - Forgot Password + Sign Up navigation
 * - Face ID login via secure OS prompt
 * - Local account verification + token persistence
 */
export const LoginScreen = ({ navigation }: Props) => {
  const appTheme = useAppTheme();
  const theme = useDesignTheme();
  const primary = theme.colors.primary;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [info, setInfo] = useState('');
  const [biometricState, setBiometricState] = useState<BiometricState | null>(null);

  const styles = useMemo(() => createStyles(theme), [theme]);

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      const load = async () => {
        try {
          const s = await getBiometricState();
          if (!cancelled) setBiometricState(s);
        } catch {
          if (!cancelled) setBiometricState({ state: 'notSupported', kind: 'none', message: 'Biometric authentication is not available.' });
        }
      };

      load();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const validateForm = (): boolean => {
    const newErrors: FormErrors = { email: '', password: '' };

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!emailRegex.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    setErrors(newErrors);
    return !newErrors.email && !newErrors.password;
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
    setGeneralError('');
    setInfo('');
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
    setGeneralError('');
    setInfo('');
  };

  const handleLogin = async () => {
    setGeneralError('');
    if (!validateForm()) return;

    try {
      setLoading(true);

      const account = await verifyLocalLogin(email, password);

      await AsyncStorage.setItem(AUTH_TOKEN_KEY, 'local_token');
      await AsyncStorage.setItem(
        USER_KEY,
        JSON.stringify({
          email: account.user.email,
          name: account.user.name,
          id: account.user.id,
        }),
      );

      emitAuthChanged();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      setGeneralError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricsPress = async () => {
    setGeneralError('');
    setInfo('');

    try {
      setLoading(true);

      const state = biometricState ?? (await getBiometricState());
      if (state.state === 'notSupported' || state.state === 'notEnrolled') {
        setGeneralError(state.message);
        return;
      }

      if (state.state === 'availableAndEnabled') {
        const creds = await getBiometricCredentials(state.kind);
        const account = await verifyLocalLogin(creds.email, creds.password);

        await AsyncStorage.setItem(AUTH_TOKEN_KEY, 'local_token');
        await AsyncStorage.setItem(
          USER_KEY,
          JSON.stringify({
            email: account.user.email,
            name: account.user.name,
            id: account.user.id,
          }),
        );

        // Keep the email aligned with the local account.
        setEmail(normalizeEmail(account.user.email));
        emitAuthChanged();
        return;
      }

      // Not enabled yet: route the user through the Face ID setup screen.
      if (!validateForm()) return;
      const normalized = normalizeEmail(email);

      // Verify credentials first so we never store a wrong password behind biometrics.
      await verifyLocalLogin(normalized, password);

      // Clear any stale pending state and set the current credentials for the setup screen.
      consumePendingBiometricSetupCreds();
      setPendingBiometricSetupCreds({ email: normalized, password });
      navigation.navigate('BiometricSetup', { email: normalized });
    } catch (e) {
      setGeneralError(e instanceof Error ? e.message : 'Biometric authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topRightToggle}>
        <IconButton
          accessibilityLabel="Toggle theme"
          onPress={appTheme.toggleTheme}
          icon={
            <Feather
              name={appTheme.isDark ? 'sun' : 'moon'}
              size={ICON_SIZES.md}
              color={theme.colors.text}
            />
          }
        />
      </View>

      <KeyboardAwareFormScroll contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <AppLogo size="md" showTagline />

            <Text style={styles.welcome}>Welcome Back</Text>
            <Text style={styles.subheading}>Sign in to your local account</Text>
          </View>

          <View style={styles.form}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Biometric login"
              onPress={handleBiometricsPress}
              disabled={loading}
              android_ripple={{ color: 'rgba(59,130,246,0.20)', foreground: true }}
              style={({ pressed }) => [styles.faceIdCard, pressed && styles.pressed]}
            >
              <View style={styles.faceIdRow}>
                <MaterialCommunityIcons name="face-recognition" size={ICON_SIZES.md} color={primary} />
                <Text style={styles.faceIdText}>
                  {(() => {
                    const s = biometricState;
                    const label = getBiometryLabel(s?.kind ?? 'faceId');
                    return s?.state === 'availableAndEnabled' ? `Login with ${label}` : `Set up ${label}`;
                  })()}
                </Text>
              </View>
            </Pressable>

            {info ? (
              <Text style={styles.info} accessibilityRole="text">
                {info}
              </Text>
            ) : null}

            <View style={styles.dividerRow} accessibilityLabel="Or continue with email">
              <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
              <Text style={styles.dividerText}>Or continue with email</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
            </View>

            <View style={{ marginBottom: SPACING.md }}>
              <Input
                placeholder="Email Address"
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                leftIcon={<Feather name="mail" size={ICON_SIZES.sm} color={theme.colors.textTertiary} />}
                error={errors.email}
                accessibilityLabel="Email"
              />
            </View>

            <View style={{ marginBottom: SPACING.md }}>
              <Input
                placeholder="Password"
                value={password}
                onChangeText={handlePasswordChange}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                leftIcon={<Feather name="lock" size={ICON_SIZES.sm} color={theme.colors.textTertiary} />}
                rightIcon={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    onPress={() => setShowPassword((prev) => !prev)}
                    hitSlop={SPACING.sm}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Feather
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={ICON_SIZES.sm}
                      color={theme.colors.textTertiary}
                    />
                  </Pressable>
                }
                error={errors.password}
                accessibilityLabel="Password"
              />
            </View>

            <View style={styles.rememberRow}>
              <Checkbox
                checked={rememberMe}
                onPress={() => setRememberMe((v) => !v)}
                label="Remember me"
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Forgot password"
                onPress={() => navigation.navigate('ForgotPassword')}
                hitSlop={SPACING.sm}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={[TYPOGRAPHY.label, { color: primary }]}>Forgot Password?</Text>
              </Pressable>
            </View>

            {generalError ? (
              <Text style={styles.generalError} accessibilityRole="alert">
                {generalError}
              </Text>
            ) : null}

            <View style={{ marginTop: SPACING.lg, marginBottom: SPACING.xl }}>
              <Button
                title="Sign In"
                onPress={handleLogin}
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                disabled={loading}
                accessibilityLabel="Sign In"
              />
            </View>

            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign up"
                onPress={() => navigation.navigate('SignUp')}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={[TYPOGRAPHY.bodySmall, styles.footerText]}>
                  Don't have an account?{' '}
                  <Text style={styles.footerLink}>Sign Up</Text>
                </Text>
              </Pressable>
            </View>
          </View>
      </KeyboardAwareFormScroll>
    </SafeAreaView>
  );
};

const createStyles = (colors: {
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
    border: string;
    primary: string;
  };
  spacing: typeof SPACING;
  radius: { sm: number; md: number; lg: number; full: number };
  shadows: { md?: any };
}) => {
  const primary = colors.colors.primary;
  const faceIdBg = 'rgba(59, 130, 246, 0.10)';
  const faceIdBgPressed = 'rgba(59, 130, 246, 0.26)';

  return StyleSheet.create({
    flex: { flex: 1 },
    container: {
      flex: 1,
      backgroundColor: colors.colors.background,
    },
    topRightToggle: {
      position: 'absolute',
      top: SPACING.lg,
      right: SPACING.lg,
      zIndex: 10,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING['3xl'],
    },
    header: {
      alignItems: 'center',
      marginTop: SPACING['2xl'],
    },
    welcome: {
      ...TYPOGRAPHY.pageTitle,
      color: colors.colors.text,
      textAlign: 'center',
      marginTop: SPACING.xl,
    },
    subheading: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.colors.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.sm,
      marginBottom: SPACING.xl,
    },
    form: {
      flex: 1,
    },
    faceIdCard: {
      backgroundColor: faceIdBg,
      borderRadius: 18,
      overflow: 'hidden',
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(59, 130, 246, 0.35)',
    },
    faceIdRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
    },
    faceIdText: {
      ...TYPOGRAPHY.bodyNormal,
      color: primary,
      fontWeight: '600',
    },
    info: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.colors.textSecondary,
      marginTop: -SPACING.lg,
      marginBottom: SPACING.lg,
      textAlign: 'center',
    },
    generalError: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.semantic.error,
      marginBottom: SPACING.md,
    },
    rememberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.lg,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.xl,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
    },
    dividerText: {
      ...TYPOGRAPHY.caption,
      color: colors.colors.textSecondary,
      marginHorizontal: SPACING.md,
    },
    footer: {
      marginBottom: SPACING.xl,
    },
    footerText: {
      color: colors.colors.textSecondary,
      textAlign: 'center',
    },
    footerLink: {
      color: primary,
      fontWeight: '700',
    },
    pressed: {
      backgroundColor: faceIdBgPressed,
    },
  });
};

export default LoginScreen;
