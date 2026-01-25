import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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

const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'Food & Dining', color: '#10b981' },
  { id: 'groceries', name: 'Groceries', color: '#22c55e' },
  { id: 'transport', name: 'Transport', color: '#3b82f6' },
  { id: 'shopping', name: 'Shopping', color: '#a855f7' },
  { id: 'health', name: 'Health', color: '#ef4444' },
  { id: 'misc', name: 'Misc', color: '#f59e0b' },
] as const;

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

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

  const loadReceipt = useCallback(async () => {
    try {
      setLoading(true);
      const receiptId = route.params.receiptId;

      const stored = await getReceiptById(receiptId);
      if (stored) {
        setReceipt(stored);
        setEditedData(stored);
        setAmountText(String(stored.amount));
        return;
      }

      const mockReceipt: Receipt = {
        id: receiptId,
        merchant: 'Starbucks Coffee',
        amount: 15.5,
        date: new Date('2024-01-15'),
        category: 'Food & Dining',
        categoryId: 'food',
        categoryColor: '#10b981',
        tags: ['Business', 'Coffee'],
        paymentMethod: 'Credit Card',
        notes: 'Morning coffee meeting with client',
        imageUri: undefined,
      };

      setReceipt(mockReceipt);
      setEditedData(mockReceipt);
      setAmountText(String(mockReceipt.amount));

      await upsertReceipt(mockReceipt);
    } catch (error) {
      console.error('Error loading receipt:', error);
      Alert.alert('Error', 'Failed to load receipt');
    } finally {
      setLoading(false);
    }
  }, [route.params.receiptId]);

  useEffect(() => {
    loadReceipt().catch(() => undefined);
  }, [loadReceipt]);

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

      await upsertReceipt(next);
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
              await deleteReceiptById(receipt.id);
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
        categories={Array.from(DEFAULT_CATEGORIES)}
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
    scrollContent: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.xl,
    },

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
