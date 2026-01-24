import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import ReactNativeBiometrics from 'react-native-biometrics';

import { Button, Input } from '@/components/common';
import { COLORS, COMPONENT_SIZES, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { AuthStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { emitAuthChanged } from '@/utils/authEvents';

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
 * - Biometric login via react-native-biometrics
 * - Mock API call + token persistence
 */
export const LoginScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');

  const styles = useMemo(() => createStyles(colors), [colors]);

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
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
    setGeneralError('');
  };

  const handleLogin = async () => {
    setGeneralError('');
    if (!validateForm()) return;

    try {
      setLoading(true);

      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 1500);
      });

      const success = Math.random() > 0.2;
      if (!success) {
        setGeneralError('Invalid email or password');
        return;
      }

      await AsyncStorage.setItem(AUTH_TOKEN_KEY, 'mock_token_12345');
      await AsyncStorage.setItem(
        USER_KEY,
        JSON.stringify({
          email,
          name: 'John Doe',
          id: '123',
        }),
      );

      emitAuthChanged();
    } catch {
      setGeneralError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFaceID = async () => {
    setGeneralError('');

    try {
      setLoading(true);

      const rnBiometrics = new ReactNativeBiometrics();

      const { available } = await rnBiometrics.isSensorAvailable();
      if (!available) {
        setGeneralError('Biometric authentication not available on this device');
        return;
      }

      const { success } = await rnBiometrics.simplePrompt({
        promptMessage: 'Authenticate to login',
        cancelButtonText: 'Cancel',
      });

      if (!success) {
        setGeneralError('Biometric authentication failed');
        return;
      }

      const savedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (savedToken) {
        emitAuthChanged();
      } else {
        setGeneralError('No saved credentials found. Please login with email first.');
      }
    } catch {
      setGeneralError('Biometric authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logo} accessibilityRole="image" accessibilityLabel="ReceiptStacker logo">
              <Text style={styles.logoText}>R</Text>
            </View>

            <Text style={styles.appName}>ReceiptStacker</Text>

            <Text style={styles.welcome}>Welcome Back</Text>
            <Text style={styles.subheading}>Sign in to continue</Text>
          </View>

          <View style={styles.form}>
            <View style={{ marginBottom: SPACING.md }}>
              <Input
                label="Email"
                placeholder="your@email.com"
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                leftIcon={<Feather name="mail" size={ICON_SIZES.sm} color={colors.textTertiary} />}
                error={errors.email}
                accessibilityLabel="Email"
              />
            </View>

            <View style={{ marginBottom: SPACING.sm }}>
              <Input
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChangeText={handlePasswordChange}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                leftIcon={<Feather name="lock" size={ICON_SIZES.sm} color={colors.textTertiary} />}
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
                      color={colors.textTertiary}
                    />
                  </Pressable>
                }
                error={errors.password}
                accessibilityLabel="Password"
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
              onPress={() => navigation.navigate('ForgotPassword')}
              hitSlop={SPACING.sm}
              style={({ pressed }) => [styles.forgotWrap, pressed && styles.pressed]}
            >
              <Text style={[TYPOGRAPHY.label, { color: primary }]}>Forgot Password?</Text>
            </Pressable>

            {generalError ? (
              <Text style={styles.generalError} accessibilityRole="alert">
                {generalError}
              </Text>
            ) : null}

            <View style={{ marginTop: SPACING.md, marginBottom: SPACING.xl }}>
              <Button
                title="Login"
                onPress={handleLogin}
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                disabled={loading}
                accessibilityLabel="Login"
              />
            </View>

            <View style={styles.dividerRow} accessibilityLabel="Or">
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[TYPOGRAPHY.caption, { color: colors.textTertiary, marginHorizontal: SPACING.sm }]}>OR</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            <View style={{ marginBottom: SPACING['2xl'] }}>
              <Button
                title="Login with Face ID"
                onPress={handleFaceID}
                variant="outline"
                size="lg"
                fullWidth
                disabled={loading}
                icon={<Feather name="scan" size={ICON_SIZES.sm} color={primary} />}
                iconPosition="left"
                accessibilityLabel="Login with Face ID"
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: {
  background: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
}) => {
  const primary = COLORS.brand.primary;
  const logoSize = COMPONENT_SIZES.bottomTabBar.scanButton.size;

  return StyleSheet.create({
    flex: { flex: 1 },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.xl,
    },
    header: {
      alignItems: 'center',
      marginTop: SPACING.xl,
    },
    logo: {
      width: logoSize,
      height: logoSize,
      borderRadius: RADIUS.full,
      backgroundColor: primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoText: {
      color: COLORS.common.white,
      fontSize: ICON_SIZES.xl,
      fontWeight: '700',
    },
    appName: {
      ...TYPOGRAPHY.sectionHeading,
      color: primary,
      textAlign: 'center',
      marginTop: SPACING.sm,
    },
    welcome: {
      ...TYPOGRAPHY.pageTitle,
      color: colors.text,
      textAlign: 'center',
      marginTop: SPACING.xl,
    },
    subheading: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.sm,
      marginBottom: SPACING.xl,
    },
    form: {
      flex: 1,
    },
    forgotWrap: {
      alignSelf: 'flex-end',
      marginBottom: SPACING.lg,
    },
    generalError: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.semantic.error,
      marginBottom: SPACING.md,
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
    footer: {
      marginBottom: SPACING.xl,
    },
    footerText: {
      color: colors.textSecondary,
      textAlign: 'center',
    },
    footerLink: {
      color: primary,
      fontWeight: '700',
    },
    pressed: {
      opacity: 0.6,
    },
  });
};

export default LoginScreen;
