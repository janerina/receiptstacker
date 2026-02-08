import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
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
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';

import { Button, Card, Input } from '@/components/common';
import { LoadingOverlay } from '@/components/compositions/LoadingOverlay';
import { CategoryPickerModal, type CategoryOption } from '@/components/modals/CategoryPickerModal';
import { DatePickerModal } from '@/components/modals/DatePickerModal';
import { OptionPickerModal, type OptionItem } from '@/components/modals/OptionPickerModal';
import { COLORS, GRADIENTS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useApp, useReceipts } from '@/contexts';
import type { MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrency } from '@/utils/format';
import { hexToRgba } from '@/utils/color';
import { upsertReceipt } from '@/utils/receiptStore';
import {
  addReceipt,
  getReceiptById as getReceiptByIdSql,
  saveReceiptImages,
  saveReceiptItems,
  saveReceiptOcrData,
  setTagsForReceiptByName,
  updateReceipt,
} from '@/services/database';

type Props = NativeStackScreenProps<MainStackParamList, 'AddManually'>;

type ReceiptItemDraft = {
  id: string;
  code: string;
  name: string;
  priceText: string;
};

// Keep IDs aligned with the SQLite seeded defaults (see services/database.ts) so
// category selection persists and renders correctly in Receipt Details.
const DEFAULT_CATEGORIES: CategoryOption[] = [
  { id: 'food', name: 'Food & Dining', color: '#10b981' },
  { id: 'transport', name: 'Transportation', color: '#f59e0b' },
  { id: 'shopping', name: 'Shopping', color: '#3b82f6' },
  { id: 'entertainment', name: 'Entertainment', color: '#8b5cf6' },
  { id: 'health', name: 'Health', color: '#ef4444' },
  { id: 'bills', name: 'Bills', color: '#6b7280' },
  { id: 'travel', name: 'Travel', color: '#14b8a6' },
  { id: 'other', name: 'Other', color: '#9ca3af' },
];

const PAYMENT_METHODS: OptionItem[] = [
  { id: 'credit', label: 'Credit Card' },
  { id: 'debit', label: 'Debit Card' },
  { id: 'cash', label: 'Cash' },
  { id: 'wallet', label: 'Digital Wallet' },
  { id: 'other', label: 'Other' },
];

const CREATE_CATEGORY_VALUE = '__create_category__' as const;

