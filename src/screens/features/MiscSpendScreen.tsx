import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import { SwipeListView } from 'react-native-swipe-list-view';

import { Button, Card, Chip, IconButton, Input } from '@/components/common';
import { EmptyState, Header, LoadingOverlay } from '@/components/compositions';
import { DatePickerModal } from '@/components/modals/DatePickerModal';
import { COLORS, GRADIENTS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrency, formatDate } from '@/utils/format';
import { deleteMiscExpenseById, listMiscExpenses, upsertMiscExpense, type MiscExpense } from '@/utils/miscSpendStore';

type Props = NativeStackScreenProps<MainStackParamList, 'MiscSpend'>;

type Period = 'week' | 'month' | 'custom';

const QUICK_CATEGORIES = [
  { id: 'food', name: 'Food', color: '#10b981', icon: '🍔' },
  { id: 'transport', name: 'Transport', color: '#3b82f6', icon: '🚗' },
  { id: 'shopping', name: 'Shopping', color: '#a855f7', icon: '🛍️' },
  { id: 'entertainment', name: 'Entertainment', color: '#f59e0b', icon: '🎬' },
  { id: 'health', name: 'Health', color: '#ef4444', icon: '💊' },
  { id: 'other', name: 'Other', color: '#6b7280', icon: '✨' },
] as const;

const toDate = (value: string | Date): Date => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const parseAmount = (text: string): number => {
  const normalized = text.replace(/[^0-9.]/g, '');
  if (!normalized) return 0;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
};

const formatAmountText = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
};

const getPeriodRange = (period: Period, custom: { start: Date; end: Date } | null) => {
  const now = new Date();

  switch (period) {
    case 'week': {
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { start: startOfDay(start), end: endOfDay(now) };
    }
    case 'month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) };
    case 'custom':
    default: {
      const fallback = { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) };
      if (!custom) return fallback;
      const s = startOfDay(custom.start);
      const e = endOfDay(custom.end);
      return s <= e ? { start: s, end: e } : { start: startOfDay(custom.end), end: endOfDay(custom.start) };
    }
  }
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

