import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';

import { Button, Card, Chip, IconButton, Input } from '@/components/common';
import { Header, LoadingOverlay } from '@/components/compositions';
import { CategoryPickerModal, type CategoryOption } from '@/components/modals/CategoryPickerModal';
import { DatePickerModal } from '@/components/modals/DatePickerModal';
import { OptionPickerModal, type OptionItem } from '@/components/modals/OptionPickerModal';
import { COLORS, GRADIENTS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrency, formatDate } from '@/utils/format';
import { upsertReceipt } from '@/utils/receiptStore';

type Props = NativeStackScreenProps<MainStackParamList, 'AddManually'>;

const DEFAULT_CATEGORIES: CategoryOption[] = [
  { id: 'food', name: 'Food & Dining', color: '#10b981' },
  { id: 'groceries', name: 'Groceries', color: '#22c55e' },
  { id: 'transport', name: 'Transport', color: '#3b82f6' },
  { id: 'shopping', name: 'Shopping', color: '#a855f7' },
  { id: 'health', name: 'Health', color: '#ef4444' },
  { id: 'misc', name: 'Misc', color: '#f59e0b' },
];

const PAYMENT_METHODS: OptionItem[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'credit', label: 'Credit Card' },
  { id: 'debit', label: 'Debit Card' },
  { id: 'mobile', label: 'Mobile Payment' },
  { id: 'other', label: 'Other' },
];

const TAG_SUGGESTIONS = ['Business', 'Coffee', 'Travel', 'Meals', 'Client', 'Personal', 'Tax', 'Supplies'] as const;