type AnchorRect = { x: number; y: number; width: number; height: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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
  const { tags: storedTags, loadTags } = useApp();
  const { loadReceipts } = useReceipts();

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

  const [totalAmountText, setTotalAmountText] = useState('');

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);

  const [showTagsPanel, setShowTagsPanel] = useState(false);

  const categoryAnchorRef = useRef<View>(null);
  const paymentAnchorRef = useRef<View>(null);
  const [categoryAnchor, setCategoryAnchor] = useState<AnchorRect | null>(null);
  const [paymentAnchor, setPaymentAnchor] = useState<AnchorRect | null>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false);

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
      setTotalAmountText(formatAmountText(extracted.amount));
      setItems(prev => {
        if (!prev.length) return [{ id: '1', code: '', name: '', priceText: formatAmountText(extracted.amount) }];
        const [first, ...rest] = prev;
        return [{ ...first, priceText: formatAmountText(extracted.amount) }, ...rest];
      });
    }
    if (typeof extracted.date === 'string' && extracted.date.trim()) setDate(toDate(extracted.date));
    if (typeof extracted.imageUri === 'string') setImageUri(extracted.imageUri);

    if (Array.isArray(extracted.items) && extracted.items.length) {
      const next = extracted.items
        .filter((it: any) => it && typeof it === 'object')
        .map((it: any, idx: number) => {
          const name = typeof it.name === 'string' ? it.name : '';
          const total = typeof it.totalPrice === 'number' && Number.isFinite(it.totalPrice) ? it.totalPrice : 0;
          return {
            id: String(idx + 1),
            code: '',
            name,
            priceText: total > 0 ? String(total.toFixed(2)) : '',
          };
        })
        .filter((it) => it.name.trim().length > 0 || it.priceText.trim().length > 0);

      if (next.length) setItems(next);
    }

    const categoryId = typeof extracted.categoryId === 'string' ? extracted.categoryId : '';
    const categoryName = typeof extracted.category === 'string' ? extracted.category : '';
    if (!selectedCategory && (categoryId || categoryName)) {
      const match =
        (categoryId && DEFAULT_CATEGORIES.find((c) => c.id === categoryId)) ||
        (categoryName && DEFAULT_CATEGORIES.find((c) => c.name.toLowerCase() === categoryName.toLowerCase()));
      if (match) setSelectedCategory(match);
    }
  }, [extracted, selectedCategory]);

  useEffect(() => {
    return () => {
      if (successTimeout.current) clearTimeout(successTimeout.current);
    };
  }, []);

  useEffect(() => {
    // Ensure tags are hydrated for the inline selector.
    loadTags().catch(() => undefined);
  }, [loadTags]);

  const openCategories = useCallback(() => {
    // Categories lives inside the Home stack.
    navigation.navigate(
      'BottomTabs' as any,
      {
        screen: 'Home',
        params: { screen: 'Categories' },
      } as any,
    );
  }, [navigation]);

  const measureAnchor = useCallback((ref: React.RefObject<View | null>, cb: (rect: AnchorRect) => void) => {
    const node = ref.current;
    if (!node) return;
    // measureInWindow gives screen coords; wrap in rAF so layout is stable.
    requestAnimationFrame(() => {
      node.measureInWindow((x, y, width, height) => {
        cb({ x, y, width, height });
      });
    });
  }, []);

  const openCategoryDropdown = useCallback(() => {
    measureAnchor(categoryAnchorRef, rect => {
      setCategoryAnchor(rect);
      setShowCategoryDropdown(true);
    });
  }, [measureAnchor]);

  const openPaymentDropdown = useCallback(() => {
    measureAnchor(paymentAnchorRef, rect => {
      setPaymentAnchor(rect);
      setShowPaymentDropdown(true);
    });
  }, [measureAnchor]);

  const openNativeDate = useCallback(() => {
    DateTimePickerAndroid.open({
      value: date,
      mode: 'date',
      is24Hour: false,
      onChange: (_event, selected) => {
        if (!selected) return;
        // Preserve time, update calendar date.
        const next = new Date(date);
        next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        setDate(next);
      },
    });
  }, [date]);

  const openNativeTime = useCallback(() => {
    DateTimePickerAndroid.open({
      value: date,
      mode: 'time',
      is24Hour: false,
      onChange: (_event, selected) => {
        if (!selected) return;
        const next = new Date(date);
        next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        setDate(next);
      },
    });
  }, [date]);

  const pickerCategoryLabel = useCallback((c: CategoryOption) => {
    switch (c.id) {
      case 'groceries':
        return `🛒 ${c.name}`;
      case 'transport':
        return `🚗 ${c.name}`;
      case 'shopping':
        return `🛍️ ${c.name}`;
      case 'food':
        return `🍔 ${c.name}`;
      case 'entertainment':
        return `🎬 ${c.name}`;
      case 'utilities':
        return `💡 ${c.name}`;
      case 'health':
        return `🏥 ${c.name}`;
      case 'travel':
        return `✈️ ${c.name}`;
      default:
        return `📦 ${c.name}`;
    }
  }, []);

  const pickerPaymentLabel = useCallback((m: OptionItem) => {
    switch (m.id) {
      case 'credit':
        return `💳 ${m.label}`;
      case 'debit':
        return `💳 ${m.label}`;
      case 'cash':
        return `💵 ${m.label}`;
      case 'wallet':
        return `📱 ${m.label}`;
      default:
        return `❓ ${m.label}`;
    }
  }, []);

  const tagOptions = useMemo(() => {
    if (storedTags.length) return storedTags.map(t => ({ name: t.name, color: t.color || primary }));
    return TAG_SUGGESTIONS.map(t => ({ name: t, color: primary }));
  }, [primary, storedTags]);

  const toggleTag = useCallback((tag: string) => {
    setTags(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag].sort()));
  }, []);

  const validate = useCallback(() => {
    const next: typeof errors = {};

    const m = merchant.trim();
    const hasAnyPrice = items.some(it => parseAmount(it.priceText) > 0);
    const itemsTotal = items.reduce((sum, it) => sum + parseAmount(it.priceText), 0);
    const manualTotal = parseAmount(totalAmountText);
    const effectiveTotal = hasAnyPrice ? itemsTotal : manualTotal;

    if (m.length < 2) next.merchant = 'Merchant is required (min 2 characters).';
    if (!(effectiveTotal > 0)) next.items = 'Enter a total amount, or add at least one item price greater than 0.';
    if (!selectedCategory) next.category = 'Category is required.';

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [errors, items, merchant, selectedCategory, totalAmountText]);

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
            if (result.errorCode) {
              Alert.alert('Camera Error', result.errorMessage || 'Failed to open camera.');
              return;
            }
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

  const onTakePhoto = useCallback(async () => {
    try {
      const result = await launchCamera({
        mediaType: 'photo',
        quality: 0.8,
        includeBase64: false,
        saveToPhotos: false,
      });

      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert('Camera Error', result.errorMessage || 'Failed to open camera.');
        return;
      }

      const uri = pickBestImageUri(result.assets?.[0]);
      if (uri) setImageUri(uri);
    } catch {
      Alert.alert('Error', 'Failed to open camera.');
    }
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
    if (successTimeout.current) {
      clearTimeout(successTimeout.current);
      successTimeout.current = null;
    }
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

    const hasAnyPrice = items.some(it => parseAmount(it.priceText) > 0);
    const itemsTotal = items.reduce((sum, it) => sum + parseAmount(it.priceText), 0);
    const manualTotal = parseAmount(totalAmountText);
    const amount = hasAnyPrice ? itemsTotal : manualTotal;
    const m = merchant.trim();

    if (!selectedCategory) return;

    try {
      setSaving(true);

      const receiptId =
        typeof route.params?.receiptId === 'string' && route.params.receiptId.trim().length
          ? route.params.receiptId
          : Date.now().toString();

      const extractedOcrOriginal = typeof extracted?.ocrTextOriginal === 'string' ? extracted.ocrTextOriginal : '';
      const extractedOcrEdited = typeof extracted?.ocrTextEdited === 'string' ? extracted.ocrTextEdited : '';
      const extractedRawJson = typeof extracted?.ocrRawJson === 'string' ? extracted.ocrRawJson : undefined;
      const extractedOcrConfidence =
        typeof extracted?.ocrConfidence === 'number' && Number.isFinite(extracted.ocrConfidence)
          ? (extracted.ocrConfidence as number)
          : undefined;
      const extractedScanMode = (typeof extracted?.scanMode === 'string' ? extracted.scanMode : '') as
        | 'single'
        | 'multi'
        | 'long'
        | '';

      const partImageUris: string[] = Array.isArray(extracted?.partImageUris)
        ? (extracted.partImageUris as unknown[]).filter((u): u is string => typeof u === 'string' && u.length > 0)
        : [];

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

      // Ensure the Home receipts list updates immediately.
      await loadReceipts();

      // Mirror to SQLite for structured queries (items/OCR/price comparison).
      try {
        const now = new Date().toISOString();

        const existingSql = await getReceiptByIdSql(receiptId);
        if (existingSql) {
          await updateReceipt(receiptId, {
            merchant: m,
            amount,
            date: date.toISOString(),
            categoryId: selectedCategory.id,
            scanMode: extractedScanMode || undefined,
            paymentMethod: paymentMethod?.label ?? undefined,
            notes: notes.trim() || undefined,
            imageUri: imageUri || undefined,
          });
        } else {
          await addReceipt({
            id: receiptId,
            merchant: m,
            amount,
            date: date.toISOString(),
            categoryId: selectedCategory.id,
            scanMode: extractedScanMode || undefined,
            paymentMethod: paymentMethod?.label ?? undefined,
            notes: notes.trim() || undefined,
            imageUri: imageUri || undefined,
            createdAt: now,
            updatedAt: now,
          });
        }

        // Persist tags in SQLite so Receipt Details shows them.
        await setTagsForReceiptByName(receiptId, tags);

        await saveReceiptItems(
          receiptId,
          items
            .map((it) => ({
              itemName: it.name,
              totalPrice: parseAmount(it.priceText),
              quantity: 1,
              unitPrice: parseAmount(it.priceText),
            }))
            .filter((it) => it.itemName.trim().length > 0),
        );

        if (extractedOcrOriginal || extractedOcrEdited) {
          await saveReceiptOcrData(receiptId, {
            originalText: extractedOcrOriginal || extractedOcrEdited,
            editedText: extractedOcrEdited || undefined,
            rawResultJson: extractedRawJson,
            engine: 'mlkit',
            confidence: extractedOcrConfidence,
          });
        }

        const imagesToSave: Array<{ imageType: 'original' | 'part'; filePath: string; partNumber?: number }> = [];
        if (imageUri) imagesToSave.push({ imageType: 'original', filePath: imageUri });

        if (extractedScanMode === 'long' && partImageUris.length > 0) {
          partImageUris.forEach((uri, idx) => {
            imagesToSave.push({ imageType: 'part', filePath: uri, partNumber: idx + 1 });
          });
        }

        if (imagesToSave.length) {
          await saveReceiptImages(receiptId, imagesToSave);
        }
      } catch (e) {
        console.warn('SQLite mirror save failed:', e);
      }

      lastSavedReceiptId.current = receiptId;

      // Important: LoadingOverlay uses a native Modal rendered after the success Modal.
      // Hide it first so the success popup is visible immediately.
      setSaving(false);
      setTimeout(() => setShowSuccess(true), 0);

      if (successTimeout.current) clearTimeout(successTimeout.current);
      successTimeout.current = setTimeout(() => {
        goToReceiptDetail();
      }, 2400);
    } catch {
      setSaving(false);
      Alert.alert('Error', 'Failed to save receipt.');
    }
  }, [date, extracted, goToReceiptDetail, imageUri, items, loadReceipts, merchant, notes, paymentMethod, saving, selectedCategory, tags, totalAmountText, validate]);

  const totalAmount = useMemo(() => items.reduce((sum, it) => sum + parseAmount(it.priceText), 0), [items]);
  const itemCount = useMemo(() => items.filter(it => it.name.trim().length > 0 || it.priceText.trim().length > 0).length, [items]);
  const hasAnyPrice = useMemo(() => items.some(it => parseAmount(it.priceText) > 0), [items]);
  const effectiveTotalAmount = useMemo(() => (hasAnyPrice ? totalAmount : parseAmount(totalAmountText)), [hasAnyPrice, totalAmount, totalAmountText]);
  const canSave = merchant.trim().length > 0 && effectiveTotalAmount > 0 && !!selectedCategory;

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
                onPress={onTakePhoto}
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
                ref={undefined}
                accessibilityRole="button"
                accessibilityLabel="Pick date"
                onPress={() => (Platform.OS === 'android' ? openNativeDate() : setShowDatePicker(true))}
                style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerPressed]}
              >
                <View style={styles.pickerLeft}>
                  <Feather name="calendar" size={ICON_SIZES.md} color={colors.textSecondary} />
                  <Text style={[styles.pickerText, styles.dateValueText]} numberOfLines={1} ellipsizeMode="tail">
                    {formatDateNumeric(date)}
                  </Text>
                </View>
                <Feather name="chevron-down" size={ICON_SIZES.md} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.twoCol}>
              <Text style={styles.sectionLabel}>Time <Text style={styles.required}>*</Text></Text>
              <Pressable
                ref={undefined}
                accessibilityRole="button"
                accessibilityLabel="Pick time"
                onPress={() => (Platform.OS === 'android' ? openNativeTime() : setShowTimePicker(true))}
                style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerPressed]}
              >
                <View style={styles.pickerLeft}>
                  <Feather name="clock" size={ICON_SIZES.md} color={colors.textSecondary} />
                  <Text style={styles.pickerText} numberOfLines={1} ellipsizeMode="tail">
                    {formatTime(date)}
                  </Text>
                </View>
                <Feather name="chevron-down" size={ICON_SIZES.md} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <Input
            value={totalAmountText}
            onChangeText={t => {
              setTotalAmountText(formatAmountText(t));
              if (errors.items) setErrors(prev => ({ ...prev, items: undefined }));
            }}
            label="Total Amount"
            placeholder="$ 0.00"
            keyboardType={Platform.select({ ios: 'decimal-pad', android: 'numeric', default: 'numeric' })}
            style={styles.field}
          />

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
              <Text style={styles.totalValue}>{formatCurrency(effectiveTotalAmount)}</Text>
            </View>
          </LinearGradient>

          <Text style={styles.sectionLabel}>Category <Text style={styles.required}>*</Text></Text>
          <Pressable
            ref={categoryAnchorRef}
            accessibilityRole="button"
            accessibilityLabel="Pick category"
            onPress={() => (Platform.OS === 'android' ? openCategoryDropdown() : setShowCategoryPicker(true))}
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
            ref={paymentAnchorRef}
            accessibilityRole="button"
            accessibilityLabel="Pick payment method"
            onPress={() => (Platform.OS === 'android' ? openPaymentDropdown() : setShowPaymentPicker(true))}
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
              onPress={() => setShowTagsPanel(v => !v)}
              style={({ pressed }) => [styles.selectTagsLink, pressed && styles.pressed]}
            >
              <Text style={[styles.selectTagsText, { color: primary }]}>{showTagsPanel ? '# Close' : '# Select Tags'}</Text>
            </Pressable>
          </View>
          {showTagsPanel ? (
            <Card variant="default" style={styles.tagsPanelCard}>
              <View style={styles.tagsPanelHeader}>
                <Text style={styles.tagsPanelTitle}>Select from existing tags</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="New tag"
                  onPress={() => navigation.navigate('Tags')}
                  style={({ pressed }) => [styles.newTagLink, pressed && styles.pressed]}
                >
                  <Text style={[styles.newTagText, { color: primary }]}>+ New Tag</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.tagsPanelList} showsVerticalScrollIndicator>
                {tagOptions.map(t => {
                  const selected = tags.includes(t.name);
                  return (
                    <Pressable
                      key={t.name}
                      accessibilityRole="button"
                      accessibilityLabel={`Tag ${t.name}`}
                      onPress={() => toggleTag(t.name)}
                      style={({ pressed }) => [styles.tagRow, selected && styles.tagRowSelected, pressed && styles.pressed]}
                    >
                      <View style={styles.tagRowLeft}>
                        <View style={[styles.tagDot, { backgroundColor: t.color || primary }]} />
                        <Text style={styles.tagRowText} numberOfLines={1}>
                          {t.name}
                        </Text>
                      </View>
                      {selected ? <Feather name="check" size={ICON_SIZES.md} color={primary} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Card>
          ) : null}
          <Text style={styles.tagsHint}>{tags.length ? tags.join(', ') : 'No tags selected'}</Text>

          <Input
            value={notes}
            onChangeText={setNotes}
            label="Notes"
            placeholder="Add any additional details..."
            multiline
            numberOfLines={8}
            minHeight={160}
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

      {Platform.OS !== 'android' ? (
        <CategoryPickerModal
          visible={showCategoryPicker}
          selectedId={selectedCategory?.id}
          categories={DEFAULT_CATEGORIES}
          onSelect={(cat: CategoryOption) => {
            setSelectedCategory(cat);
            if (errors.category) setErrors(prev => ({ ...prev, category: undefined }));
          }}
          onAddNewCategory={openCategories}
          onClose={() => setShowCategoryPicker(false)}
        />
      ) : null}

      <Modal
        isVisible={Platform.OS === 'android' && showCategoryDropdown}
        onBackdropPress={() => setShowCategoryDropdown(false)}
        onBackButtonPress={() => setShowCategoryDropdown(false)}
        backdropOpacity={0.2}
        useNativeDriver
        style={styles.dropdownModal}
      >
        {categoryAnchor ? (
          <View
            style={(() => {
              const { height: windowH, width: windowW } = Dimensions.get('window');
              const maxH = 280;
              const topBelow = categoryAnchor.y + categoryAnchor.height + 6;
              const top = topBelow + maxH > windowH - 16 ? Math.max(16, categoryAnchor.y - maxH - 6) : topBelow;
              const left = clamp(categoryAnchor.x, 12, Math.max(12, windowW - categoryAnchor.width - 12));
              const width = clamp(categoryAnchor.width, 220, windowW - 24);
              return [styles.dropdownCardWrap, { top, left, width, maxHeight: maxH }];
            })()}
          >
            <Card variant="default" style={styles.dropdownCard}>
              <ScrollView showsVerticalScrollIndicator nestedScrollEnabled>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select a category"
                  onPress={() => {
                    setSelectedCategory(null);
                    setShowCategoryDropdown(false);
                  }}
                  style={({ pressed }) => [styles.dropdownRow, pressed && styles.pressed]}
                >
                  <Text style={[styles.dropdownText, { color: colors.textSecondary }]}>Select a category</Text>
                </Pressable>

                {DEFAULT_CATEGORIES.map(c => {
                  const selected = selectedCategory?.id === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      accessibilityRole="button"
                      accessibilityLabel={c.name}
                      onPress={() => {
                        setSelectedCategory(c);
                        if (errors.category) setErrors(prev => ({ ...prev, category: undefined }));
                        setShowCategoryDropdown(false);
                      }}
                      style={({ pressed }) => [styles.dropdownRow, selected && styles.dropdownRowSelected, pressed && styles.pressed]}
                    >
                      <View style={styles.dropdownLeft}>
                        <View style={[styles.colorDot, { backgroundColor: c.color }]} />
                        <Text style={styles.dropdownText} numberOfLines={1}>
                          {pickerCategoryLabel(c)}
                        </Text>
                      </View>
                      {selected ? <Feather name="check" size={ICON_SIZES.md} color={primary} /> : null}
                    </Pressable>
                  );
                })}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Create new category"
                  onPress={() => {
                    setShowCategoryDropdown(false);
                    openCategories();
                  }}
                  style={({ pressed }) => [styles.dropdownRow, styles.dropdownRowCreate, pressed && styles.pressed]}
                >
                  <Text style={[styles.dropdownText, { color: primary }]}>+ Create new category</Text>
                </Pressable>
              </ScrollView>
            </Card>
          </View>
        ) : null}
      </Modal>

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

      {Platform.OS !== 'android' ? (
        <OptionPickerModal
          visible={showPaymentPicker}
          title="Payment Method"
          items={PAYMENT_METHODS}
          selectedId={paymentMethod?.id}
          onSelect={(item: OptionItem) => setPaymentMethod(item)}
          onClose={() => setShowPaymentPicker(false)}
        />
      ) : null}

      <Modal
        isVisible={Platform.OS === 'android' && showPaymentDropdown}
        onBackdropPress={() => setShowPaymentDropdown(false)}
        onBackButtonPress={() => setShowPaymentDropdown(false)}
        backdropOpacity={0.2}
        useNativeDriver
        style={styles.dropdownModal}
      >
        {paymentAnchor ? (
          <View
            style={(() => {
              const { height: windowH, width: windowW } = Dimensions.get('window');
              const maxH = 260;
              const topBelow = paymentAnchor.y + paymentAnchor.height + 6;
              const top = topBelow + maxH > windowH - 16 ? Math.max(16, paymentAnchor.y - maxH - 6) : topBelow;
              const left = clamp(paymentAnchor.x, 12, Math.max(12, windowW - paymentAnchor.width - 12));
              const width = clamp(paymentAnchor.width, 220, windowW - 24);
              return [styles.dropdownCardWrap, { top, left, width, maxHeight: maxH }];
            })()}
          >
            <Card variant="default" style={styles.dropdownCard}>
              <ScrollView showsVerticalScrollIndicator nestedScrollEnabled>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select payment method"
                  onPress={() => {
                    setPaymentMethod(null);
                    setShowPaymentDropdown(false);
                  }}
                  style={({ pressed }) => [styles.dropdownRow, pressed && styles.pressed]}
                >
                  <Text style={[styles.dropdownText, { color: colors.textSecondary }]}>Select payment method</Text>
                </Pressable>

                {PAYMENT_METHODS.map(m => {
                  const selected = paymentMethod?.id === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      accessibilityRole="button"
                      accessibilityLabel={m.label}
                      onPress={() => {
                        setPaymentMethod(m);
                        setShowPaymentDropdown(false);
                      }}
                      style={({ pressed }) => [styles.dropdownRow, selected && styles.dropdownRowSelected, pressed && styles.pressed]}
                    >
                      <Text style={styles.dropdownText} numberOfLines={1}>
                        {pickerPaymentLabel(m)}
                      </Text>
                      {selected ? <Feather name="check" size={ICON_SIZES.md} color={primary} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Card>
          </View>
        ) : null}
      </Modal>

      <Modal
        isVisible={showSuccess}
        onBackdropPress={goToReceiptDetail}
        onBackButtonPress={goToReceiptDetail}
        backdropOpacity={0.45}
        useNativeDriver
      >
        <View style={styles.successCard}>
          <View style={styles.successIconWrap}>
            <View style={styles.successIconCircle}>
              <Feather name="check" size={34} color={COLORS.semantic.success} />
            </View>
          </View>

          <Text style={styles.successTitle}>Receipt Saved Successfully!</Text>
          <Text style={styles.successDesc}>Your receipt has been saved and added to your expense tracking.</Text>

          <LinearGradient colors={Array.from(GRADIENTS.primary)} style={styles.successTotalPill}>
            <Text style={styles.successTotalLabel}>Total Amount</Text>
            <Text style={styles.successTotalAmount}>{formatCurrency(effectiveTotalAmount)}</Text>
          </LinearGradient>

          <Text style={styles.successRedirect}>Redirecting automatically...</Text>
        </View>
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
    pickerRowNative: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: 0,
      marginBottom: SPACING.sm,
      minHeight: 52,
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
      minWidth: 0,
      paddingRight: SPACING.md,
    },
    pickerText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      minWidth: 0,
      flexShrink: 1,
    },
    dateValueText: {
      fontSize: 14,
    },

    dropdownModal: {
      margin: 0,
    },
    dropdownCardWrap: {
      position: 'absolute',
    },
    dropdownCard: {
      padding: 0,
      overflow: 'hidden',
    },
    dropdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    dropdownRowSelected: {
      backgroundColor: hexToRgba(primary, 0.08),
    },
    dropdownRowCreate: {
      borderBottomWidth: 0,
    },
    dropdownLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
      paddingRight: SPACING.md,
    },
    dropdownText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      flexShrink: 1,
      minWidth: 0,
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

    tagsPanelCard: {
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      marginTop: SPACING.sm,
      marginBottom: SPACING.sm,
    },
    tagsPanelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    tagsPanelTitle: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
      flex: 1,
      paddingRight: SPACING.md,
    },
    newTagLink: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.full,
    },
    newTagText: {
      ...TYPOGRAPHY.label,
      fontWeight: '800',
    },
    tagsPanelList: {
      maxHeight: 260,
    },
    tagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: SPACING.sm,
    },
    tagRowSelected: {
      borderColor: primary,
    },
    tagRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
      paddingRight: SPACING.md,
    },
    tagDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: SPACING.sm,
    },
    tagRowText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      flexShrink: 1,
      minWidth: 0,
    },

    saveWrap: {
      marginTop: SPACING.sm,
      marginBottom: SPACING.xl,
    },

    successCard: {
      width: '100%',
      maxWidth: 380,
      alignSelf: 'center',
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING['2xl'],
      paddingBottom: SPACING.xl,
      alignItems: 'center',
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
        },
        android: { elevation: 10 },
        default: {
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
        },
      }),
    },
    successIconWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.lg,
    },
    successIconCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(COLORS.semantic.success, 0.14),
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
      marginBottom: SPACING.xl,
    },
    successTotalPill: {
      alignSelf: 'stretch',
      borderRadius: 18,
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.lg,
    },
    successTotalLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: hexToRgba(COLORS.common.white, 0.9),
      fontWeight: '600',
      marginBottom: 6,
    },
    successTotalAmount: {
      fontSize: 36,
      lineHeight: 40,
      fontWeight: '700',
      color: COLORS.common.white,
      letterSpacing: -0.2,
    },
    successRedirect: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      textAlign: 'center',
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
