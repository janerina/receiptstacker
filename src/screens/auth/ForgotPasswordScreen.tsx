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

import { ActivityIndicator } from 'react-native';

import { Button, Card, IconButton } from '@/components/common';
import { COLORS, ICON_SIZES, SPACING, TYPOGRAPHY } from '@/constants';
import type { AuthStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { getLocalAccount } from '@/services/localAuth';

export type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;
type RecoveryMethod = 'pin' | 'securityQuestions' | 'passphrase';

export const ForgotPasswordScreen = ({ navigation }: Props) => {
  const { colors, isDark, toggleTheme } = useTheme();
  const primary = COLORS.brand.primary;

  const [email, setEmail] = useState<string | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [error, setError] = useState('');

  const [availablePin, setAvailablePin] = useState(false);
  const [availableSecurity, setAvailableSecurity] = useState(false);
  const [availablePassphrase, setAvailablePassphrase] = useState(false);

  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const account = await getLocalAccount();
        if (cancelled) return;

        setEmail(account?.user.email ?? null);

        const hasPin = Boolean(account?.recovery.pin);
        const hasSecurity = Boolean(
          (account?.recovery.securityQuestions && account.recovery.securityQuestions.length > 0) ||
            account?.recovery.securityAnswer,
        );
        const hasPassphrase = Boolean(account?.recovery.recoveryPhrase);

        setAvailablePin(hasPin);
        setAvailableSecurity(hasSecurity);
        setAvailablePassphrase(hasPassphrase);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingAccount(false);
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const goVerify = (method: RecoveryMethod) => {
    setError('');
    if (!email) {
      setError('No local account found. Please create an account first.');
      return;
    }
    navigation.navigate('ResetPasswordVerify', { email, method });
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
          <View style={styles.topBar}>
            <IconButton
              accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onPress={toggleTheme}
              icon={<Feather name={isDark ? 'sun' : 'moon'} size={ICON_SIZES.md} color={colors.text} />}
            />
          </View>

          <View style={styles.headerRow}>
            <IconButton
              variant="ghost"
              size="md"
              icon={<Feather name="chevron-left" size={ICON_SIZES.md} color={colors.text} />}
              onPress={() => navigation.navigate('Login')}
              accessibilityLabel="Back to Login"
            />
          </View>

          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.description}>Choose a recovery method to verify your identity.</Text>

          {email ? (
            <Text style={styles.emailText}>Account: {email}</Text>
          ) : null}

          {loadingAccount ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={primary} />
              <Text style={styles.loadingText}>Loading account…</Text>
            </View>
          ) : null}

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <View style={styles.methods}>
            <Card
              onPress={() => goVerify('pin')}
              accessibilityLabel="Use Security PIN"
              style={styles.methodCard}
            >
              <View style={styles.methodRow}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(0,0,0,0.06)' }]}>
                  <Feather name="hash" size={ICON_SIZES.md} color={primary} />
                </View>
                <View style={styles.methodText}>
                  <Text style={styles.methodTitle}>Security PIN</Text>
                  <Text style={styles.methodSubtitle}>Verify using your PIN</Text>
                </View>
                <Text
                  style={[
                    styles.methodStatus,
                    { color: availablePin ? COLORS.semantic.success : colors.textTertiary },
                  ]}
                >
                  {availablePin ? 'Available' : 'Not set up'}
                </Text>
              </View>
            </Card>

            <Card
              onPress={() => goVerify('securityQuestions')}
              accessibilityLabel="Use Security Questions"
              style={styles.methodCard}
            >
              <View style={styles.methodRow}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(0,0,0,0.06)' }]}>
                  <Feather name="help-circle" size={ICON_SIZES.md} color={primary} />
                </View>
                <View style={styles.methodText}>
                  <Text style={styles.methodTitle}>Security Questions</Text>
                  <Text style={styles.methodSubtitle}>Answer your security question</Text>
                </View>
                <Text
                  style={[
                    styles.methodStatus,
                    { color: availableSecurity ? COLORS.semantic.success : colors.textTertiary },
                  ]}
                >
                  {availableSecurity ? 'Available' : 'Not set up'}
                </Text>
              </View>
            </Card>

            <Card
              onPress={() => goVerify('passphrase')}
              accessibilityLabel="Use Recovery Passphrase"
              style={[styles.methodCard, styles.methodCardLast]}
            >
              <View style={styles.methodRow}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(0,0,0,0.06)' }]}>
                  <Feather name="key" size={ICON_SIZES.md} color={primary} />
                </View>
                <View style={styles.methodText}>
                  <Text style={styles.methodTitle}>Recovery Passphrase</Text>
                  <Text style={styles.methodSubtitle}>Enter your recovery phrase</Text>
                </View>
                <Text
                  style={[
                    styles.methodStatus,
                    { color: availablePassphrase ? COLORS.semantic.success : colors.textTertiary },
                  ]}
                >
                  {availablePassphrase ? 'Available' : 'Not set up'}
                </Text>
              </View>
            </Card>
          </View>

          {!email && !loadingAccount ? (
            <View style={styles.createAccountWrap}>
              <Button
                title="Create Account"
                onPress={() => navigation.navigate('SignUp')}
                variant="primary"
                size="lg"
                fullWidth
                accessibilityLabel="Create Account"
              />
            </View>
          ) : null}
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
  surface: string;
}) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      flexGrow: 1,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
    },
    topBar: { width: '100%', alignItems: 'flex-end', marginBottom: SPACING.sm },
    headerRow: {
      width: '100%',
      alignItems: 'flex-start',
    },
    title: {
      ...TYPOGRAPHY.pageTitle,
      color: colors.text,
      textAlign: 'left',
      marginTop: SPACING.lg,
      marginBottom: SPACING.md,
    },
    description: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      textAlign: 'left',
      marginBottom: SPACING.xl,
    },
    emailText: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginBottom: SPACING.lg },

    loadingWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
    loadingText: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginLeft: SPACING.sm },

    error: { ...TYPOGRAPHY.bodySmall, color: COLORS.semantic.error, marginBottom: SPACING.lg },

    methods: {},
    methodCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: SPACING.md,
    },
    methodCardLast: { marginBottom: 0 },
    methodRow: { flexDirection: 'row', alignItems: 'center' },
    iconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: SPACING.md,
    },
    methodText: { flex: 1 },
    methodTitle: { ...TYPOGRAPHY.cardTitle, color: colors.text },
    methodSubtitle: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: 2 },
    methodStatus: { ...TYPOGRAPHY.caption, marginLeft: SPACING.sm },

    createAccountWrap: { marginTop: SPACING.xl },
    pressed: { opacity: 0.6 },
  });
