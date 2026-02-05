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

import { Button, IconButton, Input } from '@/components/common';
import { COLORS, ICON_SIZES, SPACING, TYPOGRAPHY } from '@/constants';
import type { AuthStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { hexToRgba } from '@/utils/color';

export type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PENDING_SIGNUP_KEY = '@pending_signup' as const;

const hasUpper = (s: string) => /[A-Z]/.test(s);
const hasLower = (s: string) => /[a-z]/.test(s);
const hasNumber = (s: string) => /\d/.test(s);
const hasSpecial = (s: string) => /[^a-zA-Z0-9]/.test(s);

export const SignUpScreen = ({ navigation }: Props) => {
  const { colors, isDark, toggleTheme } = useTheme();
  const primary = COLORS.brand.primary;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');

  const styles = useMemo(() => createStyles({ colors, isDark, primary }), [colors, isDark, primary]);

  const normalizedEmail = email.trim().toLowerCase();
  const emailOk = emailRegex.test(normalizedEmail);

  const reqLen = password.length >= 12;
  const reqUpper = hasUpper(password);
  const reqLower = hasLower(password);
  const reqNum = hasNumber(password);
  const reqSpec = hasSpecial(password);
  const reqsMet = [reqLen, reqUpper, reqLower, reqNum, reqSpec].filter(Boolean).length;

  const strength = useMemo(() => {
    if (!password) return { label: 'Weak', color: COLORS.semantic.error, bars: 0 } as const;
    if (reqsMet <= 2) return { label: 'Weak', color: COLORS.semantic.error, bars: Math.max(1, reqsMet) } as const;
    if (reqsMet <= 4) return { label: 'Strong', color: COLORS.semantic.success, bars: reqsMet } as const;
    return { label: 'Very Strong', color: COLORS.semantic.success, bars: 5 } as const;
  }, [password, reqsMet]);

  const passwordsMatch = !!confirmPassword && password === confirmPassword;
  const passwordsMismatch = !!confirmPassword && password !== confirmPassword;

  const formOk =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    emailOk &&
    reqsMet === 5 &&
    passwordsMatch &&
    termsAccepted;

  const handleContinue = async () => {
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name.');
      return;
    }
    if (!emailOk) {
      setError('Please enter a valid email address.');
      return;
    }
    if (reqsMet !== 5) {
      setError('Please meet all password requirements.');
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }
    if (!termsAccepted) {
      setError('Please accept the Terms of Service and Privacy Policy.');
      return;
    }

    await AsyncStorage.setItem(
      PENDING_SIGNUP_KEY,
      JSON.stringify({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        password,
      }),
    );

    navigation.navigate('SecuritySetup');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <IconButton
              accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onPress={toggleTheme}
              icon={<Feather name={isDark ? 'sun' : 'moon'} size={ICON_SIZES.md} color={colors.text} />}
            />
          </View>

          <View style={styles.logoWrap}>
            <View style={styles.logoMark}>
              <Feather name="file-text" size={22} color={primary} />
            </View>
            <Text style={styles.brandText}>ReceiptStacker</Text>
          </View>

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Sign up to get started with ReceiptStacker</Text>

          <View style={styles.stepsRow}>
            <View style={[styles.stepPill, styles.stepActive]} />
            <View style={styles.stepPill} />
            <View style={styles.stepPill} />
            <View style={styles.stepPill} />
          </View>

          <View style={{ marginTop: SPACING.lg }}>
            <Input
              placeholder="First Name"
              value={firstName}
              onChangeText={(t) => {
                setFirstName(t);
                setError('');
              }}
              autoCapitalize="words"
              leftIcon={<Feather name="user" size={ICON_SIZES.sm} color={colors.textTertiary} />}
              accessibilityLabel="First Name"
            />
          </View>

          <View style={{ marginTop: SPACING.md }}>
            <Input
              placeholder="Last Name"
              value={lastName}
              onChangeText={(t) => {
                setLastName(t);
                setError('');
              }}
              autoCapitalize="words"
              leftIcon={<Feather name="user" size={ICON_SIZES.sm} color={colors.textTertiary} />}
              accessibilityLabel="Last Name"
            />
          </View>

          <View style={{ marginTop: SPACING.md }}>
            <Input
              placeholder="Email Address (required)"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon={<Feather name="mail" size={ICON_SIZES.sm} color={colors.textTertiary} />}
              accessibilityLabel="Email Address"
            />

            {emailOk ? (
              <View style={styles.okRow}>
                <Feather name="check" size={16} color={COLORS.semantic.success} />
                <Text style={styles.okText}>Valid email address</Text>
              </View>
            ) : null}
          </View>

          <View style={{ marginTop: SPACING.md }}>
            <Input
              placeholder="Password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError('');
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              leftIcon={<Feather name="lock" size={ICON_SIZES.sm} color={colors.textTertiary} />}
              rightIcon={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={SPACING.sm}
                >
                  <Feather name="eye" size={ICON_SIZES.sm} color={colors.textTertiary} />
                </Pressable>
              }
              accessibilityLabel="Password"
            />

            {password.length > 0 ? (
              <View style={styles.strengthWrap}>
                <View style={styles.strengthHeader}>
                  <Text style={styles.strengthLabel}>Password Strength:</Text>
                  <Text style={[styles.strengthValue, { color: strength.color }]}>{strength.label}</Text>
                </View>
                <View style={styles.barsRow}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.bar,
                        i < strength.bars ? { backgroundColor: strength.color } : null,
                      ]}
                    />
                  ))}
                </View>

                <Text style={styles.reqsTitle}>Password requirements:</Text>
                <View style={styles.reqRow}>
                  <Feather name={reqLen ? 'check' : 'x'} size={16} color={reqLen ? COLORS.semantic.success : COLORS.semantic.error} />
                  <Text style={[styles.reqText, { color: reqLen ? COLORS.semantic.success : colors.textSecondary }]}>At least 12 characters</Text>
                </View>
                <View style={styles.reqRow}>
                  <Feather name={reqUpper ? 'check' : 'x'} size={16} color={reqUpper ? COLORS.semantic.success : COLORS.semantic.error} />
                  <Text style={[styles.reqText, { color: reqUpper ? COLORS.semantic.success : colors.textSecondary }]}>At least one uppercase letter</Text>
                </View>
                <View style={styles.reqRow}>
                  <Feather name={reqLower ? 'check' : 'x'} size={16} color={reqLower ? COLORS.semantic.success : COLORS.semantic.error} />
                  <Text style={[styles.reqText, { color: reqLower ? COLORS.semantic.success : colors.textSecondary }]}>At least one lowercase letter</Text>
                </View>
                <View style={styles.reqRow}>
                  <Feather name={reqNum ? 'check' : 'x'} size={16} color={reqNum ? COLORS.semantic.success : COLORS.semantic.error} />
                  <Text style={[styles.reqText, { color: reqNum ? COLORS.semantic.success : colors.textSecondary }]}>At least one number</Text>
                </View>
                <View style={styles.reqRow}>
                  <Feather name={reqSpec ? 'check' : 'x'} size={16} color={reqSpec ? COLORS.semantic.success : COLORS.semantic.error} />
                  <Text style={[styles.reqText, { color: reqSpec ? COLORS.semantic.success : colors.textSecondary }]}>
                    At least one special character (!@#$%^&*)
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={{ marginTop: SPACING.md }}>
            <Input
              placeholder="Confirm Password"
              value={confirmPassword}
              onChangeText={(t) => {
                setConfirmPassword(t);
                setError('');
              }}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              leftIcon={<Feather name="lock" size={ICON_SIZES.sm} color={colors.textTertiary} />}
              rightIcon={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
                  onPress={() => setShowConfirmPassword((v) => !v)}
                  hitSlop={SPACING.sm}
                >
                  <Feather name="eye" size={ICON_SIZES.sm} color={colors.textTertiary} />
                </Pressable>
              }
              accessibilityLabel="Confirm Password"
            />

            {passwordsMatch ? (
              <View style={styles.okRow}>
                <Feather name="check" size={16} color={COLORS.semantic.success} />
                <Text style={styles.okText}>Passwords match</Text>
              </View>
            ) : passwordsMismatch ? (
              <View style={styles.mismatchRow}>
                <Feather name="x" size={16} color={COLORS.semantic.error} />
                <Text style={styles.mismatchText}>Passwords do not match</Text>
              </View>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
            accessibilityState={{ checked: termsAccepted }}
            onPress={() => {
              setTermsAccepted((v) => !v);
              setError('');
            }}
            style={({ pressed }) => [styles.termsRow, pressed ? styles.pressed : null]}
          >
            <View style={[styles.checkbox, termsAccepted ? styles.checkboxChecked : null]}>
              {termsAccepted ? <Feather name="check" size={16} color={colors.surface} /> : null}
            </View>

            <Text style={styles.termsText}>
              I agree to the <Text style={styles.linkText}>Terms of Service</Text> and <Text style={styles.linkText}>Privacy Policy</Text>
            </Text>
          </Pressable>

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <View style={{ marginTop: SPACING.lg }}>
            <Button
              title="Continue to Security Setup"
              onPress={handleContinue}
              variant="primary"
              size="lg"
              fullWidth
              disabled={!formOk}
              accessibilityLabel="Continue to Security Setup"
            />
          </View>

          <View style={styles.signInRow}>
            <Text style={styles.signInText}>Already have an account? </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign In"
              onPress={() => navigation.navigate('Login')}
              style={({ pressed }) => (pressed ? styles.pressed : null)}
            >
              <Text style={styles.linkText}>Sign In</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
  isDark,
  primary,
}: {
  colors: {
    background: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
    border: string;
    surface: string;
  };
  isDark: boolean;
  primary: string;
}) => {

  return StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg },

    topBar: { width: '100%', alignItems: 'flex-end' },

    logoWrap: { alignItems: 'center', marginTop: SPACING.sm },
    logoMark: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(primary, isDark ? 0.14 : 0.1),
      marginBottom: SPACING.xs,
    },
    brandText: { ...TYPOGRAPHY.caption, color: colors.textSecondary },

    title: { ...TYPOGRAPHY.pageTitle, color: colors.text, textAlign: 'center', marginTop: SPACING.lg },
    subtitle: { ...TYPOGRAPHY.bodyNormal, color: colors.textSecondary, textAlign: 'center', marginTop: SPACING.sm },

    stepsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: SPACING.sm,
      marginTop: SPACING.lg,
    },
    stepPill: {
      width: 62,
      height: 10,
      borderRadius: 6,
      backgroundColor: 'rgba(100,116,139,0.14)',
    },
    stepActive: { backgroundColor: primary },

    okRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm },
    okText: { ...TYPOGRAPHY.bodySmall, color: COLORS.semantic.success, marginLeft: SPACING.sm },

    mismatchRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm },
    mismatchText: { ...TYPOGRAPHY.bodySmall, color: COLORS.semantic.error, marginLeft: SPACING.sm },

    strengthWrap: { marginTop: SPACING.md },
    strengthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    strengthLabel: { ...TYPOGRAPHY.label, color: colors.text },
    strengthValue: { ...TYPOGRAPHY.label },

    barsRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm },
    bar: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: 'rgba(100,116,139,0.20)',
    },

    reqsTitle: { ...TYPOGRAPHY.label, color: colors.text, marginTop: SPACING.md, marginBottom: SPACING.sm },
    reqRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
    reqText: { ...TYPOGRAPHY.bodySmall, marginLeft: SPACING.sm },

    termsRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.md },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: SPACING.md,
    },
    checkboxChecked: { backgroundColor: primary, borderColor: primary },
    termsText: { ...TYPOGRAPHY.bodyNormal, color: colors.text, flex: 1, flexWrap: 'wrap' },
    linkText: { color: primary, fontWeight: '600' },

    error: { ...TYPOGRAPHY.bodySmall, color: COLORS.semantic.error, marginTop: SPACING.md },

    signInRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: SPACING.xl },
    signInText: { ...TYPOGRAPHY.bodyNormal, color: colors.textSecondary },

    pressed: { opacity: 0.65 },
  });
};

export default SignUpScreen;
