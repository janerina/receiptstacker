import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
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
import { hexToRgba } from '@/utils/color';

export type Props = NativeStackScreenProps<AuthStackParamList, 'SecuritySetup'>;

type Method = 'pin' | 'securityQuestions' | 'passphrase';

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

const QUESTION_BANK = [
  'What was the name of your first pet?',
  'What city were you born in?',
  "What is your mother\'s maiden name?",
  'What was the name of your first school?',
  'What is your favorite book?',
] as const;

export const SecuritySetupScreen = ({ navigation }: Props) => {
  const { colors, isDark, toggleTheme } = useTheme();
  const primary = COLORS.brand.primary;

  const scrollRef = useRef<any>(null);

  const [pending, setPending] = useState<PendingSignUp | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // PIN setup
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  // Security questions setup
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([
    QUESTION_BANK[0],
    QUESTION_BANK[1],
    QUESTION_BANK[2],
  ]);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  const [questionPickerIndex, setQuestionPickerIndex] = useState<number | null>(null);

  // Passphrase setup
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');

  const styles = useMemo(() => createStyles({ colors, isDark, primary }), [colors, isDark, primary]);

  const normalizedPin = pin.replace(/\D/g, '').slice(0, 6);
  const normalizedConfirmPin = confirmPin.replace(/\D/g, '').slice(0, 6);
  const pinsMatch = normalizedPin.length > 0 && normalizedConfirmPin.length > 0 && normalizedPin === normalizedConfirmPin;
  const pinsMismatch = normalizedPin.length > 0 && normalizedConfirmPin.length > 0 && normalizedPin !== normalizedConfirmPin;

  const scrollToY = (y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - SPACING.lg), animated: true });
  };

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(PENDING_SIGNUP_KEY);
        const parsed = raw ? (JSON.parse(raw) as PendingSignUp) : null;
        if (cancelled) return;
        setPending(parsed);
      } catch {
        if (!cancelled) setPending(null);
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const canContinue = useMemo(() => {
    if (!pending) return false;
    if (!method) return false;

    if (method === 'pin') {
      const p = pin.replace(/\D/g, '').slice(0, 6);
      const c = confirmPin.replace(/\D/g, '').slice(0, 6);
      return p.length === 6 && c.length === 6 && p === c;
    }

    if (method === 'securityQuestions') {
      return answers.every((a) => a.trim().length > 0);
    }

    const p = passphrase.trim();
    const c = confirmPassphrase.trim();
    return p.length > 0 && c.length > 0 && p === c;
  }, [answers, confirmPassphrase, confirmPin, method, passphrase, pending, pin]);

  const handleContinue = async () => {
    setError('');

    if (!pending) {
      setError('Missing signup information. Please go back and create your account again.');
      return;
    }
    if (!method) {
      setError('Please choose a recovery method.');
      return;
    }

    try {
      setLoading(true);

      const recovery =
        method === 'pin'
          ? { pin: pin.replace(/\D/g, '').slice(0, 6) }
          : method === 'securityQuestions'
            ? {
                securityQuestions: selectedQuestions.map((q, idx) => ({
                  question: q,
                  answer: (answers[idx] ?? '').trim(),
                })),
              }
            : { recoveryPhrase: passphrase.trim() };

      await AsyncStorage.setItem(
        PENDING_SIGNUP_KEY,
        JSON.stringify({
          ...pending,
          email: pending.email.trim().toLowerCase(),
          recovery,
        } satisfies PendingSignUp),
      );

      // Let the user complete the Biometric step before creating a local account/session.
      navigation.navigate('BiometricSetup', { email: pending.email.trim().toLowerCase() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const Option = ({
    value,
    title,
    subtitle,
    icon,
  }: {
    value: Method;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
  }) => {
    const selected = method === value;

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={() => {
          setError('');
          setMethod(value);
        }}
        style={({ pressed }) => [
          styles.option,
          selected ? styles.optionSelected : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <View style={styles.optionRow}
        >
          <View style={styles.radioOuter}>{selected ? <View style={styles.radioInner} /> : null}</View>
          <View style={styles.optionIcon}>{icon}</View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>{title}</Text>
            <Text style={styles.optionSubtitle}>{subtitle}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const QuestionPickerModal = ({
    index,
    visible,
    onClose,
  }: {
    index: number;
    visible: boolean;
    onClose: () => void;
  }) => {
    const current = selectedQuestions[index];
    const selectedByOthers = selectedQuestions.filter((_, i) => i !== index);
    const options = QUESTION_BANK.filter((q) => q === current || !selectedByOthers.includes(q));

    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityLabel="Close question picker" />
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[TYPOGRAPHY.cardTitle, { color: colors.text }]}>Select a question</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                hitSlop={SPACING.sm}
                style={({ pressed }) => (pressed ? styles.pressed : null)}
              >
                <Feather name="x" size={ICON_SIZES.md} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {options.map((q) => (
                <Pressable
                  key={q}
                  accessibilityRole="button"
                  accessibilityLabel={q}
                  onPress={() => {
                    setSelectedQuestions((prev) => {
                      const next = [...prev];
                      next[index] = q;
                      return next;
                    });
                    onClose();
                  }}
                  style={({ pressed }) => [styles.modalOption, pressed ? styles.pressed : null]}
                >
                  <Text style={[TYPOGRAPHY.bodyNormal, { color: colors.text }]}>{q}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAwareFormScroll
        scrollRef={scrollRef}
        contentContainerStyle={styles.content}
      >
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

          <Text style={styles.title}>Security Setup</Text>
          <Text style={styles.subtitle}>Set up account recovery (offline only)</Text>

          <View style={styles.stepsRow}>
            <View style={[styles.stepPill, styles.stepActive]} />
            <View style={[styles.stepPill, styles.stepActive]} />
            <View style={styles.stepPill} />
            <View style={styles.stepPill} />
          </View>

          <View style={styles.callout}>
            <View style={styles.calloutRow}>
              <View style={styles.calloutIcon}>
                <Feather name="help-circle" size={ICON_SIZES.sm} color={primary} />
              </View>
              <View style={styles.calloutText}>
                <Text style={styles.calloutTitle}>Offline Account Recovery</Text>
                <Text style={styles.calloutBody}>
                  Choose a method to recover your account locally without email. This data stays on your device.
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>
            Choose Recovery Method <Text style={styles.sectionRequired}>(at least 1 required)</Text>
          </Text>

          <Option
            value="pin"
            title="Security PIN"
            subtitle="6-digit PIN for quick recovery"
            icon={<Feather name="hash" size={ICON_SIZES.md} color={primary} />}
          />
          <Option
            value="securityQuestions"
            title="Security Questions"
            subtitle="Answer 3 personal questions"
            icon={<Feather name="help-circle" size={ICON_SIZES.md} color={primary} />}
          />
          <Option
            value="passphrase"
            title="Recovery Passphrase"
            subtitle="Memorable phrase for recovery"
            icon={<Feather name="key" size={ICON_SIZES.md} color={primary} />}
          />

          {method === 'pin' ? (
            <View
              style={styles.methodDetail}
              onLayout={(e) => {
                const y = e.nativeEvent.layout.y;
                setTimeout(() => scrollToY(y), 50);
              }}
            >
              <Input
                label="Create 6-Digit PIN"
                placeholder="Enter 6-digit PIN"
                value={pin}
                onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry={!showPin}
                leftIcon={<Feather name="hash" size={ICON_SIZES.sm} color={colors.textTertiary} />}
                rightIcon={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPin ? 'Hide PIN' : 'Show PIN'}
                    onPress={() => setShowPin((v) => !v)}
                    hitSlop={SPACING.sm}
                    style={({ pressed }) => (pressed ? styles.pressed : null)}
                  >
                    <Feather name={showPin ? 'eye-off' : 'eye'} size={ICON_SIZES.sm} color={colors.textTertiary} />
                  </Pressable>
                }
                accessibilityLabel="Security PIN"
              />
              <View style={{ marginTop: SPACING.md }}>
                <Input
                  label="Confirm PIN"
                  placeholder="Re-enter PIN"
                  value={confirmPin}
                  onChangeText={(t) => setConfirmPin(t.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  secureTextEntry={!showConfirmPin}
                  leftIcon={<Feather name="hash" size={ICON_SIZES.sm} color={colors.textTertiary} />}
                  rightIcon={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={showConfirmPin ? 'Hide PIN confirmation' : 'Show PIN confirmation'}
                      onPress={() => setShowConfirmPin((v) => !v)}
                      hitSlop={SPACING.sm}
                      style={({ pressed }) => (pressed ? styles.pressed : null)}
                    >
                      <Feather
                        name={showConfirmPin ? 'eye-off' : 'eye'}
                        size={ICON_SIZES.sm}
                        color={colors.textTertiary}
                      />
                    </Pressable>
                  }
                  accessibilityLabel="Confirm Security PIN"
                />

                {pinsMatch ? (
                  <View style={styles.okRow}>
                    <Feather name="check" size={16} color={COLORS.semantic.success} />
                    <Text style={styles.okText}>PINs match</Text>
                  </View>
                ) : pinsMismatch ? (
                  <View style={styles.mismatchRow}>
                    <Feather name="x" size={16} color={COLORS.semantic.error} />
                    <Text style={styles.mismatchText}>PINs do not match</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {method === 'securityQuestions' ? (
            <View
              style={styles.methodDetail}
              onLayout={(e) => {
                const y = e.nativeEvent.layout.y;
                setTimeout(() => scrollToY(y), 50);
              }}
            >
              {Array.from({ length: 3 }).map((_, idx) => (
                <View key={idx} style={idx === 0 ? undefined : { marginTop: SPACING.lg }}>
                  <Text style={styles.questionLabel}>Question {idx + 1}</Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Select question ${idx + 1}`}
                    onPress={() => {
                      setError('');
                      setQuestionPickerIndex(idx);
                    }}
                    style={({ pressed }) => [styles.selectField, pressed ? styles.pressed : null]}
                  >
                    <Text style={[styles.selectText, { color: colors.text }]} numberOfLines={2}>
                      {selectedQuestions[idx]}
                    </Text>
                    <Feather name="chevron-down" size={ICON_SIZES.sm} color={colors.textTertiary} />
                  </Pressable>

                  <View style={{ marginTop: SPACING.md }}>
                    <Input
                      placeholder="Your answer"
                      value={answers[idx] ?? ''}
                      onChangeText={(t) =>
                        setAnswers((prev) => {
                          const next = [...prev];
                          next[idx] = t;
                          return next;
                        })
                      }
                      accessibilityLabel={`Answer ${idx + 1}`}
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {method === 'passphrase' ? (
            <View
              style={styles.methodDetail}
              onLayout={(e) => {
                const y = e.nativeEvent.layout.y;
                setTimeout(() => scrollToY(y), 50);
              }}
            >
              <Input
                label="Recovery Passphrase"
                placeholder="Enter a memorable phrase"
                value={passphrase}
                onChangeText={(t) => setPassphrase(t)}
                autoCapitalize="sentences"
                accessibilityLabel="Recovery Passphrase"
              />
              <Text style={styles.exampleText}>
                Example: "My favorite coffee shop in Paris 2020"
              </Text>

              <View style={{ marginTop: SPACING.lg }}>
                <Input
                  label="Confirm Passphrase"
                  placeholder="Re-enter your passphrase"
                  value={confirmPassphrase}
                  onChangeText={(t) => setConfirmPassphrase(t)}
                  autoCapitalize="sentences"
                  accessibilityLabel="Confirm Recovery Passphrase"
                />
              </View>
            </View>
          ) : null}

          {questionPickerIndex !== null ? (
            <QuestionPickerModal
              index={questionPickerIndex}
              visible={questionPickerIndex !== null}
              onClose={() => setQuestionPickerIndex(null)}
            />
          ) : null}

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <View style={{ marginTop: SPACING.xl }}>
            <Button
              title="Continue to Biometric Setup"
              onPress={handleContinue}
              variant="primary"
              size="lg"
              fullWidth
              disabled={!canContinue || loading || !pending}
              loading={loading}
              accessibilityLabel="Continue to Biometric Setup"
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backLink, pressed ? styles.pressed : null]}
          >
            <Text style={[TYPOGRAPHY.label, { color: colors.textSecondary }]}>Back</Text>
          </Pressable>
      </KeyboardAwareFormScroll>
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

    topBar: { width: '100%', alignItems: 'flex-end', marginBottom: SPACING.sm },

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
      marginBottom: SPACING.xl,
    },
    stepPill: {
      width: 62,
      height: 10,
      borderRadius: 6,
      backgroundColor: 'rgba(100,116,139,0.14)',
    },
    stepActive: { backgroundColor: primary },

    callout: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hexToRgba(primary, isDark ? 0.28 : 0.3),
      backgroundColor: hexToRgba(primary, isDark ? 0.1 : 0.08),
      padding: SPACING.lg,
      marginBottom: SPACING.xl,
    },
    calloutRow: { flexDirection: 'row', alignItems: 'flex-start' },
    calloutIcon: { marginRight: SPACING.md, marginTop: 2 },
    calloutText: { flex: 1 },
    calloutTitle: { ...TYPOGRAPHY.cardTitle, color: colors.text, marginBottom: 2 },
    calloutBody: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },

    sectionTitle: { ...TYPOGRAPHY.label, color: colors.text, marginBottom: SPACING.md },
    sectionRequired: { color: COLORS.semantic.error },

    okRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm },
    okText: { ...TYPOGRAPHY.bodySmall, color: COLORS.semantic.success, marginLeft: SPACING.sm },

    mismatchRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm },
    mismatchText: { ...TYPOGRAPHY.bodySmall, color: COLORS.semantic.error, marginLeft: SPACING.sm },

    option: {
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: SPACING.lg,
      marginBottom: SPACING.md,
    },
    optionSelected: { borderColor: primary },
    optionRow: { flexDirection: 'row', alignItems: 'center' },
    radioOuter: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.textTertiary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: SPACING.md,
    },
    radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: primary },
    optionIcon: { marginRight: SPACING.md },
    optionText: { flex: 1 },
    optionTitle: { ...TYPOGRAPHY.cardTitle, color: colors.text },
    optionSubtitle: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: 2 },

    methodDetail: {
      marginTop: SPACING.sm,
      marginBottom: SPACING.lg,
    },

    questionLabel: { ...TYPOGRAPHY.label, color: colors.text, marginBottom: SPACING.xs },
    selectField: {
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: SPACING.lg,
      paddingVertical: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    selectText: { ...TYPOGRAPHY.bodyNormal, flex: 1, marginRight: SPACING.md },

    exampleText: { ...TYPOGRAPHY.caption, color: colors.textSecondary, marginTop: SPACING.sm },

    modalBackdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    modalCard: {
      width: '100%',
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      padding: SPACING.lg,
      maxHeight: 420,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    modalOption: {
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },

    error: { ...TYPOGRAPHY.bodySmall, color: COLORS.semantic.error, marginTop: SPACING.sm },

    backLink: { alignItems: 'center', marginTop: SPACING.xl },
    pressed: { opacity: 0.65 },
  });
};

export default SecuritySetupScreen;
