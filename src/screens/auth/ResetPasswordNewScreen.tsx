import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';

import { Button, IconButton, Input } from '@/components/common';
import { KeyboardAwareFormScroll } from '@/components/layout/KeyboardAwareFormScroll';
import { COLORS, ICON_SIZES, SPACING, TYPOGRAPHY } from '@/constants';
import type { AuthStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { updateLocalPassword } from '@/services/localAuth';

export type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPasswordNew'>;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ResetPasswordNewScreen = ({ navigation, route }: Props) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;

  const { email } = route.params;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const styles = useMemo(() => createStyles(colors), [colors]);

  const validate = () => {
    if (!emailRegex.test(email)) return 'Please enter a valid email';
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (confirm !== password) return 'Passwords do not match';
    return '';
  };

  const handleSave = async () => {
    setError('');

    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }

    try {
      setLoading(true);
      await updateLocalPassword(email, password);
      navigation.navigate('Login');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAwareFormScroll contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <IconButton
              variant="ghost"
              size="md"
              icon={<Feather name="chevron-left" size={ICON_SIZES.md} color={colors.text} />}
              onPress={() => navigation.goBack()}
              accessibilityLabel="Back"
            />
          </View>

          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>Set a new password for your local account</Text>

          <View style={styles.card}>
            <View style={{ marginBottom: SPACING.md }}>
              <Input
                label="New Password"
                placeholder="Enter new password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                leftIcon={<Feather name="lock" size={ICON_SIZES.sm} color={colors.textTertiary} />}
                rightIcon={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    onPress={() => setShowPassword((p) => !p)}
                    hitSlop={SPACING.sm}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={ICON_SIZES.sm} color={colors.textTertiary} />
                  </Pressable>
                }
                accessibilityLabel="New password"
              />
            </View>

            <Input
              label="Confirm Password"
              placeholder="Re-enter new password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry={!showConfirm}
              leftIcon={<Feather name="lock" size={ICON_SIZES.sm} color={colors.textTertiary} />}
              rightIcon={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                  onPress={() => setShowConfirm((p) => !p)}
                  hitSlop={SPACING.sm}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Feather name={showConfirm ? 'eye-off' : 'eye'} size={ICON_SIZES.sm} color={colors.textTertiary} />
                </Pressable>
              }
              accessibilityLabel="Confirm password"
            />

            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            <View style={{ marginTop: SPACING.lg }}>
              <Button
                title="Save"
                onPress={handleSave}
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                disabled={loading}
                accessibilityLabel="Save new password"
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to Login"
              onPress={() => navigation.navigate('Login')}
              style={({ pressed }) => [styles.backToLogin, pressed && styles.pressed]}
            >
              <Text style={[TYPOGRAPHY.label, { color: primary }]}>Back to Login</Text>
            </Pressable>
          </View>
      </KeyboardAwareFormScroll>
    </SafeAreaView>
  );
};

const createStyles = (colors: {
  background: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  surface: string;
}) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg },

    headerRow: { width: '100%', alignItems: 'flex-start', marginBottom: SPACING.sm },

    title: { ...TYPOGRAPHY.pageTitle, color: colors.text, textAlign: 'left', marginTop: SPACING.lg },
    subtitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      textAlign: 'left',
      marginTop: SPACING.sm,
      marginBottom: SPACING.lg,
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: SPACING.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },

    error: { ...TYPOGRAPHY.bodySmall, color: COLORS.semantic.error, marginTop: SPACING.md },
    backToLogin: { marginTop: SPACING.lg, alignItems: 'center' },
    pressed: { opacity: 0.6 },
  });

export default ResetPasswordNewScreen;
