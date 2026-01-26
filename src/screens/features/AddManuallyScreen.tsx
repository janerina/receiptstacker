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

import { Button, Card, Chip, Input } from '@/components/common';
import { LoadingOverlay } from '@/components/compositions/LoadingOverlay';
import { CategoryPickerModal, type CategoryOption } from '@/components/modals/CategoryPickerModal';
import { DatePickerModal } from '@/components/modals/DatePickerModal';
import { OptionPickerModal, type OptionItem } from '@/components/modals/OptionPickerModal';
import { COLORS, GRADIENTS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrency } from '@/utils/format';
import { hexToRgba } from '@/utils/color';
import { upsertReceipt } from '@/utils/receiptStore';

type Props = NativeStackScreenProps<MainStackParamList, 'AddManually'>;

type ReceiptItemDraft = {
  id: string;
  code: string;
  name: string;
  priceText: string;
};

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

const formatDateNumeric = (value: Date) => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }).format(value);
  } catch {
    const mm = `${value.getMonth() + 1}`.padStart(2, '0');
    const dd = `${value.getDate()}`.padStart(2, '0');
    return `${mm}/${dd}/${value.getFullYear()}`;
  }
};

const formatTime = (value: Date) => {
  try {
    return value.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    const hh = `${value.getHours()}`.padStart(2, '0');
    const mm = `${value.getMinutes()}`.padStart(2, '0');
    return `${hh}:${mm}`;
  }
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
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption | null>(null);
  const [date, setDate] = useState<Date>(new Date());
  const [paymentMethod, setPaymentMethod] = useState<OptionItem | null>(null);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [imageUri, setImageUri] = useState<string>('');

  const [items, setItems] = useState<ReceiptItemDraft[]>([
    { id: '1', code: '', name: '', priceText: '' },
  ]);

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);

  const [showTagsModal, setShowTagsModal] = useState(false);

  const [errors, setErrors] = useState<{ merchant?: string; items?: string; category?: string }>({});
  const [saving, setSaving] = useState(false);

  const [showSuccess, setShowSuccess] = useState(false);
  const lastSavedReceiptId = useRef<string | null>(null);
  const successTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

  useEffect(() => {
    // Pre-fill from OCR results (if any)
    if (!extracted) return;

    if (typeof extracted.merchant === 'string') setMerchant(extracted.merchant);
    if (typeof extracted.amount === 'string') {
      setItems(prev => {
        if (!prev.length) return [{ id: '1', code: '', name: '', priceText: formatAmountText(extracted.amount) }];
        const [first, ...rest] = prev;
        return [{ ...first, priceText: formatAmountText(extracted.amount) }, ...rest];
      });
    }
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
    const total = items.reduce((sum, it) => sum + parseAmount(it.priceText), 0);
    const hasValidItem = items.some(it => it.name.trim().length > 0 && parseAmount(it.priceText) > 0);

    if (m.length < 2) next.merchant = 'Merchant is required (min 2 characters).';
    if (!(total > 0) || !hasValidItem) next.items = 'Add at least one item with a name and price.';
    if (!selectedCategory) next.category = 'Category is required.';

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [errors, items, merchant, selectedCategory]);

  const addItem = useCallback(() => {
    setItems(prev => {
      const nextId = `${Date.now()}`;
      return [...prev, { id: nextId, code: '', name: '', priceText: '' }];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => (prev.length <= 1 ? prev : prev.filter(it => it.id !== id)));
  }, []);

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

  const onOpenScanCamera = useCallback(() => {
    // Use the same camera/scan flow as the Scan tab.
    const parent = navigation.getParent();
    // Prefer navigating to the Scan tab via the parent tab navigator when present.
    (parent as any)?.navigate?.('Scan');
    if (!parent) (navigation as any).navigate?.('Scan');
  }, [navigation]);

  const onChooseFile = useCallback(async () => {
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

    const amount = items.reduce((sum, it) => sum + parseAmount(it.priceText), 0);
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
  }, [date, goToReceiptDetail, imageUri, items, merchant, notes, paymentMethod, saving, selectedCategory, tags, validate]);

  const totalAmount = useMemo(() => items.reduce((sum, it) => sum + parseAmount(it.priceText), 0), [items]);
  const itemCount = useMemo(() => items.filter(it => it.name.trim().length > 0 || it.priceText.trim().length > 0).length, [items]);
  const canSave = merchant.trim().length > 0 && totalAmount > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.screenHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => [styles.backIconBtn, pressed && styles.pressed]}
        >
          <Feather name="arrow-left" size={ICON_SIZES.md} color={colors.text} />
        </Pressable>

        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Add Receipt</Text>
          <Text style={styles.headerSubtitle}>Enter receipt details manually</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.select({ ios: 'padding', android: undefined })}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.uploadCard}>
            <View style={styles.uploadIconCircle}>
              <Feather name="upload" size={24} color={primary} />
            </View>
            <Text style={styles.uploadTitle}>Upload Receipt Image</Text>
            <Text style={styles.uploadSub}>Optional - Attach a photo of your receipt</Text>
            <Text style={styles.uploadMeta}>PNG, JPG up to 10MB</Text>
            <View style={{ height: SPACING.md }} />

            <View style={styles.uploadActionsRow}>
              <Button
                title="Camera"
                onPress={onOpenScanCamera}
                variant="primary"
                icon={<Feather name="camera" size={18} color={COLORS.common.white} />}
                style={styles.uploadActionBtnLeft}
              />
              <Button
                title="Choose File"
                onPress={onChooseFile}
                variant="primary"
                icon={<Feather name="upload" size={18} color={COLORS.common.white} />}
                style={styles.uploadActionBtnRight}
              />
            </View>

            <Text style={styles.uploadHint}>Take a photo with camera or choose an existing file</Text>
            {imageUri ? (
              <View style={styles.uploadPreviewRow}>
                <Image source={{ uri: imageUri }} style={styles.uploadPreview} resizeMode="cover" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove uploaded image"
                  onPress={onRemovePhoto}
                  style={({ pressed }) => [styles.removeUploadBtn, pressed && styles.pressed]}
                >
                  <Feather name="x" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionLabel}>Store Name <Text style={styles.required}>*</Text></Text>
          <Input
            value={merchant}
            onChangeText={t => {
              setMerchant(t);
              if (errors.merchant) setErrors(prev => ({ ...prev, merchant: undefined }));
            }}
            placeholder="e.g., Whole Foods, Target"
            error={errors.merchant}
            autoCapitalize="words"
            style={styles.field}
            leftIcon={<Feather name="file-text" size={ICON_SIZES.sm} color={colors.textSecondary} />}
          />

          <View style={styles.twoColRow}>
            <View style={styles.twoCol}>
              <Text style={styles.sectionLabel}>Date <Text style={styles.required}>*</Text></Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pick date"
                onPress={() => setShowDatePicker(true)}
                style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerPressed]}
              >
                <View style={styles.pickerLeft}>
                  <Feather name="calendar" size={ICON_SIZES.md} color={colors.textSecondary} />
                  <Text style={styles.pickerText}>{formatDateNumeric(date)}</Text>
                </View>
                <Feather name="chevron-down" size={ICON_SIZES.md} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.twoCol}>
              <Text style={styles.sectionLabel}>Time <Text style={styles.required}>*</Text></Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pick time"
                onPress={() => setShowTimePicker(true)}
                style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerPressed]}
              >
                <View style={styles.pickerLeft}>
                  <Feather name="clock" size={ICON_SIZES.md} color={colors.textSecondary} />
                  <Text style={styles.pickerText}>{formatTime(date)}</Text>
                </View>
                <Feather name="chevron-down" size={ICON_SIZES.md} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.itemsHeaderRow}>
            <Text style={styles.itemsTitle}>Receipt Items <Text style={styles.required}>*</Text></Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add item"
              onPress={addItem}
              style={({ pressed }) => [styles.addItemBtn, pressed && styles.pressed]}
            >
              <Text style={styles.addItemBtnText}>＋ Add Item</Text>
            </Pressable>
          </View>
          {errors.items ? <Text style={styles.errorText}>{errors.items}</Text> : null}

          {items.map((it, idx) => (
            <Card key={it.id} variant="default" style={styles.itemCard}>
              <View style={styles.itemCardHeader}>
                <Text style={styles.itemCardTitle}>Item {idx + 1}</Text>
                {items.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove item ${idx + 1}`}
                    onPress={() => removeItem(it.id)}
                    style={({ pressed }) => [styles.itemRemoveBtn, pressed && styles.pressed]}
                  >
                    <Feather name="x" size={16} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>

              <Input
                value={it.code}
                onChangeText={t =>
                  setItems(prev => prev.map(p => (p.id === it.id ? { ...p, code: t } : p)))
                }
                label="Item Code (Optional)"
                placeholder="e.g., SKU123, #4011"
                style={styles.itemField}
              />

              <Input
                value={it.name}
                onChangeText={t =>
                  setItems(prev => prev.map(p => (p.id === it.id ? { ...p, name: t } : p)))
                }
                label="Item Name *"
                placeholder="e.g., Organic Bananas, Coffee"
                style={styles.itemField}
              />

              <Input
                value={it.priceText}
                onChangeText={t => {
                  setItems(prev => prev.map(p => (p.id === it.id ? { ...p, priceText: formatAmountText(t) } : p)));
                  if (errors.items) setErrors(prev => ({ ...prev, items: undefined }));
                }}
                label="Price *"
                placeholder="$ 0.00"
                keyboardType={Platform.select({ ios: 'decimal-pad', android: 'numeric', default: 'numeric' })}
                style={styles.itemField}
              />
            </Card>
          ))}

          <LinearGradient
            colors={Array.from(GRADIENTS.primary)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.totalCard}
          >
            <View style={styles.totalRow}>
              <View>
                <Text style={styles.totalLabel}>Total Amount</Text>
                <Text style={styles.totalMeta}>{Math.max(itemCount, 0)} item{itemCount === 1 ? '' : 's'}</Text>
              </View>
              <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
            </View>
          </LinearGradient>

          <Text style={styles.sectionLabel}>Category <Text style={styles.required}>*</Text></Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick category"
            onPress={() => setShowCategoryPicker(true)}
            style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerPressed, errors.category ? styles.pickerError : null]}
          >
            <View style={styles.pickerLeft}>
              {selectedCategory ? <View style={[styles.colorDot, { backgroundColor: selectedCategory.color }]} /> : <View style={styles.colorDotPlaceholder} />}
              <Text style={styles.pickerText} numberOfLines={1}>
                {selectedCategory ? selectedCategory.name : 'Select a category'}
              </Text>
            </View>
            <Feather name="chevron-down" size={ICON_SIZES.md} color={colors.textSecondary} />
          </Pressable>
          {errors.category ? <Text style={styles.errorText}>{errors.category}</Text> : null}

          <Text style={styles.sectionLabel}>Payment Method</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick payment method"
            onPress={() => setShowPaymentPicker(true)}
            style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerPressed]}
          >
            <Text style={styles.pickerText} numberOfLines={1}>
              {paymentMethod?.label ?? 'Select payment method'}
            </Text>
            <Feather name="chevron-down" size={ICON_SIZES.md} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.tagsHeaderRow}>
            <Text style={styles.sectionLabel}>Tags</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select tags"
              onPress={() => setShowTagsModal(true)}
              style={({ pressed }) => [styles.selectTagsLink, pressed && styles.pressed]}
            >
              <Text style={[styles.selectTagsText, { color: primary }]}># Select Tags</Text>
            </Pressable>
          </View>
          <Text style={styles.tagsHint}>{tags.length ? tags.join(', ') : 'No tags selected'}</Text>

          <Input
            value={notes}
            onChangeText={setNotes}
            label="Notes"
            placeholder="Add any additional details..."
            multiline
            numberOfLines={5}
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
            />
            <View style={{ height: SPACING.md }} />
            <Button title="Cancel" onPress={() => navigation.goBack()} variant="secondary" size="lg" fullWidth />
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

      <DatePickerModal
        visible={showTimePicker}
        selectedDate={date}
        mode="time"
        title="Select Time"
        onSelect={(d: Date) => {
          // Keep the same calendar date, update time.
          const next = new Date(date);
          next.setHours(d.getHours(), d.getMinutes(), 0, 0);
          setDate(next);
        }}
        onClose={() => setShowTimePicker(false)}
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
        isVisible={showTagsModal}
        onBackdropPress={() => setShowTagsModal(false)}
        onBackButtonPress={() => setShowTagsModal(false)}
        backdropOpacity={0.5}
        useNativeDriver
      >
        <Card variant="default" style={styles.tagsModalCard}>
          <View style={styles.tagsModalHeader}>
            <Text style={styles.tagsModalTitle}>Select Tags</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close tags"
              onPress={() => setShowTagsModal(false)}
              style={({ pressed }) => [styles.tagsModalClose, pressed && styles.pressed]}
            >
              <Feather name="x" size={ICON_SIZES.md} color={colors.textSecondary} />
            </Pressable>
          </View>
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
          <Button title="Done" onPress={() => setShowTagsModal(false)} variant="primary" fullWidth />
        </Card>
      </Modal>

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

      <LoadingOverlay visible={saving} message="Saving receipt..." />
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
    pressed: {
      opacity: 0.85,
    },
    content: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING['3xl'],
    },

    screenHeader: {
      backgroundColor: colors.background,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    backIconBtn: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.sm,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitles: {
      flex: 1,
    },
    headerTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
    },
    headerSubtitle: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginTop: 2,
    },

    uploadCard: {
      marginTop: SPACING.lg,
      marginBottom: SPACING.lg,
      padding: SPACING.xl,
      borderRadius: RADIUS.xl,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: hexToRgba(primary, 0.25),
      alignItems: 'center',
    },
    uploadIconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(primary, 0.12),
      marginBottom: SPACING.md,
    },
    uploadTitle: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
      marginBottom: 4,
    },
    uploadSub: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 4,
    },
    uploadMeta: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    uploadActionsRow: {
      width: '100%',
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING.md,
    },
    uploadActionBtnLeft: {
      flex: 1,
      marginRight: SPACING.md,
    },
    uploadActionBtnRight: {
      flex: 1,
    },
    uploadHint: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textTertiary,
      marginTop: SPACING.md,
      textAlign: 'center',
    },
    uploadPreviewRow: {
      width: '100%',
      alignSelf: 'stretch',
      marginTop: SPACING.lg,
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
      position: 'relative',
    },
    uploadPreview: {
      width: '100%',
      height: 180,
    },
    removeUploadBtn: {
      position: 'absolute',
      top: SPACING.sm,
      right: SPACING.sm,
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(colors.surface, 0.9),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },

    field: {
      marginBottom: SPACING.lg,
    },

    sectionLabel: {
      ...label,
      marginBottom: SPACING.sm,
    },
    required: {
      color: COLORS.semantic.error,
      fontWeight: '800',
    },

    twoColRow: {
      flexDirection: 'row',
      gap: SPACING.md,
      marginBottom: SPACING.lg,
    },
    twoCol: {
      flex: 1,
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
      gap: SPACING.sm,
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

    itemsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    itemsTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
    },
    addItemBtn: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.full,
      backgroundColor: hexToRgba(primary, 0.12),
    },
    addItemBtnText: {
      ...TYPOGRAPHY.label,
      color: primary,
      fontWeight: '800',
    },

    itemCard: {
      padding: SPACING.lg,
      borderRadius: RADIUS.xl,
      marginBottom: SPACING.md,
    },
    itemCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    itemCardTitle: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
    },
    itemRemoveBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(colors.text, 0.04),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    itemField: {
      marginBottom: SPACING.md,
    },

    totalCard: {
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      marginTop: SPACING.md,
      marginBottom: SPACING.lg,
    },
    totalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    totalLabel: {
      ...TYPOGRAPHY.bodyLarge,
      color: COLORS.common.white,
      fontWeight: '800',
      marginBottom: 4,
    },
    totalMeta: {
      ...TYPOGRAPHY.bodySmall,
      color: hexToRgba(COLORS.common.white, 0.85),
    },
    totalValue: {
      fontSize: 34,
      fontWeight: '900',
      color: COLORS.common.white,
    },

    tagsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.sm,
    },
    selectTagsLink: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.full,
    },
    selectTagsText: {
      ...TYPOGRAPHY.label,
      fontWeight: '800',
    },
    tagsHint: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginBottom: SPACING.lg,
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

    tagsModalCard: {
      padding: SPACING.lg,
      borderRadius: RADIUS.xl,
    },
    tagsModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    tagsModalTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
    },
    tagsModalClose: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
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