const toDate = (value: Date | string | undefined): Date => {
  if (!value) return new Date();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const parseAmount = (text: string): number => {
  const normalized = text.replace(/[^0-9.]/g, '');
  if (!normalized) return 0;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
};

const formatAmountText = (value: string) => {
  // Keep it friendly while typing: digits + at most one dot
  const cleaned = value.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
};

const pickBestImageUri = (asset?: Asset | null) => {
  if (!asset) return '';
  return asset.uri ?? '';
};

export const AddManuallyScreen = ({ navigation, route }: Props) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;

  const extracted = route.params?.extractedData;

  const [merchant, setMerchant] = useState('');
  const [amountText, setAmountText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption | null>(null);
  const [date, setDate] = useState<Date>(new Date());
  const [paymentMethod, setPaymentMethod] = useState<OptionItem | null>(null);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [imageUri, setImageUri] = useState<string>('');

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);

  const [errors, setErrors] = useState<{ merchant?: string; amount?: string; category?: string }>({});
  const [saving, setSaving] = useState(false);

  const [showSuccess, setShowSuccess] = useState(false);
  const lastSavedReceiptId = useRef<string | null>(null);
  const successTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

  useEffect(() => {
    // Pre-fill from OCR results (if any)
    if (!extracted) return;

    if (typeof extracted.merchant === 'string') setMerchant(extracted.merchant);
    if (typeof extracted.amount === 'string') setAmountText(formatAmountText(extracted.amount));
    if (typeof extracted.date === 'string' && extracted.date.trim()) setDate(toDate(extracted.date));
    if (typeof extracted.imageUri === 'string') setImageUri(extracted.imageUri);
  }, [extracted]);

  useEffect(() => {
    return () => {
      if (successTimeout.current) clearTimeout(successTimeout.current);
    };
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setTags(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag].sort()));
  }, []);

  const validate = useCallback(() => {
    const next: typeof errors = {};

    const m = merchant.trim();
    const amount = parseAmount(amountText);

    if (m.length < 2) next.merchant = 'Merchant is required (min 2 characters).';
    if (!(amount > 0)) next.amount = 'Amount is required and must be greater than 0.';
    if (!selectedCategory) next.category = 'Category is required.';

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [amountText, errors, merchant, selectedCategory]);

  const onPickPhoto = useCallback(() => {
    Alert.alert('Add Photo', 'Choose a source', [
      {
        text: 'Camera',
        onPress: async () => {
          try {
            const result = await launchCamera({
              mediaType: 'photo',
              quality: 0.8,
              includeBase64: false,
              saveToPhotos: false,
            });

            if (result.didCancel) return;
            const uri = pickBestImageUri(result.assets?.[0]);
            if (uri) setImageUri(uri);
          } catch {
            Alert.alert('Error', 'Failed to open camera.');
          }
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          try {
            const result = await launchImageLibrary({
              mediaType: 'photo',
              quality: 0.8,
              selectionLimit: 1,
            });

            if (result.didCancel) return;
            const uri = pickBestImageUri(result.assets?.[0]);
            if (uri) setImageUri(uri);
          } catch {
            Alert.alert('Error', 'Failed to open photo library.');
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const onRemovePhoto = useCallback(() => {
    setImageUri('');
  }, []);

  const closeSuccess = useCallback(() => {
    setShowSuccess(false);
  }, []);

  const goToReceiptDetail = useCallback(() => {
    const id = lastSavedReceiptId.current;
    closeSuccess();
    if (!id) {
      navigation.navigate('BottomTabs', { screen: 'Home' });
      return;
    }
    navigation.navigate('ReceiptDetail', { receiptId: id });
  }, [closeSuccess, navigation]);

  const goHome = useCallback(() => {
    closeSuccess();
    navigation.navigate('BottomTabs', { screen: 'Home' });
  }, [closeSuccess, navigation]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const ok = validate();
    if (!ok) return;

    const amount = parseAmount(amountText);
    const m = merchant.trim();

    if (!selectedCategory) return;

    try {
      setSaving(true);

      const receiptId = Date.now().toString();

      await upsertReceipt({
        id: receiptId,
        merchant: m,
        amount,
        date,
        category: selectedCategory.name,
        categoryId: selectedCategory.id,
        categoryColor: selectedCategory.color,
        tags,
        paymentMethod: paymentMethod?.label ?? '',
        notes: notes.trim(),
        imageUri: imageUri || undefined,
      });

      lastSavedReceiptId.current = receiptId;
      setShowSuccess(true);

      if (successTimeout.current) clearTimeout(successTimeout.current);
      successTimeout.current = setTimeout(() => {
        goToReceiptDetail();
      }, 2000);
    } catch {
      Alert.alert('Error', 'Failed to save receipt.');
    } finally {
      setSaving(false);
    }
  }, [
    amountText,
    date,
    goToReceiptDetail,
    imageUri,
    merchant,
    notes,
    paymentMethod,
    saving,
    selectedCategory,
    tags,
    validate,
  ]);

  const amountValue = useMemo(() => parseAmount(amountText), [amountText]);
  const canSave = merchant.trim().length > 0 && amountText.trim().length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title="Add Receipt" onBack={() => navigation.goBack()} showBackButton />

      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.select({ ios: 'padding', android: undefined })}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Card variant="glassmorphism" style={styles.amountCard}>
            <LinearGradient
              colors={Array.from([`${primary}22`, `${primary}10`])}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.amountLabel}>Amount</Text>
            <Text style={styles.amountDisplay}>{formatCurrency(amountValue)}</Text>
            <Input
              value={amountText}
              onChangeText={t => {
                setAmountText(formatAmountText(t));
                if (errors.amount) setErrors(prev => ({ ...prev, amount: undefined }));
              }}
              placeholder="0.00"
              keyboardType={Platform.select({ ios: 'decimal-pad', android: 'numeric', default: 'numeric' })}
              label=""
              error={errors.amount}
              accessibilityLabel="Amount"
              style={styles.amountInput}
            />
          </Card>

          <Input
            value={merchant}
            onChangeText={t => {
              setMerchant(t);
              if (errors.merchant) setErrors(prev => ({ ...prev, merchant: undefined }));
            }}
            label="Merchant"
            placeholder="e.g. Starbucks"
            error={errors.merchant}
            autoCapitalize="words"
            style={styles.field}
          />

          <Text style={styles.fieldLabel}>Category</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick category"
            onPress={() => setShowCategoryPicker(true)}
            style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerPressed, errors.category ? styles.pickerError : null]}
          >
            <View style={styles.pickerLeft}>
              {selectedCategory ? <View style={[styles.colorDot, { backgroundColor: selectedCategory.color }]} /> : <View style={styles.colorDotPlaceholder} />}
              <Text style={styles.pickerText} numberOfLines={1}>
                {selectedCategory ? selectedCategory.name : 'Select category'}
              </Text>
            </View>
            <Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textSecondary} />
          </Pressable>
          {errors.category ? <Text style={styles.errorText}>{errors.category}</Text> : null}

          <Text style={styles.fieldLabel}>Date</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick date"
            onPress={() => setShowDatePicker(true)}
            style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerPressed]}
          >
            <Text style={styles.pickerText}>{formatDate(date, 'long')}</Text>
            <Feather name="calendar" size={ICON_SIZES.md} color={colors.textSecondary} />
          </Pressable>

          <Text style={styles.fieldLabel}>Payment Method</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick payment method"
            onPress={() => setShowPaymentPicker(true)}
            style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerPressed]}
          >
            <Text style={styles.pickerText} numberOfLines={1}>
              {paymentMethod?.label ?? 'Select payment method (optional)'}
            </Text>
            <Feather name="credit-card" size={ICON_SIZES.md} color={colors.textSecondary} />
          </Pressable>

          <Text style={styles.fieldLabel}>Photo</Text>
          {imageUri ? (
            <Card variant="default" style={styles.photoCard}>
              <View style={styles.photoRow}>
                <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />
                <View style={styles.photoMeta}>
                  <Text style={styles.photoTitle}>Attached photo</Text>
                  <View style={styles.photoActions}>
                    <Button title="Change" onPress={onPickPhoto} variant="secondary" size="sm" />
                    <View style={{ width: SPACING.sm }} />
                    <IconButton
                      accessibilityLabel="Remove photo"
                      variant="ghost"
                      size="sm"
                      onPress={onRemovePhoto}
                      icon={<Feather name="trash-2" size={ICON_SIZES.sm} color={colors.textSecondary} />}
                    />
                  </View>
                </View>
              </View>
            </Card>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add photo"
              onPress={onPickPhoto}
              style={({ pressed }) => [styles.photoAddRow, pressed && styles.pickerPressed]}
            >
              <Feather name="camera" size={ICON_SIZES.md} color={colors.textSecondary} />
              <Text style={styles.photoAddText}>Add a photo (optional)</Text>
            </Pressable>
          )}

          <Text style={styles.fieldLabel}>Tags</Text>
          <View style={styles.chipsWrap}>
            {TAG_SUGGESTIONS.map(t => (
              <Chip
                key={t}
                label={t}
                selected={tags.includes(t)}
                onPress={() => toggleTag(t)}
                accessibilityLabel={`Tag ${t}`}
                style={styles.chip}
              />
            ))}
          </View>

          <Input
            value={notes}
            onChangeText={setNotes}
            label="Notes"
            placeholder="Add notes (optional)"
            multiline
            numberOfLines={4}
            style={styles.field}
          />

          <View style={styles.saveWrap}>
            <Button
              title="Save Receipt"
              onPress={handleSave}
              variant="primary"
              size="lg"
              fullWidth
              disabled={!canSave || saving}
              loading={saving}
              icon={<Feather name="check" size={ICON_SIZES.sm} color={COLORS.common.white} />}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CategoryPickerModal
        visible={showCategoryPicker}
        selectedId={selectedCategory?.id}
        categories={DEFAULT_CATEGORIES}
        onSelect={(cat: CategoryOption) => {
          setSelectedCategory(cat);
          if (errors.category) setErrors(prev => ({ ...prev, category: undefined }));
        }}
        onClose={() => setShowCategoryPicker(false)}
      />

      <DatePickerModal
        visible={showDatePicker}
        initialDate={date}
        onConfirm={(d: Date) => {
          setDate(d);
          setShowDatePicker(false);
        }}
        onClose={() => setShowDatePicker(false)}
      />

      <OptionPickerModal
        visible={showPaymentPicker}
        title="Payment Method"
        items={PAYMENT_METHODS}
        selectedId={paymentMethod?.id}
        onSelect={(item: OptionItem) => setPaymentMethod(item)}
        onClose={() => setShowPaymentPicker(false)}
      />

      <Modal
        isVisible={showSuccess}
        onBackdropPress={goToReceiptDetail}
        onBackButtonPress={goToReceiptDetail}
        backdropOpacity={0.5}
        useNativeDriver
      >
        <Card variant="default" style={styles.successCard}>
          <View style={styles.successIcon}>
            <LinearGradient
              colors={Array.from(GRADIENTS.success)}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Feather name="check" size={28} color={COLORS.common.white} />
          </View>

          <Text style={styles.successTitle}>Receipt Added Successfully!</Text>
          <Text style={styles.successDesc}>We saved your receipt and updated your records.</Text>

          <View style={styles.successActions}>
            <Button title="Go Home" onPress={goHome} variant="secondary" style={styles.successActionLeft} />
            <Button title="View Receipt" onPress={goToReceiptDetail} variant="primary" style={styles.successActionRight} />
          </View>
        </Card>
      </Modal>

      <LoadingOverlay visible={false} />
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
  primary,
}: {
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
    border: string;
    disabled: string;
    success?: string;
  };
  primary: string;
}) => {
  const label: TextStyle = { ...TYPOGRAPHY.label, color: colors.textSecondary };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex1: {
      flex: 1,
    },
    content: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING['3xl'],
    },

    amountCard: {
      marginTop: SPACING.md,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    amountLabel: {
      ...label,
      marginBottom: SPACING.xs,
    },
    amountDisplay: {
      fontSize: 26,
      fontWeight: '600',
      color: colors.text,
      marginBottom: SPACING.sm,
    },
    amountInput: {
      marginTop: SPACING.sm,
    },

    field: {
      marginBottom: SPACING.lg,
    },

    fieldLabel: {
      ...label,
      marginBottom: SPACING.sm,
    },

    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.sm,
    },
    pickerPressed: {
      opacity: 0.85,
    },
    pickerError: {
      borderColor: COLORS.semantic.error,
      borderWidth: 2,
    },
    pickerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      paddingRight: SPACING.md,
    },
    pickerText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      flexShrink: 1,
    },

    colorDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: SPACING.sm,
    },
    colorDotPlaceholder: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: SPACING.sm,
      backgroundColor: colors.disabled,
    },

    errorText: {
      ...TYPOGRAPHY.caption,
      color: COLORS.semantic.error,
      marginBottom: SPACING.lg,
    },

    photoAddRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.lg,
    },
    photoAddText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
    },

    photoCard: {
      padding: SPACING.md,
      marginBottom: SPACING.lg,
    },
    photoRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    photo: {
      width: 64,
      height: 64,
      borderRadius: RADIUS.md,
      backgroundColor: colors.disabled,
    },
    photoMeta: {
      flex: 1,
      marginLeft: SPACING.md,
    },
    photoTitle: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      marginBottom: SPACING.sm,
      fontWeight: '700',
    },
    photoActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: SPACING.lg,
    },
    chip: {
      marginRight: SPACING.sm,
      marginBottom: SPACING.sm,
    },

    saveWrap: {
      marginTop: SPACING.sm,
      marginBottom: SPACING.xl,
    },

    successCard: {
      padding: SPACING.lg,
      alignItems: 'center',
    },
    successIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginBottom: SPACING.md,
    },
    successTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
      textAlign: 'center',
      marginBottom: SPACING.xs,
    },
    successDesc: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: SPACING.lg,
    },
    successActions: {
      flexDirection: 'row',
      alignSelf: 'stretch',
    },
    successActionLeft: {
      flex: 1,
      marginRight: SPACING.sm,
    },
    successActionRight: {
      flex: 1,
      marginLeft: SPACING.sm,
    },
  });
};

export default AddManuallyScreen;
