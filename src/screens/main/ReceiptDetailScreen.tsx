import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import Share from 'react-native-share';
import { generatePDF } from 'react-native-html-to-pdf';

import { Button, Card, Chip, IconButton, Input } from '@/components/common';
import { Header, LoadingOverlay } from '@/components/compositions';
import { CategoryPickerModal } from '@/components/modals/CategoryPickerModal';
import { DatePickerModal } from '@/components/modals/DatePickerModal';
import { ImageViewerModal } from '@/components/modals/ImageViewerModal';
import { OptionPickerModal, type OptionItem } from '@/components/modals/OptionPickerModal';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrency, formatDate } from '@/utils/format';
import { deleteReceiptById, getReceiptById, upsertReceipt } from '@/utils/receiptStore';
import {
  deleteReceipt as deleteReceiptSql,
  getCategories,
  getCategoryById,
  getLatestReceiptOcr,
  getReceiptById as getReceiptByIdSql,
  getReceiptImagesByReceiptId,
  getReceiptItemsByReceiptId,
  getReceiptParsedData,
  getTagsForReceipt,
  updateReceipt as updateReceiptSql,
} from '@/services/database';
import { confidenceToPct } from '@/utils/scannedReceipts';

type Props = NativeStackScreenProps<MainStackParamList, 'ReceiptDetail'>;

export interface Receipt {
  id: string;
  merchant: string;
  amount: number;
  date: Date | string;
  category: string;
  categoryId: string;
  categoryColor: string;
  tags?: string[];
  paymentMethod?: string;
  notes?: string;
  imageUri?: string;
}

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', iconName: 'dollar-sign' },
  { id: 'credit', label: 'Credit Card', iconName: 'credit-card' },
  { id: 'debit', label: 'Debit Card', iconName: 'credit-card' },
  { id: 'mobile', label: 'Mobile Payment', iconName: 'smartphone' },
  { id: 'other', label: 'Other', iconName: 'more-horizontal' },
] as const;

const DEFAULT_TAG_SUGGESTIONS = ['Business', 'Coffee', 'Travel', 'Meals', 'Client', 'Personal', 'Tax', 'Supplies'] as const;

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const receiptToHtml = (r: Receipt) => {
  const tags = r.tags?.length ? r.tags.join(', ') : '—';
  const notes = r.notes?.trim() ? r.notes : '—';
  const payment = r.paymentMethod?.trim() ? r.paymentMethod : '—';

  return `
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body { font-family: -apple-system, Roboto, Arial, sans-serif; padding: 24px; }
        .title { font-size: 20px; font-weight: 700; margin-bottom: 12px; }
        .amount { font-size: 28px; font-weight: 800; margin: 8px 0 18px; }
        .row { margin: 8px 0; }
        .label { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
        .value { font-size: 14px; margin-top: 2px; }
        .divider { height: 1px; background: #e5e7eb; margin: 16px 0; }
      </style>
    </head>
    <body>
      <div class="title">Receipt Details</div>
      <div class="value">${escapeHtml(r.merchant)}</div>
      <div class="amount">${escapeHtml(formatCurrency(r.amount))}</div>

      <div class="divider"></div>

      <div class="row">
        <div class="label">Date</div>
        <div class="value">${escapeHtml(formatDate(r.date, 'long'))}</div>
      </div>
      <div class="row">
        <div class="label">Category</div>
        <div class="value">${escapeHtml(r.category)}</div>
      </div>
      <div class="row">
        <div class="label">Payment Method</div>
        <div class="value">${escapeHtml(payment)}</div>
      </div>
      <div class="row">
        <div class="label">Tags</div>
        <div class="value">${escapeHtml(tags)}</div>
      </div>
      <div class="row">
        <div class="label">Notes</div>
        <div class="value">${escapeHtml(notes)}</div>
      </div>
    </body>
  </html>
  `.trim();
};

