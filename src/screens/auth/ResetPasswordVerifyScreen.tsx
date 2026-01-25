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
import { COLORS, ICON_SIZES, SPACING, TYPOGRAPHY } from '@/constants';
import type { AuthStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import {
  getAccountForEmail,
  verifyRecoveryAnswer,
  verifyRecoveryAnswers,
  verifyRecoveryPhrase,
  verifyRecoveryPin,
} from '@/services/localAuth';

export type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPasswordVerify'>;

type Method = 'pin' | 'securityQuestions' | 'passphrase';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ResetPasswordVerifyScreen = ({ navigation, route }: Props) => {
  const { colors, isDark, toggleTheme } = useTheme();
  const primary = COLORS.brand.primary;

  const { email, method } = route.params as { email: string; method: Method };

  const [pin, setPin] = useState('');
  const [answer, setAnswer] = useState('');
  const [phrase, setPhrase] = useState('');
  const [question, setQuestion] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Array<{ question: string; answer: string }>>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [pinLength, setPinLength] = useState(6);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (!emailRegex.test(email)) return;
        const account = await getAccountForEmail(email);
        if (cancelled) return;

        const multi = account?.recovery.securityQuestions;
        if (multi && multi.length > 0) {
          const normalized = multi
            .filter((q) => Boolean(q?.question))
            .slice(0, 3)
            .map((q) => ({ question: q.question, answer: q.answer }));

          setQuestions(normalized);
          setAnswers((prev) => {
            const next = normalized.map((_, idx) => prev[idx] ?? '');
            return next;
          });

          setQuestion(normalized[0]?.question ?? null);
        } else {
          setQuestion(account?.recovery.securityQuestion ?? null);
          setQuestions([]);
          setAnswers([]);
        }

        const savedPin = account?.recovery.pin;
        if (savedPin && savedPin.length === 4) setPinLength(4);
        if (savedPin && savedPin.length === 6) setPinLength(6);
      } catch {
        // ignore
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [email]);

  const handleVerify = async () => {
    setError('');

    try {
      setLoading(true);

      if (!emailRegex.test(email)) {
        throw new Error('Please enter a valid email');
      }

      if (method === 'pin') {
        const normalized = pin.replace(/\D/g, '').slice(0, pinLength);
        if (normalized.length !== pinLength) {
          throw new Error(`Enter your ${pinLength}-digit PIN`);
        }
        await verifyRecoveryPin(email, normalized);
      }

      if (method === 'securityQuestions') {
        if (questions.length > 1) {
          await verifyRecoveryAnswers(
            email,
            questions.map((q, idx) => ({ question: q.question, answer: answers[idx] ?? '' })),
          );
        } else {
          if (!answer.trim()) throw new Error('Please enter your answer');
          await verifyRecoveryAnswer(email, answer);
        }
      }

      if (method === 'passphrase') {
        if (!phrase.trim()) throw new Error('Please enter your recovery passphrase');
        await verifyRecoveryPhrase(email, phrase);
      }

      navigation.navigate('ResetPasswordNew', { email });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const title = method === 'pin' ? 'Verify Identity' : method === 'securityQuestions' ? 'Verify Identity' : 'Verify Identity';
  const subtitle =
    method === 'pin'
      ? `Enter your ${pinLength}-digit Security PIN`
      : method === 'securityQuestions'
        ? 'Answer your security question'
        : 'Enter your recovery passphrase';

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

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.card}>
            {method === 'pin' ? (
              <Input
                label="Security PIN"
                placeholder={`Enter ${pinLength}-digit PIN`}
                value={pin}
                onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, pinLength))}
                keyboardType="number-pad"
                leftIcon={<Feather name="hash" size={ICON_SIZES.sm} color={colors.textTertiary} />}
                accessibilityLabel="Security PIN"
              />
            ) : null}

            {method === 'securityQuestions' ? (
              <>
                  {questions.length > 1 ? (
                    <>
                      {questions.map((q, idx) => (
                        <View key={`${idx}-${q.question}`} style={idx === 0 ? undefined : { marginTop: SPACING.lg }}>
                          <Text style={[TYPOGRAPHY.label, { color: colors.text, marginBottom: SPACING.xs }]}>
                            Question {idx + 1}
                          </Text>
                          <Text
                            style={[
                              TYPOGRAPHY.bodyNormal,
                              { color: colors.textSecondary, fontStyle: 'italic', marginBottom: SPACING.sm },
                            ]}
                          >
                            {q.question}
                          </Text>
                          <Input
                            label=""
                            placeholder="Your answer"
                            value={answers[idx] ?? ''}
                            onChangeText={(t) =>
                              setAnswers((prev) => {
                                const next = [...prev];
                                next[idx] = t;
                                return next;
                              })
                            }
                            accessibilityLabel={`Security answer ${idx + 1}`}
                          />
                        </View>
                      ))}

                      <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary, marginTop: SPACING.md }]}>
                        All answers must match exactly
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={[TYPOGRAPHY.label, { color: colors.text, marginBottom: SPACING.xs }]}>Question</Text>
                      <View style={styles.questionBox}>
                        <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary }]}>
                          {question ?? 'Answer your security question'}
                        </Text>
                      </View>
                      <View style={{ marginTop: SPACING.md }}>
                        <Input
                          label="Your Answer"
                          placeholder="Enter your answer"
                          value={answer}
                          onChangeText={setAnswer}
                          leftIcon={<Feather name="help-circle" size={ICON_SIZES.sm} color={colors.textTertiary} />}
                          accessibilityLabel="Security answer"
                        />
                      </View>
                    </>
                  )}
              </>
            ) : null}

            {method === 'passphrase' ? (
              <Input
                label="Recovery Passphrase"
                placeholder="Enter your recovery passphrase"
                value={phrase}
                onChangeText={setPhrase}
                autoCapitalize="characters"
                leftIcon={<Feather name="key" size={ICON_SIZES.sm} color={colors.textTertiary} />}
                accessibilityLabel="Recovery passphrase"
              />
            ) : null}

            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            <View style={{ marginTop: SPACING.lg }}>
              <Button
                title="Continue"
                onPress={handleVerify}
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                disabled={loading}
                accessibilityLabel="Continue"
              />
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try different method"
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.tryOther, pressed && styles.pressed]}
          >
            <Text style={[TYPOGRAPHY.label, { color: primary }]}>Try Different Method</Text>
          </Pressable>
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
}) => {
  const primary = COLORS.brand.primary;

  return StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg },

    topBar: { width: '100%', alignItems: 'flex-end', marginBottom: SPACING.sm },

    backRow: { flexDirection: 'row', alignItems: 'center' },

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

    questionBox: {
      padding: SPACING.md,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.03)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },

    error: { ...TYPOGRAPHY.bodySmall, color: COLORS.semantic.error, marginTop: SPACING.md },

    tryOther: { marginTop: SPACING.xl, alignItems: 'center' },

    pressed: { opacity: 0.6 },
  });
};

export default ResetPasswordVerifyScreen;
