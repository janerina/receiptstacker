import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';

import { Button, Checkbox, Input } from '@/components/common';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { AuthStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { emitAuthChanged } from '@/utils/authEvents';

export type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

interface FormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface FormErrors {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

type PasswordStrength = 'weak' | 'medium' | 'strong';

const AUTH_TOKEN_KEY = '@auth_token' as const;
const USER_KEY = '@user' as const;

const STRENGTH_WIDTH_WEAK = '33%' as const;
const STRENGTH_WIDTH_MEDIUM = '66%' as const;
const STRENGTH_WIDTH_STRONG = '100%' as const;
const MODAL_MAX_HEIGHT = '80%' as const;
const MODAL_BACKDROP_OPACITY = 0.45 as const;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const calculatePasswordStrength = (password: string): PasswordStrength => {
  if (password.length < 8) return 'weak';

  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;

  if (strength <= 2) return 'weak';
  if (strength <= 4) return 'medium';
  return 'strong';
};

/**
 * ReceiptStacker registration screen.
 *
 * Features:
 * - Full name, email, password, confirm password
 * - Password strength indicator (weak/medium/strong)
 * - Terms acceptance gating
 * - Mock signup API + AsyncStorage token persistence
 */
export const SignUpScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();

  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>('weak');
  const [termsVisible, setTermsVisible] = useState(false);

  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (formData.password) {
      setPasswordStrength(calculatePasswordStrength(formData.password));
    } else {
      setPasswordStrength('weak');
    }
  }, [formData.password]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    };

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some((e) => e !== '');
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
    setGeneralError('');
  };

  const isFormValid = useMemo(() => {
    const nameOk = formData.name.trim().length >= 2;
    const emailOk = emailRegex.test(formData.email);
    const pwOk = formData.password.length >= 8;
    const confirmOk = !!formData.confirmPassword && formData.password === formData.confirmPassword;
    return nameOk && emailOk && pwOk && confirmOk;
  }, [formData.confirmPassword, formData.email, formData.name, formData.password]);

  const canSubmit = isFormValid && termsAccepted && !loading;

  const strengthUI = useMemo(() => {
    const base = {
      label: 'Weak',
      color: COLORS.semantic.error,
      widthPercent: STRENGTH_WIDTH_WEAK,
    } as const;

    if (passwordStrength === 'medium') {
      return { label: 'Medium', color: COLORS.semantic.warning, widthPercent: STRENGTH_WIDTH_MEDIUM } as const;
    }
    if (passwordStrength === 'strong') {
      return { label: 'Strong', color: COLORS.semantic.success, widthPercent: STRENGTH_WIDTH_STRONG } as const;
    }
    return base;
  }, [passwordStrength]);

  const handleSignUp = async () => {
    setGeneralError('');

    if (!validateForm()) return;
    if (!termsAccepted) {
      setGeneralError('Please accept the Terms & Conditions');
      return;
    }

    try {
      setLoading(true);

      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 2000);
      });

      const success = Math.random() > 0.1;
      if (!success) {
        setGeneralError('Email already exists. Please use a different email or login.');
        return;
      }

      await AsyncStorage.setItem(AUTH_TOKEN_KEY, 'mock_token_new_user');
      await AsyncStorage.setItem(
        USER_KEY,
        JSON.stringify({
          email: formData.email,
          name: formData.name,
          id: 'new_user_123',
        }),
      );

      emitAuthChanged();
    } catch {
      setGeneralError('Something went wrong. Please try again.');
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
            hitSlop={SPACING.sm}
          >
            <Feather name="arrow-left" size={ICON_SIZES.md} color={colors.text} />
            <Text style={[TYPOGRAPHY.label, { color: colors.text, marginLeft: SPACING.xs }]}>Back</Text>
          </Pressable>

          <Text style={styles.title}>
            Create Account
          </Text>
          <Text
            style={styles.subtitle}
          >
            Start tracking your receipts
          </Text>

          <View style={{ marginTop: SPACING.xl }}>
            <Input
              label="Full Name"
              placeholder="John Doe"
              value={formData.name}
              onChangeText={(text) => handleInputChange('name', text)}
              autoCapitalize="words"
              error={errors.name}
              leftIcon={<Feather name="user" size={ICON_SIZES.sm} color={colors.textTertiary} />}
              accessibilityLabel="Full Name"
            />
          </View>

          <View style={{ marginTop: SPACING.md }}>
            <Input
              label="Email"
              placeholder="your@email.com"
              value={formData.email}
              onChangeText={(text) => handleInputChange('email', text)}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
              leftIcon={<Feather name="mail" size={ICON_SIZES.sm} color={colors.textTertiary} />}
              accessibilityLabel="Email"
            />
          </View>

          <View style={{ marginTop: SPACING.md }}>
            <Input
              label="Password"
              placeholder="At least 8 characters"
              value={formData.password}
              onChangeText={(text) => handleInputChange('password', text)}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              error={errors.password}
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
              accessibilityLabel="Password"
            />
          </View>

          <View style={[styles.strengthRow, { marginBottom: SPACING.md }]}> 
            <View style={[styles.strengthTrack, { backgroundColor: colors.disabled }]}>
              <View
                style={[
                  styles.strengthFill,
                  {
                    backgroundColor: strengthUI.color,
                    width: strengthUI.widthPercent,
                  },
                ]}
              />
            </View>
            <Text style={[TYPOGRAPHY.caption, { color: strengthUI.color, marginLeft: SPACING.sm }]}>
              {strengthUI.label}
            </Text>
          </View>

          <View style={{ marginTop: SPACING.xs }}>
            <Input
              label="Confirm Password"
              placeholder="Re-enter your password"
              value={formData.confirmPassword}
              onChangeText={(text) => handleInputChange('confirmPassword', text)}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              error={errors.confirmPassword}
              leftIcon={<Feather name="lock" size={ICON_SIZES.sm} color={colors.textTertiary} />}
              rightIcon={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  onPress={() => setShowConfirmPassword((prev) => !prev)}
                  hitSlop={SPACING.sm}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Feather
                    name={showConfirmPassword ? 'eye-off' : 'eye'}
                    size={ICON_SIZES.sm}
                    color={colors.textTertiary}
                  />
                </Pressable>
              }
              accessibilityLabel="Confirm Password"
            />
          </View>

          <View style={{ marginTop: SPACING.lg, marginBottom: SPACING.xl }}>
            <View style={styles.termsRow}>
              <Checkbox
                checked={termsAccepted}
                onPress={() => setTermsAccepted((prev) => !prev)}
                disabled={loading}
                accessibilityLabel="Accept Terms and Conditions"
              />

              <Text style={[TYPOGRAPHY.bodySmall, styles.termsText]}>
                I agree to{' '}
                <Text
                  accessibilityRole="link"
                  style={styles.termsLink}
                  onPress={() => setTermsVisible(true)}
                >
                  Terms & Conditions
                </Text>
              </Text>
            </View>
          </View>

          {generalError ? (
            <Text style={[TYPOGRAPHY.bodySmall, { color: COLORS.semantic.error, marginBottom: SPACING.md }]} accessibilityRole="alert">
              {generalError}
            </Text>
          ) : null}

          <View style={{ marginBottom: SPACING.xl }}>
            <Button
              title="Sign Up"
              onPress={handleSignUp}
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              disabled={!canSubmit}
              accessibilityLabel="Sign Up"
            />
          </View>

          <View style={styles.loginWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go to login"
              onPress={() => navigation.replace('Login')}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={[TYPOGRAPHY.bodySmall, styles.loginText]}> 
                Already have an account?{' '}
                <Text style={styles.loginLink}>Login</Text>
              </Text>
            </Pressable>
          </View>

          <Modal visible={termsVisible} transparent animationType="fade" onRequestClose={() => setTermsVisible(false)}>
            <View style={styles.modalBackdrop}>
              <View pointerEvents="none" style={styles.backdropFill} />
              <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.modalHeader}>
                  <Text style={[TYPOGRAPHY.cardTitle, { color: colors.text }]}>Terms & Conditions</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close terms"
                    onPress={() => setTermsVisible(false)}
                    hitSlop={SPACING.sm}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Feather name="x" size={ICON_SIZES.md} color={colors.text} />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary }]}>
                    By creating an account, you agree to use ReceiptStacker responsibly and acknowledge that
                    receipt data you store may contain sensitive information.
                  </Text>
                  <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary, marginTop: SPACING.md }]}>
                    We may store your account details and app preferences on your device. You can log out at
                    any time to clear your local session.
                  </Text>
                  <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary, marginTop: SPACING.md }]}>
                    These terms are provided for demo purposes.
                  </Text>
                </ScrollView>
              </View>
            </View>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  disabled: string;
}) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg },
    backRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
    pressed: { opacity: 0.6 },

    title: {
      ...TYPOGRAPHY.pageTitle,
      color: colors.text,
      textAlign: 'center',
      marginTop: SPACING.xl,
    },
    subtitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.sm,
      marginBottom: SPACING.xl,
    },

    strengthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACING.sm,
    },
    strengthTrack: {
      flex: 1,
      height: SPACING.xs,
      borderRadius: RADIUS.full,
      overflow: 'hidden',
    },
    strengthFill: {
      height: '100%',
      borderRadius: RADIUS.full,
    },

    termsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    termsText: {
      color: colors.text,
      marginLeft: SPACING.sm,
      flex: 1,
    },
    termsLink: {
      color: COLORS.brand.primary,
      fontWeight: '700',
    },

    loginWrap: {
      alignItems: 'center',
      marginBottom: SPACING.xl,
    },
    loginText: {
      color: colors.textSecondary,
      textAlign: 'center',
    },
    loginLink: {
      color: COLORS.brand.primary,
      fontWeight: '700',
    },

    modalBackdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
    },
    backdropFill: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: COLORS.common.black,
      opacity: MODAL_BACKDROP_OPACITY,
    },
    modalCard: {
      width: '100%',
      borderRadius: RADIUS.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: SPACING.lg,
      maxHeight: MODAL_MAX_HEIGHT,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
  });

export default SignUpScreen;