const CategoryPill = ({ label, color }: { label: string; color: string }) => {
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          paddingHorizontal: SPACING.sm,
          paddingVertical: SPACING.xs,
          borderRadius: RADIUS.full,
          backgroundColor: toRgba(color, 0.14),
        },
        text: {
          ...TYPOGRAPHY.caption,
          fontWeight: '700',
          color,
        },
      }),
    [color],
  );

  return (
    <View style={styles.container} accessibilityRole="text">
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

export const MiscSpendScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const primary = COLORS.brand.primary;

  const [period, setPeriod] = useState<Period>('month');
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | null>(null);
  const [pendingCustom, setPendingCustom] = useState<{ start: Date; end: Date } | null>(null);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<(typeof QUICK_CATEGORIES)[number]['id']>('food');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expenses, setExpenses] = useState<MiscExpense[]>([]);

  const [errors, setErrors] = useState<{ amount?: string; description?: string }>({});
  const [adding, setAdding] = useState(false);

  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const styles = useMemo(() => createStyles({ colors, primary, insetBottom: insets.bottom }), [colors, insets.bottom, primary]);

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);

    Animated.timing(toastAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();

    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }, 1200);

    // message is kept simple; could be extended to stateful text later.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = message;
  }, [toastAnim]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listMiscExpenses();
      setExpenses(data);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load misc expenses', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      const data = await listMiscExpenses();
      setExpenses(data);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const activeRange = useMemo(() => getPeriodRange(period, customRange), [customRange, period]);

  const filtered = useMemo(() => {
    const start = activeRange.start.getTime();
    const end = activeRange.end.getTime();

    return expenses
      .filter(e => {
        const t = toDate(e.date).getTime();
        return t >= start && t <= end;
      })
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
  }, [activeRange.end, activeRange.start, expenses]);

  const total = useMemo(() => filtered.reduce((sum, e) => sum + e.amount, 0), [filtered]);

  const selectedCategory = useMemo(() => QUICK_CATEGORIES.find(c => c.id === selectedCategoryId) ?? QUICK_CATEGORIES[0], [selectedCategoryId]);

  const validate = useCallback(() => {
    const next: typeof errors = {};

    const amt = parseAmount(amountText);
    const desc = description.trim();

    if (!(amt > 0)) next.amount = 'Enter an amount greater than 0.';
    if (!desc) next.description = 'Description is required.';

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [amountText, description, errors]);

  const handleAdd = useCallback(async () => {
    if (adding) return;

    const ok = validate();
    if (!ok) return;

    const amt = parseAmount(amountText);
    const desc = description.trim();

    try {
      setAdding(true);

      const expense: MiscExpense = {
        id: Date.now().toString(),
        amount: amt,
        description: desc,
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
        date: new Date().toISOString(),
      };

      await upsertMiscExpense(expense);
      const next = [expense, ...expenses];
      setExpenses(next);

      setAmountText('');
      setDescription('');
      setErrors({});

      showToast('Added');
    } catch {
      Alert.alert('Error', 'Failed to add expense');
    } finally {
      setAdding(false);
    }
  }, [adding, amountText, description, expenses, selectedCategory.id, selectedCategory.name, showToast, validate]);

  const confirmDelete = useCallback(
    (id: string) => {
      Alert.alert('Delete Expense', 'Are you sure you want to delete this expense?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMiscExpenseById(id);
              setExpenses(prev => prev.filter(e => e.id !== id));
            } catch {
              Alert.alert('Error', 'Failed to delete expense');
            }
          },
        },
      ]);
    },
    [],
  );

  const onSelectPeriod = useCallback(
    (p: Period) => {
      setPeriod(p);
      if (p === 'custom') {
        const start = customRange?.start ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const end = customRange?.end ?? new Date();
        setPendingCustom({ start, end });
        setShowStartPicker(true);
      }
    },
    [customRange],
  );

  const periodLabel = useMemo(() => {
    if (period === 'week') return 'Week';
    if (period === 'month') return 'Month';
    return 'Custom';
  }, [period]);

  const rangeLabel = useMemo(() => {
    const s = activeRange.start;
    const e = activeRange.end;
    if (period !== 'custom') return `${periodLabel}: ${formatDate(s, 'short')} – ${formatDate(e, 'short')}`;
    return `Custom: ${formatDate(s, 'short')} – ${formatDate(e, 'short')}`;
  }, [activeRange.end, activeRange.start, period, periodLabel]);

  const amountValue = useMemo(() => parseAmount(amountText), [amountText]);
  const canAdd = amountText.trim().length > 0 && description.trim().length > 0;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MiscExpense>) => {
      const cat = QUICK_CATEGORIES.find(c => c.id === item.categoryId);
      const color = cat?.color ?? COLORS.chart[0];

      return (
        <Card variant="default" style={styles.itemCard}>
          <View style={styles.itemRow}>
            <View style={styles.itemLeft}>
              <Text style={styles.itemDesc} numberOfLines={1}>
                {item.description}
              </Text>
              <View style={styles.itemMetaRow}>
                <CategoryPill label={item.categoryName} color={color} />
                <Text style={styles.itemDate}>{formatDate(item.date, 'short')}</Text>
              </View>
            </View>

            <View style={styles.itemRight}>
              <Text style={styles.itemAmount}>{formatCurrency(item.amount)}</Text>
              <IconButton
                accessibilityLabel="Delete expense"
                variant="ghost"
                size="sm"
                onPress={() => confirmDelete(item.id)}
                icon={<Feather name="trash-2" size={ICON_SIZES.sm} color={colors.textSecondary} />}
              />
            </View>
          </View>
        </Card>
      );
    },
    [colors.textSecondary, confirmDelete, styles],
  );

  const renderHidden = useCallback(
    ({ item }: ListRenderItemInfo<MiscExpense>) => {
      return (
        <View style={styles.hiddenRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete"
            onPress={() => confirmDelete(item.id)}
            style={({ pressed }) => [styles.deleteAction, pressed && styles.deletePressed]}
          >
            <Feather name="trash-2" size={ICON_SIZES.md} color={COLORS.common.white} />
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      );
    },
    [confirmDelete, styles],
  );

  const listHeader = useMemo(() => {
    return (
      <View>
        <View style={styles.periodRow}>
          <Chip label="Month" selected={period === 'month'} onPress={() => onSelectPeriod('month')} />
          <View style={{ width: SPACING.sm }} />
          <Chip label="Week" selected={period === 'week'} onPress={() => onSelectPeriod('week')} />
          <View style={{ width: SPACING.sm }} />
          <Chip label="Custom" selected={period === 'custom'} onPress={() => onSelectPeriod('custom')} />
        </View>

        <Text style={styles.rangeLabel}>{rangeLabel}</Text>

        <Card variant="default" style={styles.quickAddCard}>
          <Text style={styles.quickTitle}>Quick Add</Text>

          <View style={styles.amountRow}>
            <View style={styles.amountCol}>
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
                error={errors.amount}
                accessibilityLabel="Amount"
              />
            </View>
          </View>

          <Input
            value={description}
            onChangeText={t => {
              setDescription(t);
              if (errors.description) setErrors(prev => ({ ...prev, description: undefined }));
            }}
            placeholder="What did you buy?"
            label="Description"
            error={errors.description}
            style={styles.descInput}
          />

          <Text style={styles.categoryLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryChips}>
            {QUICK_CATEGORIES.map(cat => {
              const selected = cat.id === selectedCategoryId;
              return (
                <Pressable
                  key={cat.id}
                  accessibilityRole="button"
                  accessibilityLabel={cat.name}
                  onPress={() => setSelectedCategoryId(cat.id)}
                  style={({ pressed }) => [styles.categoryChip, selected && styles.categoryChipSelected, pressed && styles.categoryChipPressed]}
                >
                  <Text style={styles.categoryChipIcon}>{cat.icon}</Text>
                  <Text style={[styles.categoryChipText, selected && { color: COLORS.common.white }]}>{cat.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Button
            title={adding ? 'Adding…' : 'Add'}
            onPress={handleAdd}
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canAdd || adding}
            loading={adding}
            icon={<Feather name="plus" size={ICON_SIZES.sm} color={COLORS.common.white} />}
          />
        </Card>

        <Text style={styles.listTitle}>Expenses</Text>
      </View>
    );
  }, [
    adding,
    amountText,
    amountValue,
    canAdd,
    description,
    errors.amount,
    errors.description,
    handleAdd,
    onSelectPeriod,
    period,
    rangeLabel,
    selectedCategoryId,
    styles,
  ]);

  const empty = !loading && filtered.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title="Misc. Spend" onBack={() => navigation.goBack()} showBackButton />

      {empty ? (
        <EmptyState
          icon={<Feather name="zap" size={80} color={colors.textTertiary} />}
          title="No Expenses Yet"
          description="Quick log small purchases and keep track of your spending."
          action={{ label: 'Add One Above', onPress: () => undefined }}
        />
      ) : (
        <KeyboardAvoidingView style={styles.flex1} behavior={Platform.select({ ios: 'padding', android: undefined })}>
          <SwipeListView
            data={filtered}
            keyExtractor={(item: MiscExpense) => item.id}
            renderItem={renderItem}
            renderHiddenItem={renderHidden}
            rightOpenValue={-92}
            disableRightSwipe
            closeOnRowPress
            closeOnRowOpen
            closeOnScroll
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={listHeader}
            showsVerticalScrollIndicator={false}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        </KeyboardAvoidingView>
      )}

      {/* Sticky total card */}
      <Card variant="glassmorphism" style={styles.totalCard}>
        <LinearGradient
          colors={Array.from([`${primary}22`, `${primary}10`])}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.totalRow}>
          <View>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalRange} numberOfLines={1}>
              {period === 'custom'
                ? `${formatDate(activeRange.start, 'short')} – ${formatDate(activeRange.end, 'short')}`
                : periodLabel}
            </Text>
          </View>
          <Text style={styles.totalAmount}>{formatCurrency(total)}</Text>
        </View>
      </Card>

      {/* Tiny toast */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          {
            transform: [
              {
                translateY: toastAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-16, 0],
                }),
              },
            ],
            opacity: toastAnim,
          },
        ]}
      >
        <View style={styles.toastInner}>
          <Feather name="check" size={ICON_SIZES.sm} color={COLORS.common.white} />
          <Text style={styles.toastText}>Added</Text>
        </View>
      </Animated.View>

      {/* Custom range pickers */}
      <DatePickerModal
        visible={showStartPicker}
        initialDate={pendingCustom?.start ?? new Date()}
        onConfirm={(d: Date) => {
          const next = { start: d, end: pendingCustom?.end ?? d };
          setPendingCustom(next);
          setShowStartPicker(false);
          setShowEndPicker(true);
        }}
        onClose={() => {
          setShowStartPicker(false);
          if (period === 'custom' && !customRange) setPeriod('month');
        }}
      />

      <DatePickerModal
        visible={showEndPicker}
        initialDate={pendingCustom?.end ?? new Date()}
        onConfirm={(d: Date) => {
          const next = { start: pendingCustom?.start ?? d, end: d };
          setPendingCustom(next);
          setCustomRange(next);
          setShowEndPicker(false);
        }}
        onClose={() => {
          setShowEndPicker(false);
          if (period === 'custom' && !customRange) setPeriod('month');
        }}
      />

      <LoadingOverlay visible={loading} message="Loading expenses…" />
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
  primary,
  insetBottom,
}: {
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
    border: string;
    disabled: string;
  };
  primary: string;
  insetBottom: number;
}) => {
  const label: TextStyle = { ...TYPOGRAPHY.label, color: colors.textSecondary };

  const totalBottom = clamp(24 + insetBottom, 24, 48 + insetBottom);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex1: {
      flex: 1,
    },

    periodRow: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
    },
    rangeLabel: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      paddingHorizontal: SPACING.lg,
      marginTop: SPACING.sm,
      marginBottom: SPACING.md,
    },

    quickAddCard: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
      padding: SPACING.lg,
    },
    quickTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      marginBottom: SPACING.md,
      textAlign: 'center',
    },

    amountRow: {
      marginBottom: SPACING.md,
    },
    amountCol: {
      flex: 1,
    },
    amountLabel: {
      ...label,
      marginBottom: SPACING.xs,
    },
    amountDisplay: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.text,
      marginBottom: SPACING.sm,
    },

    descInput: {
      marginBottom: SPACING.md,
    },

    categoryLabel: {
      ...label,
      marginBottom: SPACING.sm,
    },
    categoryChips: {
      paddingBottom: SPACING.md,
      marginBottom: SPACING.sm,
    },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      marginRight: SPACING.sm,
    },
    categoryChipSelected: {
      borderColor: 'transparent',
      backgroundColor: primary,
    },
    categoryChipPressed: {
      opacity: 0.85,
    },
    categoryChipIcon: {
      marginRight: SPACING.xs,
      fontSize: 14,
    },
    categoryChipText: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      fontWeight: '700',
    },

    listTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.sm,
    },

    listContent: {
      paddingBottom: 140,
    },

    itemCard: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
      padding: SPACING.md,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    itemLeft: {
      flex: 1,
      paddingRight: SPACING.md,
    },
    itemRight: {
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    itemDesc: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '700',
      marginBottom: SPACING.xs,
    },
    itemMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    itemDate: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginLeft: SPACING.sm,
    },
    itemAmount: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
      marginBottom: SPACING.xs,
    },

    hiddenRow: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
      height: 92,
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'flex-end',
      backgroundColor: toRgba(COLORS.semantic.error, 0.12),
    },
    deleteAction: {
      width: 92,
      height: '100%',
      backgroundColor: COLORS.semantic.error,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deletePressed: {
      opacity: 0.85,
    },
    deleteText: {
      ...TYPOGRAPHY.caption,
      color: COLORS.common.white,
      marginTop: 4,
      fontWeight: '800',
    },

    totalCard: {
      position: 'absolute',
      left: SPACING.lg,
      right: SPACING.lg,
      bottom: totalBottom,
      padding: SPACING.lg,
    },
    totalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    totalLabel: {
      ...label,
    },
    totalRange: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginTop: 2,
      maxWidth: 180,
    },
    totalAmount: {
      fontSize: 22,
      fontWeight: '900',
      color: colors.text,
    },

    toast: {
      position: 'absolute',
      top: 8,
      alignSelf: 'center',
    },
    toastInner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.semantic.success,
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      gap: SPACING.xs,
      overflow: 'hidden',
    },
    toastText: {
      ...TYPOGRAPHY.caption,
      color: COLORS.common.white,
      fontWeight: '800',
    },
  });
};

export default MiscSpendScreen;