const toDate = (value: Date | string | undefined): Date => {
  if (!value) return new Date();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const normalize = (receipt: Partial<Receipt>) => {
  return {
    merchant: (receipt.merchant ?? '').trim(),
    amount: typeof receipt.amount === 'number' ? receipt.amount : 0,
    date: receipt.date ? toDate(receipt.date) : null,
    categoryId: receipt.categoryId ?? '',
    category: receipt.category ?? '',
    categoryColor: receipt.categoryColor ?? '',
    tags: (receipt.tags ?? []).slice().sort(),
    paymentMethod: (receipt.paymentMethod ?? '').trim(),
    notes: (receipt.notes ?? '').trim(),
    imageUri: receipt.imageUri ?? '',
  };
};

const toRgba = (hexOrColor: string, alpha: number) => {
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

export const ReceiptDetailScreen = ({ navigation, route }: Props) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedData, setEditedData] = useState<Partial<Receipt>>({});

  const [amountText, setAmountText] = useState('');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [loading, setLoading] = useState(true);

  const [parsed, setParsed] = useState<Awaited<ReturnType<typeof getReceiptParsedData>>>(null);
  const [items, setItems] = useState<Awaited<ReturnType<typeof getReceiptItemsByReceiptId>>>([]);
  const [latestOcr, setLatestOcr] = useState<Awaited<ReturnType<typeof getLatestReceiptOcr>>>(null);
  const [allImages, setAllImages] = useState<Awaited<ReturnType<typeof getReceiptImagesByReceiptId>>>([]);

  const [categoryOptions, setCategoryOptions] = useState<Array<{ id: string; name: string; color: string }>>([]);

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

  const loadReceipt = useCallback(async () => {
    try {
      setLoading(true);
      const receiptId = route.params.receiptId;

      // Prefer SQLite (source of truth for scanned receipts).
      const sql = await getReceiptByIdSql(receiptId);
      if (sql) {
        const [cat, tags, images, parsedRow, itemRows, ocrRow] = await Promise.all([
          getCategoryById(sql.categoryId).catch(() => null),
          getTagsForReceipt(receiptId).catch(() => []),
          getReceiptImagesByReceiptId(receiptId).catch(() => []),
          getReceiptParsedData(receiptId).catch(() => null),
          getReceiptItemsByReceiptId(receiptId).catch(() => []),
          getLatestReceiptOcr(receiptId).catch(() => null),
        ]);

        setParsed(parsedRow);
        setItems(itemRows);
        setLatestOcr(ocrRow);
        setAllImages(images);

        const originalImage = images.find((i) => i.imageType === 'original')?.filePath;

        const hydrated: Receipt = {
          id: sql.id,
          merchant: sql.merchant,
          amount: sql.amount,
          date: sql.date,
          categoryId: sql.categoryId,
          category: cat?.name ?? '',
          categoryColor: cat?.color ?? '',
          tags: tags.map((t) => t.name),
          paymentMethod: sql.paymentMethod ?? '',
          notes: sql.notes ?? '',
          imageUri: originalImage ?? sql.imageUri ?? undefined,
        };

        setReceipt(hydrated);
        setEditedData(hydrated);
        setAmountText(String(hydrated.amount));
        return;
      }

      const stored = await getReceiptById(receiptId);
      if (stored) {
        setReceipt(stored);
        setEditedData(stored);
        setAmountText(String(stored.amount));

        // Best-effort: hydrate OCR/parsed/items if present in SQLite.
        try {
          const [parsedRow, itemRows, ocrRow, images] = await Promise.all([
            getReceiptParsedData(receiptId).catch(() => null),
            getReceiptItemsByReceiptId(receiptId).catch(() => []),
            getLatestReceiptOcr(receiptId).catch(() => null),
            getReceiptImagesByReceiptId(receiptId).catch(() => []),
          ]);
          setParsed(parsedRow);
          setItems(itemRows);
          setLatestOcr(ocrRow);
          setAllImages(images);
        } catch {
          // ignore
        }
        return;
      }
      Alert.alert('Not found', 'Receipt not found. It may have been deleted.');
      navigation.goBack();
    } catch (error) {
      console.error('Error loading receipt:', error);
      Alert.alert('Error', 'Failed to load receipt');
    } finally {
      setLoading(false);
    }
  }, [navigation, route.params.receiptId]);

  const openOcrEditor = useCallback(() => {
    const receiptId = route.params.receiptId;
    if (!receiptId) return;

    if (!latestOcr) {
      Alert.alert('OCR not available', 'No OCR text is saved for this receipt yet.');
      return;
    }

    const original = allImages.find((i) => i.imageType === 'original')?.filePath;
    const parts = allImages
      .filter((i) => i.imageType === 'part')
      .sort((a, b) => (a.partNumber ?? 0) - (b.partNumber ?? 0))
      .map((i) => i.filePath);

    const primaryImageUri = original || parts[0] || receipt?.imageUri || '';
    const partImageUris = parts.length ? parts : primaryImageUri ? [primaryImageUri] : [];
    const source: 'single' | 'long' = parts.length ? 'long' : 'single';

    if (!primaryImageUri) {
      Alert.alert('Missing image', 'No receipt image is available to review OCR.');
      return;
    }

    navigation.navigate('ReceiptTextEditor', {
      source,
      receiptId,
      primaryImageUri,
      partImageUris,
      ocrTextOriginal: latestOcr.originalText ?? '',
      ocrTextInitial:
        (latestOcr.editedText && String(latestOcr.editedText).trim().length
          ? String(latestOcr.editedText)
          : latestOcr.originalText) ?? '',
      ocrRawJson: latestOcr.rawResultJson ?? undefined,
      ocrConfidence: typeof latestOcr.confidence === 'number' ? latestOcr.confidence : undefined,
      extracted: {},
    });
  }, [allImages, latestOcr, navigation, receipt?.imageUri, route.params.receiptId]);

  useEffect(() => {
    loadReceipt().catch(() => undefined);
  }, [loadReceipt]);

  useEffect(() => {
    getCategories()
      .then((cats) => setCategoryOptions(cats.map((c) => ({ id: c.id, name: c.name, color: c.color }))))
      .catch(() => setCategoryOptions([]));
  }, []);

  const handleToggleEdit = () => {
    if (isEditMode) {
      setEditedData(receipt ?? {});
      setAmountText(receipt ? String(receipt.amount) : '');
    }
    setIsEditMode(prev => !prev);
  };

  const handleFieldChange = <K extends keyof Receipt>(field: K, value: Receipt[K]) => {
    setEditedData(prev => ({ ...prev, [field]: value }));
  };

  const handleDateConfirm = (selectedDate: Date) => {
    handleFieldChange('date', selectedDate);
    setShowDatePicker(false);
  };

  const handleCategorySelect = (cat: { id: string; name: string; color: string }) => {
    setEditedData(prev => ({
      ...prev,
      categoryId: cat.id,
      category: cat.name,
      categoryColor: cat.color,
    }));
    setShowCategoryPicker(false);
  };

  const handleAddTag = (tagName: string) => {
    const currentTags = editedData.tags ?? [];
    if (!currentTags.includes(tagName)) {
      handleFieldChange('tags', [...currentTags, tagName]);
    }
  };

  const handleRemoveTag = (tagName: string) => {
    const currentTags = editedData.tags ?? [];
    handleFieldChange(
      'tags',
      currentTags.filter(t => t !== tagName),
    );
  };

  const handleSave = async () => {
    if (!receipt) return;

    try {
      setLoading(true);

      const merchant = (editedData.merchant ?? '').trim();
      const amount = Number.parseFloat(amountText);

      if (!merchant || !Number.isFinite(amount) || amount <= 0) {
        Alert.alert('Error', 'Merchant and amount are required');
        return;
      }

      const next: Receipt = {
        ...receipt,
        ...editedData,
        merchant,
        amount,
        date: editedData.date ? toDate(editedData.date) : receipt.date,
        tags: editedData.tags ?? [],
        paymentMethod: editedData.paymentMethod ?? '',
        notes: editedData.notes ?? '',
      };

      // Persist to both stores (AsyncStorage for legacy screens, SQLite for search/scanned receipts).
      await Promise.allSettled([
        upsertReceipt(next),
        updateReceiptSql(receipt.id, {
          merchant: next.merchant,
          amount: next.amount,
          date: toDate(next.date).toISOString(),
          categoryId: next.categoryId,
          paymentMethod: next.paymentMethod || undefined,
          notes: next.notes || undefined,
          imageUri: next.imageUri || undefined,
        } as any),
      ]);
      setReceipt(next);
      setEditedData(next);
      setIsEditMode(false);

      Alert.alert('Success', 'Receipt updated successfully');
    } catch (error) {
      console.error('Error saving receipt:', error);
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!receipt) return;

    Alert.alert(
      'Delete Receipt',
      'Are you sure you want to delete this receipt? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await Promise.allSettled([deleteReceiptById(receipt.id), deleteReceiptSql(receipt.id)]);
              navigation.goBack();
            } catch {
              Alert.alert('Error', 'Failed to delete receipt');
            }
          },
        },
      ],
    );
  };

  const handleExport = async () => {
    if (!receipt) return;

    try {
      if (receipt.imageUri) {
        await Share.open({
          url: receipt.imageUri,
          title: `Receipt - ${receipt.merchant}`,
        });
        return;
      }

      const pdf = await generatePDF({
        html: receiptToHtml(receipt),
        fileName: `receipt-${receipt.id}`,
        base64: false,
      });

      if (!pdf.filePath) {
        Alert.alert('Export', 'Failed to generate PDF');
        return;
      }

      const url = pdf.filePath.startsWith('file://') ? pdf.filePath : `file://${pdf.filePath}`;
      await Share.open({
        title: `Receipt - ${receipt.merchant}`,
        url,
        type: 'application/pdf',
      });
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const hasChanges = useMemo(() => {
    if (!receipt) return false;

    const a = normalize(receipt);
    const b = normalize({ ...editedData, amount: Number.parseFloat(amountText || '0') });

    return JSON.stringify(a) !== JSON.stringify(b);
  }, [amountText, editedData, receipt]);

  const isValid = useMemo(() => {
    const merchant = (editedData.merchant ?? receipt?.merchant ?? '').trim();
    const amount = Number.parseFloat(amountText);
    return Boolean(merchant) && Number.isFinite(amount) && amount > 0;
  }, [amountText, editedData.merchant, receipt?.merchant]);

  const displayMerchant = (isEditMode ? editedData.merchant : receipt?.merchant) ?? '';
  const displayAmount = isEditMode
    ? Number.parseFloat(amountText)
    : receipt?.amount ?? 0;

  const displayDate = useMemo(() => {
    const date = (isEditMode ? editedData.date : receipt?.date) ?? new Date();
    return toDate(date);
  }, [editedData.date, isEditMode, receipt?.date]);

  const displayCategoryName = (editedData.category ?? receipt?.category ?? '').trim();
  const displayCategoryId = (editedData.categoryId ?? receipt?.categoryId ?? '').trim();
  const displayCategoryColor = (editedData.categoryColor ?? receipt?.categoryColor ?? primary).trim();

  const tags = editedData.tags ?? receipt?.tags ?? [];
  const paymentMethodLabel = (editedData.paymentMethod ?? receipt?.paymentMethod ?? 'Other').trim() || 'Other';
  const notes = (editedData.notes ?? receipt?.notes ?? '').trim();

  const ocrAccuracyPct = useMemo(() => confidenceToPct(latestOcr?.confidence ?? null), [latestOcr?.confidence]);

  const confirmLeaveIfEditing = useCallback(
    (onLeave: () => void) => {
      if (isEditMode && hasChanges) {
        Alert.alert('Discard changes?', 'You have unsaved edits. Discard them and leave this screen?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onLeave },
        ]);
        return;
      }
      onLeave();
    },
    [hasChanges, isEditMode],
  );

  const goToTab = useCallback(
    (screen: 'Home' | 'Analytics' | 'Scan' | 'Calendar' | 'Profile') => {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [
            {
              name: 'BottomTabs',
              params: { screen },
            } as any,
          ],
        }),
      );
    },
    [navigation],
  );

  const paymentSelectedId = useMemo(() => {
    const match = PAYMENT_METHODS.find(m => m.label.toLowerCase() === paymentMethodLabel.toLowerCase());
    return match?.id;
  }, [paymentMethodLabel]);

  const rightAction = (
    <IconButton
      variant="ghost"
      accessibilityLabel={isEditMode ? 'Cancel edit' : 'Edit receipt'}
      onPress={handleToggleEdit}
      icon={<Feather name={isEditMode ? 'x' : 'edit-2'} size={ICON_SIZES.md} color={colors.text} />}
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title="Receipt Details" onBack={() => navigation.goBack()} rightAction={rightAction} showBackButton />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Receipt image */}
        {receipt?.imageUri ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open receipt image"
            onPress={() => setShowImageViewer(true)}
            style={styles.imagePressable}
          >
            <Image source={{ uri: receipt.imageUri }} style={styles.image} resizeMode="cover" />
            <View style={styles.zoomBadge}>
              <Feather name="zoom-in" size={ICON_SIZES.sm} color={colors.text} />
            </View>
          </Pressable>
        ) : (
          <Card style={styles.noImageCard} variant="outlined">
            <View style={styles.noImageInner}>
              <Feather name="file-text" size={ICON_SIZES.lg} color={colors.textSecondary} />
              <Text style={styles.noImageText}>No image attached</Text>
            </View>
          </Card>
        )}

        {/* Merchant */}
        {isEditMode ? (
          <Input
            value={displayMerchant}
            onChangeText={text => handleFieldChange('merchant', text)}
            placeholder="Merchant"
            style={styles.merchantInput}
            accessibilityLabel="Merchant name"
          />
        ) : (
          <Text style={styles.merchantText}>{displayMerchant}</Text>
        )}

        {/* Amount */}
        {isEditMode ? (
          <Input
            value={amountText}
            onChangeText={text => setAmountText(text.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            keyboardType="decimal-pad"
            leftIcon={<Text style={styles.amountPrefix}>$</Text>}
            style={styles.amountInput}
            accessibilityLabel="Amount"
          />
        ) : (
          <Text style={styles.amountText}>{formatCurrency(Number.isFinite(displayAmount) ? displayAmount : 0)}</Text>
        )}

        {/* Date */}
        <Text style={styles.sectionLabel}>Date</Text>
        <Card
          variant="default"
          onPress={() => setShowDatePicker(true)}
          accessibilityLabel="Select date"
          style={styles.fieldCard}
        >
          <View style={styles.fieldRow}>
            <Text style={styles.fieldValue}>{formatDate(displayDate, 'long')}</Text>
            <Feather name="calendar" size={ICON_SIZES.md} color={colors.textTertiary} />
          </View>
        </Card>

        {/* Category */}
        <Text style={styles.sectionLabel}>Category</Text>
        <Card
          variant="default"
          onPress={() => setShowCategoryPicker(true)}
          accessibilityLabel="Select category"
          style={styles.fieldCard}
        >
          <View style={styles.fieldRow}>
            <View style={styles.fieldLeft}>
              <Text style={styles.fieldValue} numberOfLines={1}>
                {displayCategoryName || 'Select category'}
              </Text>
              {displayCategoryName ? (
                <View style={[styles.categoryPill, { backgroundColor: toRgba(displayCategoryColor, 0.14) }]}>
                  <Text style={[styles.categoryPillText, { color: displayCategoryColor }]} numberOfLines={1}>
                    {displayCategoryName}
                  </Text>
                </View>
              ) : null}
            </View>
            <Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />
          </View>
        </Card>

        {/* Tags */}
        <Text style={styles.sectionLabel}>Tags</Text>
        <View style={styles.tagsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsScroll}>
            {tags.length ? (
              tags.map(tag => (
                <Chip
                  key={tag}
                  label={tag}
                  selected
                  onClose={isEditMode ? () => handleRemoveTag(tag) : undefined}
                  style={styles.tagChip}
                />
              ))
            ) : (
              <View style={styles.noTagsWrap}>
                <Text style={styles.noTagsText}>No tags</Text>
              </View>
            )}

            {isEditMode ? (
              <Chip
                label="+ Add Tag"
                selected={false}
                onPress={() => setShowTagPicker(true)}
                style={styles.addTagChip}
              />
            ) : null}
          </ScrollView>
        </View>

        {/* Payment */}
        <Text style={styles.sectionLabel}>Payment Method</Text>
        <Card
          variant="default"
          onPress={() => setShowPaymentPicker(true)}
          accessibilityLabel="Select payment method"
          style={styles.fieldCard}
        >
          <View style={styles.fieldRow}>
            <View style={styles.paymentLeft}>
              <Feather
                name={paymentMethodLabel.toLowerCase().includes('cash') ? 'dollar-sign' : 'credit-card'}
                size={ICON_SIZES.md}
                color={colors.textSecondary}
                style={styles.paymentIcon}
              />
              <Text style={styles.fieldValue}>{paymentMethodLabel}</Text>
            </View>
            <Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />
          </View>
        </Card>

        {/* Notes */}
        <Text style={styles.sectionLabel}>Notes</Text>
        {isEditMode ? (
          <Input
            value={notes}
            onChangeText={text => handleFieldChange('notes', text)}
            placeholder="Add notes..."
            multiline
            numberOfLines={4}
            style={styles.notesInput}
            accessibilityLabel="Notes"
          />
        ) : (
          <Card style={styles.notesCard} variant="default">
            <Text style={styles.notesText}>{notes || 'No notes'}</Text>
          </Card>
        )}

        {(latestOcr || parsed || (Array.isArray(items) && items.length)) ? (
          <>
            <Text style={styles.sectionLabel}>Extracted From OCR</Text>
            <Card style={styles.ocrCard} variant="default">
              <View style={styles.ocrMetaRow}>
                <Text style={styles.ocrMetaLabel}>Accuracy</Text>
                <Text style={styles.ocrMetaValue}>
                  {typeof ocrAccuracyPct === 'number' ? `${Math.round(ocrAccuracyPct)}%` : latestOcr ? 'Done' : '—'}
                </Text>
              </View>

              {parsed?.subtotal != null || parsed?.tax != null ? (
                <View style={styles.ocrMetaGrid}>
                  <View style={styles.ocrMetaCell}>
                    <Text style={styles.ocrMetaLabel}>Subtotal</Text>
                    <Text style={styles.ocrMetaValue}>{parsed?.subtotal != null ? formatCurrency(parsed.subtotal) : '—'}</Text>
                  </View>
                  <View style={styles.ocrMetaCell}>
                    <Text style={styles.ocrMetaLabel}>Tax</Text>
                    <Text style={styles.ocrMetaValue}>{parsed?.tax != null ? formatCurrency(parsed.tax) : '—'}</Text>
                  </View>
                  <View style={styles.ocrMetaCell}>
                    <Text style={styles.ocrMetaLabel}>Items</Text>
                    <Text style={styles.ocrMetaValue}>
                      {typeof parsed?.totalItems === 'number' && Number.isFinite(parsed.totalItems)
                        ? String(parsed.totalItems)
                        : Array.isArray(items)
                          ? String(items.length)
                          : '—'}
                    </Text>
                  </View>
                </View>
              ) : null}

              {parsed?.storeAddress ? (
                <View style={styles.ocrMetaRow}>
                  <Text style={styles.ocrMetaLabel}>Store</Text>
                  <Text style={styles.ocrMetaValue} numberOfLines={2}>
                    {parsed.storeAddress}
                  </Text>
                </View>
              ) : null}

              {parsed?.cashierName ? (
                <View style={styles.ocrMetaRow}>
                  <Text style={styles.ocrMetaLabel}>Cashier</Text>
                  <Text style={styles.ocrMetaValue}>{parsed.cashierName}</Text>
                </View>
              ) : null}

              {parsed?.paymentMethod ? (
                <View style={styles.ocrMetaRow}>
                  <Text style={styles.ocrMetaLabel}>Payment</Text>
                  <Text style={styles.ocrMetaValue}>{parsed.paymentMethod}</Text>
                </View>
              ) : null}

              <View style={{ height: SPACING.md }} />
              <Button
                title="Review / Edit OCR"
                onPress={openOcrEditor}
                variant="outline"
                accessibilityLabel="Review and edit OCR"
              />
            </Card>

            {Array.isArray(items) && items.length ? (
              <>
                <Text style={styles.sectionLabel}>Items</Text>
                <Card style={styles.itemsCard} variant="default">
                  {items.slice(0, 12).map((it) => (
                    <View key={it.id} style={styles.itemRow}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {it.quantity && it.quantity !== 1 ? `${it.quantity}× ` : ''}{it.itemName}
                      </Text>
                      <Text style={styles.itemPrice}>
                        {formatCurrency(Number.isFinite(it.totalPrice) ? it.totalPrice : 0)}
                      </Text>
                    </View>
                  ))}
                  {items.length > 12 ? (
                    <Text style={styles.itemsMoreHint}>+ {items.length - 12} more</Text>
                  ) : null}
                </Card>
              </>
            ) : null}
          </>
        ) : null}

        {/* Actions */}
        <View style={styles.actionsRow}>
          <Button
            title="Delete Receipt"
            onPress={handleDelete}
            variant="outline"
            style={styles.deleteBtn}
            accessibilityLabel="Delete receipt"
          />
          <Button
            title="Export"
            onPress={handleExport}
            variant="outline"
            icon={<Feather name="share" size={ICON_SIZES.sm} color={primary} />}
            style={styles.exportBtn}
            accessibilityLabel="Export receipt"
          />
        </View>

        {isEditMode ? (
          <Button
            title="Save Changes"
            onPress={() => {
              handleSave().catch(() => undefined);
            }}
            variant="primary"
            size="lg"
            fullWidth
            disabled={!hasChanges || !isValid || loading}
            style={styles.saveBtn}
            accessibilityLabel="Save changes"
          />
        ) : null}
      </ScrollView>

      {/* Footer actions to complete scan workflow */}
      <View style={styles.footer}>
        <View style={styles.footerActionsRow}>
          <View style={{ flex: 1 }}>
            <Button
              title="Done"
              variant="outline"
              accessibilityLabel="Done"
              onPress={() =>
                confirmLeaveIfEditing(() => {
                  goToTab('Home');
                })
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Scan More"
              variant="primary"
              accessibilityLabel="Scan more receipts"
              onPress={() =>
                confirmLeaveIfEditing(() => {
                  goToTab('Scan');
                })
              }
            />
          </View>
        </View>

        {/* Bottom menu (tab-like navigation) */}
        <View style={styles.bottomMenu}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Home"
            onPress={() => confirmLeaveIfEditing(() => goToTab('Home'))}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Feather name="home" size={18} color={colors.textSecondary} />
            <Text style={styles.menuLabel}>Home</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Analytics"
            onPress={() => confirmLeaveIfEditing(() => goToTab('Analytics'))}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Feather name="bar-chart-2" size={18} color={colors.textSecondary} />
            <Text style={styles.menuLabel}>Analytics</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan"
            onPress={() => confirmLeaveIfEditing(() => goToTab('Scan'))}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Feather name="camera" size={18} color={primary} />
            <Text style={[styles.menuLabel, { color: primary }]}>Scan</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Calendar"
            onPress={() => confirmLeaveIfEditing(() => goToTab('Calendar'))}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Feather name="calendar" size={18} color={colors.textSecondary} />
            <Text style={styles.menuLabel}>Calendar</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => confirmLeaveIfEditing(() => goToTab('Profile'))}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Feather name="settings" size={18} color={colors.textSecondary} />
            <Text style={styles.menuLabel}>Settings</Text>
          </Pressable>
        </View>
      </View>

      <LoadingOverlay visible={loading} />

      {receipt?.imageUri ? (
        <ImageViewerModal
          visible={showImageViewer}
          imageUri={receipt.imageUri}
          title={receipt.merchant}
          onClose={() => setShowImageViewer(false)}
        />
      ) : null}

      <DatePickerModal
        visible={showDatePicker}
        initialDate={displayDate}
        onConfirm={handleDateConfirm}
        onClose={() => setShowDatePicker(false)}
      />

      <CategoryPickerModal
        visible={showCategoryPicker}
        selectedId={displayCategoryId}
        categories={categoryOptions}
        onSelect={handleCategorySelect}
        onClose={() => setShowCategoryPicker(false)}
      />

      <OptionPickerModal
        visible={showPaymentPicker}
        title="Payment Method"
        selectedId={paymentSelectedId}
        items={PAYMENT_METHODS.map(m => ({
          id: m.id,
          label: m.label,
          icon: <Feather name={m.iconName} size={ICON_SIZES.md} color={colors.textSecondary} />,
        }))}
        onSelect={(item: OptionItem) => handleFieldChange('paymentMethod', item.label)}
        onClose={() => setShowPaymentPicker(false)}
      />

      <OptionPickerModal
        visible={showTagPicker}
        title="Add Tag"
        selectedId={undefined}
        items={Array.from(DEFAULT_TAG_SUGGESTIONS).map(t => ({ id: t.toLowerCase(), label: t }))}
        onSelect={(item: OptionItem) => handleAddTag(item.label)}
        onClose={() => setShowTagPicker(false)}
      />
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
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
  primary: string;
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: 200,
    },

    footer: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      gap: SPACING.sm,
    },
    footerActionsRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    bottomMenu: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: SPACING.sm,
    },
    menuItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.lg,
    },
    menuItemPressed: {
      opacity: 0.85,
      backgroundColor: `${primary}14`,
    },
    menuLabel: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginTop: 4,
    } satisfies TextStyle,

    imagePressable: {
      width: '100%',
      height: 200,
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
      marginTop: SPACING.lg,
      marginBottom: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    zoomBadge: {
      position: 'absolute',
      right: SPACING.md,
      bottom: SPACING.md,
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: toRgba(colors.surface, 0.85),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },

    noImageCard: {
      marginTop: SPACING.lg,
      marginBottom: 24,
      height: 120,
      justifyContent: 'center',
    },
    noImageInner: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noImageText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      marginTop: SPACING.sm,
    },

    merchantText: {
      ...TYPOGRAPHY.pageTitle,
      color: colors.text,
      marginBottom: SPACING.sm,
    },
    merchantInput: {
      marginBottom: SPACING.sm,
    },

    amountText: {
      fontSize: 28,
      fontWeight: '600',
      color: primary,
      marginBottom: 24,
    },
    amountInput: {
      marginBottom: 32,
    },
    amountPrefix: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textSecondary,
    } satisfies TextStyle,

    sectionLabel: {
      ...TYPOGRAPHY.label,
      color: colors.textSecondary,
      marginBottom: SPACING.sm,
    },

    fieldCard: {
      marginBottom: SPACING.lg,
    },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    fieldLeft: {
      flex: 1,
      paddingRight: SPACING.md,
    },
    fieldValue: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
    } satisfies TextStyle,

    categoryPill: {
      marginTop: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 6,
      borderRadius: RADIUS.full,
      alignSelf: 'flex-start',
    },
    categoryPillText: {
      ...TYPOGRAPHY.caption,
      fontWeight: '700',
    } satisfies TextStyle,

    tagsRow: {
      marginBottom: SPACING.lg,
    },
    tagsScroll: {
      alignItems: 'center',
      paddingRight: SPACING.md,
    },
    tagChip: {
      marginRight: SPACING.sm,
    },
    addTagChip: {
      marginRight: SPACING.sm,
      backgroundColor: 'transparent',
    },
    noTagsWrap: {
      paddingVertical: SPACING.xs,
      marginRight: SPACING.sm,
    },
    noTagsText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
    },

    paymentLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      paddingRight: SPACING.md,
    },
    paymentIcon: {
      marginRight: SPACING.sm,
    },

    notesInput: {
      marginBottom: SPACING.lg,
    },
    notesCard: {
      marginBottom: SPACING.lg,
    },
    notesText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
    },

    ocrCard: {
      marginBottom: SPACING.lg,
      padding: SPACING.md,
    },
    ocrMetaRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPACING.md,
      marginBottom: SPACING.xs,
    },
    ocrMetaGrid: {
      flexDirection: 'row',
      gap: SPACING.md,
      marginTop: SPACING.sm,
    },
    ocrMetaCell: {
      flex: 1,
    },
    ocrMetaLabel: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
    } satisfies TextStyle,
    ocrMetaValue: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      marginTop: 2,
      flexShrink: 1,
    } satisfies TextStyle,

    itemsCard: {
      marginBottom: SPACING.lg,
      paddingVertical: SPACING.xs,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    itemName: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      flex: 1,
      paddingRight: SPACING.md,
    } satisfies TextStyle,
    itemPrice: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '700',
    } satisfies TextStyle,
    itemsMoreHint: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    } satisfies TextStyle,

    actionsRow: {
      flexDirection: 'row',
      marginBottom: SPACING.lg,
    },
    deleteBtn: {
      flex: 1,
      marginRight: SPACING.sm,
      borderColor: colors.border,
    } satisfies ViewStyle,
    exportBtn: {
      flex: 1,
      marginLeft: SPACING.sm,
    } satisfies ViewStyle,

    saveBtn: {
      marginTop: SPACING.md,
    },
  });
