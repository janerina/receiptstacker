import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Modal from 'react-native-modal';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Feather from 'react-native-vector-icons/Feather';
import Clipboard from '@react-native-clipboard/clipboard';

import { Button, Card, Input } from '@/components/common';
import { Header } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { MainStackParamList } from '@/navigation';
import {
  createRecoveryPhrase,
  getLocalAccount,
  updateRecoverySetup,
  type LocalAccount,
} from '@/services/localAuth';

type Props = NativeStackScreenProps<MainStackParamList, 'SecuritySettings'>;

const QUESTION_BANK = [
  'What was the name of your first pet?',
  'What city were you born in?',
  "What is your mother\'s maiden name?",
  'What was the name of your first school?',
  'What is your favorite book?',
] as const;

const digitsOnly = (value: string) => value.replace(/\D/g, '');

const normalizePin = (value: string) => digitsOnly(value).slice(0, 6);

export const SecuritySettingsScreen = ({ navigation }: Props) => {
  const { colors, isDark } = useTheme();
  const primary = COLORS.brand.primary;
  const styles = useMemo(() => createStyles({ colors, primary, isDark }), [colors, isDark, primary]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [account, setAccount] = useState<LocalAccount | null>(null);

  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  const [questionsModalVisible, setQuestionsModalVisible] = useState(false);
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([QUESTION_BANK[0], QUESTION_BANK[1], QUESTION_BANK[2]]);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  const [questionPickerIndex, setQuestionPickerIndex] = useState<number | null>(null);

  const [phraseModalVisible, setPhraseModalVisible] = useState(false);
  const [phrase, setPhrase] = useState('');

  const hydrate = useCallback(async () => {
    try {
      setLoading(true);
      const a = await getLocalAccount();
      setAccount(a);
    } catch (e) {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const email = account?.user.email ?? '';

  const statusPin = account?.recovery.pin ? 'Enabled' : 'Not set';
  const statusQuestions =
    account?.recovery.securityQuestions?.length || account?.recovery.securityAnswer ? 'Enabled' : 'Not set';
  const statusPhrase = account?.recovery.recoveryPhrase ? 'Saved' : 'Not set';

  const openPinModal = useCallback(() => {
    const existing = account?.recovery.pin ?? '';
    setPin(existing);
    setConfirmPin(existing);
    setShowPin(false);
    setShowConfirmPin(false);
    setPinModalVisible(true);
  }, [account?.recovery.pin]);

  const openQuestionsModal = useCallback(() => {
    const existing = account?.recovery.securityQuestions;
    if (existing && existing.length >= 3) {
      setSelectedQuestions(existing.slice(0, 3).map(q => q.question));
      setAnswers(existing.slice(0, 3).map(q => q.answer));
    } else {
      setSelectedQuestions([QUESTION_BANK[0], QUESTION_BANK[1], QUESTION_BANK[2]]);
      setAnswers(['', '', '']);
    }
    setQuestionPickerIndex(null);
    setQuestionsModalVisible(true);
  }, [account?.recovery.securityQuestions]);

  const openPhraseModal = useCallback(() => {
    setPhrase(account?.recovery.recoveryPhrase ?? '');
    setPhraseModalVisible(true);
  }, [account?.recovery.recoveryPhrase]);

  const savePin = useCallback(async () => {
    if (!email) return;

    const p = normalizePin(pin);
    const c = normalizePin(confirmPin);
    if (p.length !== 6 || c.length !== 6) {
      Alert.alert('Invalid PIN', 'Your PIN must be 6 digits.');
      return;
    }
    if (p !== c) {
      Alert.alert('PIN mismatch', 'PIN and confirmation must match.');
      return;
    }

    try {
      setSaving(true);
      const next = await updateRecoverySetup(email, { pin: p });
      setAccount(next);
      setPinModalVisible(false);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save PIN');
    } finally {
      setSaving(false);
    }
  }, [confirmPin, email, pin]);

  const removePin = useCallback(async () => {
    if (!email) return;

    Alert.alert('Remove PIN', 'Are you sure you want to remove your recovery PIN?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);
            const next = await updateRecoverySetup(email, { pin: undefined });
            setAccount(next);
            setPin('');
            setConfirmPin('');
            setPinModalVisible(false);
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to remove PIN');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }, [email]);

  const saveQuestions = useCallback(async () => {
    if (!email) return;

    const normalizedAnswers = answers.map(a => a.trim());
    if (normalizedAnswers.some(a => !a)) {
      Alert.alert('Missing answers', 'Please answer all security questions.');
      return;
    }

    const uniqueCount = new Set(selectedQuestions.map(q => q.trim())).size;
    if (uniqueCount !== selectedQuestions.length) {
      Alert.alert('Duplicate questions', 'Please choose 3 different questions.');
      return;
    }

    try {
      setSaving(true);
      const next = await updateRecoverySetup(email, {
        securityQuestions: selectedQuestions.map((q, idx) => ({
          question: q,
          answer: normalizedAnswers[idx] ?? '',
        })),
      });
      setAccount(next);
      setQuestionsModalVisible(false);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save security questions');
    } finally {
      setSaving(false);
    }
  }, [answers, email, selectedQuestions]);

  const savePhrase = useCallback(async () => {
    if (!email) return;

    const p = phrase.trim();
    if (!p) {
      Alert.alert('Missing phrase', 'Please enter or generate a recovery passphrase.');
      return;
    }

    try {
      setSaving(true);
      const next = await updateRecoverySetup(email, { recoveryPhrase: p });
      setAccount(next);
      setPhraseModalVisible(false);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save passphrase');
    } finally {
      setSaving(false);
    }
  }, [email, phrase]);

  const removePhrase = useCallback(async () => {
    if (!email) return;

    Alert.alert('Remove passphrase', 'Are you sure you want to remove your recovery passphrase?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);
            const next = await updateRecoverySetup(email, { recoveryPhrase: undefined });
            setAccount(next);
            setPhrase('');
            setPhraseModalVisible(false);
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to remove passphrase');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }, [email]);

  const generatePhrase = useCallback(() => {
    setPhrase(createRecoveryPhrase());
  }, []);

  const copyPhrase = useCallback(() => {
    const p = phrase.trim();
    if (!p) return;
    Clipboard.setString(p);
    Alert.alert('Copied', 'Recovery passphrase copied to clipboard.');
  }, [phrase]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header
        title="Security Settings"
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={primary} />
            <Text style={styles.loadingText}>Loading security settings…</Text>
          </View>
        ) : !account ? (
          <Card variant="default" style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No local account found</Text>
            <Text style={styles.emptyBody}>Security settings are available after you create a local account.</Text>
          </Card>
        ) : (
          <>
            <Card variant="default" style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Feather name="shield" size={ICON_SIZES.md} color={primary} />
                </View>
                <View style={styles.infoTextCol}>
                  <Text style={styles.infoTitle}>Recovery methods</Text>
                  <Text style={styles.infoBody}>
                    Keep at least one recovery method enabled so you can regain access if you forget your password.
                  </Text>
                </View>
              </View>
            </Card>

            <Card variant="default" style={styles.sectionCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manage recovery PIN"
                onPress={openPinModal}
                style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
              >
                <View style={styles.rowLeft}>
                  <Feather name="hash" size={ICON_SIZES.sm} color={colors.text} />
                  <View style={styles.rowTextCol}>
                    <Text style={styles.rowTitle}>Recovery PIN</Text>
                    <Text style={styles.rowSubtitle}>{statusPin}</Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />
              </Pressable>

              <View style={styles.divider} />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manage security questions"
                onPress={openQuestionsModal}
                style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
              >
                <View style={styles.rowLeft}>
                  <Feather name="help-circle" size={ICON_SIZES.sm} color={colors.text} />
                  <View style={styles.rowTextCol}>
                    <Text style={styles.rowTitle}>Security Questions</Text>
                    <Text style={styles.rowSubtitle}>{statusQuestions}</Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />
              </Pressable>

              <View style={styles.divider} />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manage recovery passphrase"
                onPress={openPhraseModal}
                style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
              >
                <View style={styles.rowLeft}>
                  <Feather name="key" size={ICON_SIZES.sm} color={colors.text} />
                  <View style={styles.rowTextCol}>
                    <Text style={styles.rowTitle}>Recovery Passphrase</Text>
                    <Text style={styles.rowSubtitle}>{statusPhrase}</Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />
              </Pressable>
            </Card>
          </>
        )}
      </ScrollView>

      {/* PIN Modal */}
      <Modal
        isVisible={pinModalVisible}
        onBackdropPress={() => setPinModalVisible(false)}
        onBackButtonPress={() => setPinModalVisible(false)}
        backdropOpacity={0.4}
        style={styles.modal}
        avoidKeyboard
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Recovery PIN</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setPinModalVisible(false)}
              hitSlop={12}
              style={({ pressed }) => [styles.modalCloseBtn, pressed ? styles.pressed : null]}
            >
              <Feather name="x" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.modalHint}>Use a 6-digit PIN you can remember.</Text>

          <KeyboardAwareScrollView
            enableOnAndroid
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
            enableAutomaticScroll
            extraScrollHeight={Platform.OS === 'android' ? 24 : 16}
            contentContainerStyle={{ paddingBottom: SPACING['3xl'] }}
          >
            <Input
              label="PIN"
              value={pin}
              onChangeText={(t) => setPin(normalizePin(t))}
              keyboardType="numeric"
              secureTextEntry={!showPin}
              leftIcon={<Text style={styles.pinPrefix}>#</Text>}
              rightIcon={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPin ? 'Hide PIN' : 'Show PIN'}
                  onPress={() => setShowPin(v => !v)}
                  hitSlop={10}
                >
                  <Feather name={showPin ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
                </Pressable>
              }
            />

            <View style={{ height: SPACING.md }} />

            <Input
              label="Confirm PIN"
              value={confirmPin}
              onChangeText={(t) => setConfirmPin(normalizePin(t))}
              keyboardType="numeric"
              secureTextEntry={!showConfirmPin}
              leftIcon={<Text style={styles.pinPrefix}>#</Text>}
              rightIcon={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPin ? 'Hide PIN' : 'Show PIN'}
                  onPress={() => setShowConfirmPin(v => !v)}
                  hitSlop={10}
                >
                  <Feather name={showConfirmPin ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
                </Pressable>
              }
            />

            <View style={{ height: SPACING.lg }} />

            <Button
              title={saving ? 'Saving…' : 'Save PIN'}
              onPress={savePin}
              variant="primary"
              fullWidth
              disabled={saving}
              loading={saving}
            />

            {account?.recovery.pin ? <View style={{ height: SPACING.sm }} /> : null}

            {account?.recovery.pin ? (
              <Button
                title="Remove PIN"
                onPress={removePin}
                variant="secondary"
                fullWidth
                disabled={saving}
              />
            ) : null}
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      {/* Security Questions Modal */}
      <Modal
        isVisible={questionsModalVisible}
        onBackdropPress={() => setQuestionsModalVisible(false)}
        onBackButtonPress={() => setQuestionsModalVisible(false)}
        backdropOpacity={0.4}
        style={styles.modal}
        avoidKeyboard
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Security Questions</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setQuestionsModalVisible(false)}
              hitSlop={12}
              style={({ pressed }) => [styles.modalCloseBtn, pressed ? styles.pressed : null]}
            >
              <Feather name="x" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.modalHint}>Choose 3 questions and provide answers you will remember.</Text>

          <KeyboardAwareScrollView
            enableOnAndroid
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
            enableAutomaticScroll
            extraScrollHeight={Platform.OS === 'android' ? 24 : 16}
            contentContainerStyle={{ paddingBottom: SPACING['3xl'] }}
          >
            {[0, 1, 2].map((idx) => (
              <View key={idx} style={styles.qaBlock}>
                <Text style={styles.qaLabel}>Question {idx + 1}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Select question ${idx + 1}`}
                  onPress={() => setQuestionPickerIndex(idx)}
                  style={({ pressed }) => [styles.questionPickerBtn, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.questionPickerText} numberOfLines={2}>
                    {selectedQuestions[idx] ?? ''}
                  </Text>
                  <Feather name="chevron-down" size={ICON_SIZES.md} color={colors.textSecondary} />
                </Pressable>

                <View style={{ height: SPACING.sm }} />
                <Input
                  label="Answer"
                  value={answers[idx] ?? ''}
                  onChangeText={(t) =>
                    setAnswers(prev => {
                      const next = [...prev];
                      next[idx] = t;
                      return next;
                    })
                  }
                  placeholder="Enter your answer"
                />
              </View>
            ))}

            <View style={{ height: SPACING.md }} />
            <Button
              title={saving ? 'Saving…' : 'Save Questions'}
              onPress={saveQuestions}
              variant="primary"
              fullWidth
              disabled={saving}
              loading={saving}
            />
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      {/* Question Picker (simple list) */}
      <Modal
        isVisible={questionPickerIndex != null}
        onBackdropPress={() => setQuestionPickerIndex(null)}
        onBackButtonPress={() => setQuestionPickerIndex(null)}
        backdropOpacity={0.4}
        style={styles.modal}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Select a question</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setQuestionPickerIndex(null)}
              hitSlop={12}
              style={({ pressed }) => [styles.modalCloseBtn, pressed ? styles.pressed : null]}
            >
              <Feather name="x" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {QUESTION_BANK.map((q) => (
              <Pressable
                key={q}
                accessibilityRole="button"
                accessibilityLabel={q}
                onPress={() => {
                  const idx = questionPickerIndex;
                  if (idx == null) return;
                  setSelectedQuestions(prev => {
                    const next = [...prev];
                    next[idx] = q;
                    return next;
                  });
                  setQuestionPickerIndex(null);
                }}
                style={({ pressed }) => [styles.questionRow, pressed ? styles.pressed : null]}
              >
                <Text style={styles.questionRowText}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Passphrase Modal */}
      <Modal
        isVisible={phraseModalVisible}
        onBackdropPress={() => setPhraseModalVisible(false)}
        onBackButtonPress={() => setPhraseModalVisible(false)}
        backdropOpacity={0.4}
        style={styles.modal}
        avoidKeyboard
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Recovery Passphrase</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setPhraseModalVisible(false)}
              hitSlop={12}
              style={({ pressed }) => [styles.modalCloseBtn, pressed ? styles.pressed : null]}
            >
              <Feather name="x" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.modalHint}>Store this phrase in a safe place. You may need it to recover your account.</Text>


          <KeyboardAwareScrollView
            enableOnAndroid
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
            enableAutomaticScroll
            extraScrollHeight={Platform.OS === 'android' ? 24 : 16}
            contentContainerStyle={{ paddingBottom: SPACING['3xl'] }}
          >
            <Input
              label="Passphrase"
              value={phrase}
              onChangeText={setPhrase}
              placeholder="RS-ABCD-EFGH-IJKL-MNOP"
            />

            <View style={styles.phraseActionsRow}>
              <Button title="Generate" onPress={generatePhrase} variant="secondary" size="sm" />
              <Button title="Copy" onPress={copyPhrase} variant="secondary" size="sm" disabled={!phrase.trim()} />
            </View>

            <View style={{ height: SPACING.lg }} />

            <Button
              title={saving ? 'Saving…' : 'Save Passphrase'}
              onPress={savePhrase}
              variant="primary"
              fullWidth
              disabled={saving}
              loading={saving}
            />

            {account?.recovery.recoveryPhrase ? <View style={{ height: SPACING.sm }} /> : null}

            {account?.recovery.recoveryPhrase ? (
              <Button
                title="Remove Passphrase"
                onPress={removePhrase}
                variant="secondary"
                fullWidth
                disabled={saving}
              />
            ) : null}
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
  primary,
  isDark,
}: {
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
    border: string;
  };
  primary: string;
  isDark: boolean;
}) => {
  const title: TextStyle = { ...TYPOGRAPHY.sectionHeading, color: colors.text };
  const subtitle: TextStyle = { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING['2xl'],
    },

    loadingWrap: {
      paddingTop: SPACING.xl,
      alignItems: 'center',
    },
    loadingText: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginTop: SPACING.sm,
    },

    emptyCard: {
      marginTop: SPACING.lg,
      padding: SPACING.lg,
    },
    emptyTitle: {
      ...title,
    },
    emptyBody: {
      ...subtitle,
      marginTop: SPACING.sm,
    },

    infoCard: {
      marginTop: SPACING.lg,
      padding: SPACING.lg,
      borderRadius: 24,
    },
    infoRow: {
      flexDirection: 'row',
      gap: SPACING.md,
    },
    infoIcon: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `rgba(0,0,0,${isDark ? 0.18 : 0.04})`,
    },
    infoTextCol: {
      flex: 1,
    },
    infoTitle: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
    },
    infoBody: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginTop: 4,
      lineHeight: 18,
    },

    sectionCard: {
      marginTop: SPACING.md,
      borderRadius: 24,
      overflow: 'hidden',
    },

    row: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      flex: 1,
      paddingRight: SPACING.md,
    },
    rowTextCol: {
      flex: 1,
      minWidth: 0,
    },
    rowTitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '700',
    },
    rowSubtitle: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },

    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: SPACING.lg,
      marginRight: SPACING.lg,
    },

    pressed: {
      opacity: 0.8,
    },

    modal: {
      margin: 0,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: SPACING.lg,
      maxHeight: '88%',
    } as ViewStyle,
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    modalTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
    },
    modalCloseBtn: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `rgba(0,0,0,${isDark ? 0.25 : 0.05})`,
    },
    modalHint: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginBottom: SPACING.md,
      lineHeight: 18,
    },

    pinPrefix: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.textSecondary,
      fontWeight: '700',
      paddingHorizontal: SPACING.xs,
    },

    qaBlock: {
      marginBottom: SPACING.lg,
    },
    qaLabel: {
      ...TYPOGRAPHY.label,
      color: colors.textSecondary,
      marginBottom: SPACING.xs,
    },
    questionPickerBtn: {
      borderRadius: 16,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
    },
    questionPickerText: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      flex: 1,
    },
    questionRow: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      borderRadius: 14,
      backgroundColor: `rgba(0,0,0,${isDark ? 0.25 : 0.03})`,
      marginBottom: SPACING.sm,
    },
    questionRowText: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      lineHeight: 18,
    },

    phraseActionsRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginTop: SPACING.md,
    },
  });
};

export default SecuritySettingsScreen;
