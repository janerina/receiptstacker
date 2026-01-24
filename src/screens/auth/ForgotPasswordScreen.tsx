import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
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
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { AuthStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';

export type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const applyAlpha = (hexOrColor: string, alpha: number) => {
  // Supports #RRGGBB / #RGB. Falls back to original string.
  const c = hexOrColor.trim();

  if (/^#([0-9a-fA-F]{3})$/.test(c)) {
    const r = parseInt(c[1] + c[1], 16);
    const g = parseInt(c[2] + c[2], 16);
    const b = parseInt(c[3] + c[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (/^#([0-9a-fA-F]{6})$/.test(c)) {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return hexOrColor;
};

/**
 * Forgot Password screen.
 *
 * Minimal, functional flow:
 * - Validates email
 * - Simulates sending a reset link
 */
export const ForgotPasswordScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();

  const primary = COLORS.brand.primary;
  const success = COLORS.semantic.success;

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successSent, setSuccessSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const validateEmail = (): boolean => {
    if (!email) {
      setError('Email is required');
      return false;
    }

    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return false;
    }

    setError('');
    return true;
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (error) setError('');
  };

  const handleSendResetLink = async () => {
    setError('');
    if (!validateEmail()) return;

    try {
      setLoading(true);

      await new Promise<void>((resolve) => setTimeout(resolve, 1500));

      const ok = Math.random() > 0.05;
      if (ok) {
        setSuccessSent(true);
        setCountdown(60);
      } else {
        setError('Email not found. Please check and try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;

    setCountdown(60);

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    } catch (e) {
      // Silent failure; countdown already started.
      console.error('Resend failed:', e);
    }
  };

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
    return;
  }, [countdown]);

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
          <View style={styles.headerRow}>
            <IconButton
              variant="ghost"
              size="md"
              icon={<Feather name="chevron-left" size={ICON_SIZES.md} color={colors.text} />}
              onPress={() => navigation.navigate('Login')}
              accessibilityLabel="Back to Login"
            />
          </View>

          {!successSent ? (
            <View style={styles.center}>
              <View
                style={[
                  styles.heroIcon,
                  { backgroundColor: applyAlpha(primary, 0.1) },
                ]}
                accessibilityRole="image"
                accessibilityLabel="Lock icon"
              >
                <Feather name="lock" size={40} color={primary} />
              </View>

              <Text style={styles.title}>Forgot Password?</Text>

              <Text style={styles.description}>
                Enter your email and we&apos;ll send you a link to reset your password
              </Text>

              <View style={styles.formWidth}>
                <Input
                  label="Email"
                  placeholder="your@email.com"
                  value={email}
                  onChangeText={handleEmailChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  leftIcon={<Feather name="mail" size={ICON_SIZES.sm} color={colors.textTertiary} />}
                  error={error}
                  accessibilityLabel="Email"
                />
              </View>

              <View style={[styles.formWidth, { marginTop: SPACING.lg }]}>
                <Button
                  title="Send Reset Link"
                  onPress={handleSendResetLink}
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={loading}
                  disabled={loading}
                  accessibilityLabel="Send Reset Link"
                />
              </View>
            </View>
          ) : (
            <View style={styles.center}>
              <View
                style={[
                  styles.heroIcon,
                  { marginBottom: SPACING.lg, backgroundColor: applyAlpha(success, 0.1) },
                ]}
                accessibilityRole="image"
                accessibilityLabel="Success icon"
              >
                <Feather name="check-circle" size={40} color={success} />
              </View>

              <Text style={styles.successTitle}>Check Your Email</Text>
              <Text style={styles.successMessage}>
                We&apos;ve sent a password reset link to {email}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={countdown > 0 ? `Resend disabled. ${countdown} seconds remaining` : 'Resend reset link'}
                accessibilityState={{ disabled: countdown > 0 }}
                onPress={handleResend}
                hitSlop={SPACING.sm}
                disabled={countdown > 0}
                style={({ pressed }) => [
                  styles.resendWrap,
                  pressed && countdown === 0 ? styles.pressed : null,
                ]}
              >
                <Text
                  style={[
                    TYPOGRAPHY.label,
                    {
                      color: countdown > 0 ? colors.textTertiary : primary,
                    },
                    styles.resendText,
                  ]}
                >
                  {countdown > 0
                    ? `Didn't receive? Resend (${countdown}s)`
                    : "Didn't receive? Resend"}
                </Text>
              </Pressable>

              <Button
                title="Back to Login"
                onPress={() => navigation.navigate('Login')}
                variant="ghost"
                size="md"
                icon={<Feather name="chevron-left" size={ICON_SIZES.md} color={primary} />}
                iconPosition="left"
                accessibilityLabel="Back to Login"
                style={styles.backToLoginBtn}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: { background: string; text: string; textSecondary: string; textTertiary: string }) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      flexGrow: 1,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
      alignItems: 'center',
    },
    headerRow: {
      width: '100%',
      alignItems: 'flex-start',
    },
    center: {
      width: '100%',
      alignItems: 'center',
    },
    heroIcon: {
      width: 80,
      height: 80,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING['2xl'],
      marginBottom: SPACING.xl,
    },
    title: {
      ...TYPOGRAPHY.pageTitle,
      color: colors.text,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },
    description: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 300,
      lineHeight: 24,
      marginBottom: SPACING.xl,
    },
    formWidth: {
      width: '100%',
      maxWidth: 420,
    },
    successTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      textAlign: 'center',
      marginBottom: SPACING.sm,
    },
    successMessage: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 300,
      marginBottom: SPACING.lg,
    },
    resendWrap: {
      marginBottom: SPACING.xl,
    },
    resendText: {
      textAlign: 'center',
    },
    backToLoginBtn: {
      alignSelf: 'center',
    },
    pressed: { opacity: 0.6 },
  });
