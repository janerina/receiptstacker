import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { Button, Card, IconButton, Input } from '@/components/common';
import { EmptyState, LoadingOverlay } from '@/components/compositions';
import { DatePickerModal } from '@/components/modals/DatePickerModal';
import { DateRangePickerModal } from '@/components/modals/DateRangePickerModal';
import { COLORS, GRADIENTS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useApp } from '@/contexts/AppContext';
import type { MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { themedAlert } from '@/services/themedAlert';
import { formatCurrency, formatDate } from '@/utils/format';
import { listBudgets } from '@/utils/budgetStore';
import { deleteMiscExpenseById, listMiscExpenses, upsertMiscExpense, type MiscExpense } from '@/utils/miscSpendStore';
import { listMiscSpendCategories, type MiscSpendCategory } from '@/utils/miscSpendCategoriesStore';
import { normalizeMiscSpendCategoryId } from '@/utils/miscSpendUtils';

type Props = NativeStackScreenProps<MainStackParamList, 'MiscSpend'>;

type Period = 'thisMonth' | 'lastMonth' | 'weekly' | 'custom';

type MiscCategory = {
  id: string;
  name: string;
  color: string;
  icon: string;
};

// Matches the screenshot set used for Misc. Spend.
const DEFAULT_MISC_CATEGORIES: MiscCategory[] = [
  { id: 'social', name: 'Social', color: '#f97316', icon: 'coffee' },
  { id: 'food', name: 'Food', color: '#22c55e', icon: 'utensils' },
  { id: 'entertainment', name: 'Entertainment', color: '#a855f7', icon: 'film' },
  { id: 'transport', name: 'Transport', color: '#3b82f6', icon: 'dollar-sign' },
  { id: 'gifts', name: 'Gifts', color: '#ec4899', icon: 'gift' },
  { id: 'other', name: 'Other', color: '#94a3b8', icon: 'tag' },
];

const toDate = (value: string | Date): Date => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

const startOfWeekMonday = (d: Date) => {
  const day = d.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  return startOfDay(addDays(d, delta));
};

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
    case 'weekly': {
      const start = startOfWeekMonday(now);
      const end = addDays(start, 6);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    case 'lastMonth': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const start = new Date(prev.getFullYear(), prev.getMonth(), 1);
      const end = new Date(prev.getFullYear(), prev.getMonth() + 1, 0);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    case 'thisMonth':
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

const isLikelyEmoji = (value: string) => /[^\u0000-\u007F]/.test(value);

const emojiForCategoryId = (id: string): string => {
  const base = (id ?? '').trim();
  if (!base) return '📦';

  // Receipt categories are prefixed for uniqueness in this screen.
  const rawId = base.startsWith('rcpt-') ? base.slice('rcpt-'.length) : base;
  const normalized = normalizeMiscSpendCategoryId(rawId);

  switch (normalized) {
    case 'groceries':
      return '🛒';
    case 'transport':
      return '🚗';
    case 'shopping':
      return '🛍️';
    case 'food':
      return '🍔';
    case 'entertainment':
      return '🎬';
    case 'utilities':
      return '💡';
    case 'health':
      return '🏥';
    case 'travel':
      return '✈️';
    case 'bills':
      return '📦';
    case 'social':
      return '☕';
    case 'gifts':
      return '🎁';
    default:
      return '📦';
  }
};

const emojiForCategory = (c: MiscCategory): string => {
  if (isLikelyEmoji(c.icon)) return c.icon;
  return emojiForCategoryId(c.id);
};

const displayCategoryLabel = (c: MiscCategory): string => {
  const emoji = emojiForCategory(c);
  const name = (c.name ?? '').trim();
  return emoji ? `${emoji} ${name}`.trim() : name;
};

const CategoryIcon = ({ icon, color, size = 18 }: { icon: string; color: string; size?: number }) => {
  if (!icon) return null;
  if (isLikelyEmoji(icon)) {
    return (
      <Text style={{ fontSize: size, lineHeight: size + 2 }} accessibilityRole="text">
        {icon}
      </Text>
    );
  }
  return <Feather name={icon} size={size} color={color} />;
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
  const { colors, isDark } = useTheme();
  const { categories: appCategories, loadCategories } = useApp();
  const insets = useSafeAreaInsets();
  const primary = COLORS.brand.primary;

  const listRef = useRef<any>(null);
  const quickAddAnchorY = useRef<number | null>(null);
  const customRangeAnchorRef = useRef<View>(null);

  const [period, setPeriod] = useState<Period>('thisMonth');
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | null>(null);
  const [customTempStart, setCustomTempStart] = useState<Date | null>(null);
  const [customTempEnd, setCustomTempEnd] = useState<Date | null>(null);

  const [showRangePicker, setShowRangePicker] = useState(false);

  const [quickAddDate, setQuickAddDate] = useState<Date>(() => new Date());
  const [showQuickAddDatePicker, setShowQuickAddDatePicker] = useState(false);

  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('social');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [customCategories, setCustomCategories] = useState<MiscSpendCategory[]>([]);

  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const scrollToQuickAdd = useCallback(() => {
    const y = quickAddAnchorY.current ?? 0;
    const offset = Math.max(y - SPACING.sm, 0);
    listRef.current?.scrollToOffset?.({ offset, animated: true });
  }, []);

  useEffect(() => {
    if (!quickAddOpen) return;
    requestAnimationFrame(scrollToQuickAdd);
  }, [quickAddOpen, scrollToQuickAdd]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expenses, setExpenses] = useState<MiscExpense[]>([]);

  const [errors, setErrors] = useState<{ amount?: string; description?: string }>({});
  const [adding, setAdding] = useState(false);

  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const styles = useMemo(
    () => createStyles({ colors, isDark, primary, insetBottom: insets.bottom }),
    [colors, insets.bottom, isDark, primary],
  );

  const openQuickAddFromHeader = useCallback(() => {
    setCategoryDropdownOpen(false);

    if (quickAddOpen) {
      requestAnimationFrame(scrollToQuickAdd);
      return;
    }

    setQuickAddOpen(true);
  }, [quickAddOpen, scrollToQuickAdd]);

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
      const [data, cats] = await Promise.all([listMiscExpenses(), listMiscSpendCategories()]);
      setExpenses(data);
      setCustomCategories(cats);
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

  useEffect(() => {
    // Ensure global receipt categories are available for the Quick Add dropdown.
    loadCategories().catch(() => undefined);
  }, [loadCategories]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      const [data, cats] = await Promise.all([listMiscExpenses(), listMiscSpendCategories()]);
      setExpenses(data);
      setCustomCategories(cats);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const categories = useMemo(() => {
    const merged = [...DEFAULT_MISC_CATEGORIES, ...customCategories];
    const seen = new Set<string>();
    return merged.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [customCategories]);

  const receiptCategoriesForQuickAdd = useMemo<MiscCategory[]>(() => {
    return (appCategories ?? []).map(c => ({
      id: `rcpt-${c.id}`,
      name: c.name,
      color: c.color,
      icon: c.icon,
    }));
  }, [appCategories]);

  const quickAddCategories = useMemo<MiscCategory[]>(() => {
    // Screen reference shows receipt categories first (e.g., Groceries, Transportation, etc.).
    // Keep Misc defaults available, but list them after receipt categories.
    const merged = [...receiptCategoriesForQuickAdd, ...categories];
    const seenNames = new Set<string>();
    return merged.filter(c => {
      const key = c.name.trim().toLowerCase();
      if (!key) return false;
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });
  }, [categories, receiptCategoriesForQuickAdd]);

  const activeRange = useMemo(() => getPeriodRange(period, customRange), [customRange, period]);

  useEffect(() => {
    const now = new Date();
    const clamped = now < activeRange.start ? activeRange.start : now > activeRange.end ? activeRange.end : now;
    setQuickAddDate(clamped);
  }, [activeRange.end, activeRange.start, period]);

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

  const totalForPeriod = useMemo(() => {
    const start = activeRange.start.getTime();
    const end = activeRange.end.getTime();
    return expenses
      .filter(e => {
        const t = toDate(e.date).getTime();
        return t >= start && t <= end;
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }, [activeRange.end, activeRange.start, expenses]);

  const selectedCategory = useMemo(
    () => quickAddCategories.find(c => c.id === selectedCategoryId) ?? quickAddCategories[0] ?? DEFAULT_MISC_CATEGORIES[0],
    [quickAddCategories, selectedCategoryId],
  );

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
        date: quickAddDate.toISOString(),
      };

      await upsertMiscExpense(expense);
      const next = [expense, ...expenses];
      setExpenses(next);

      setAmountText('');
      setDescription('');
      setErrors({});

      showToast('Added');

      try {
        const normalizedCategoryId = normalizeMiscSpendCategoryId(selectedCategory.id);
        const budgets = await listBudgets().catch(() => []);
        const hasBudget = budgets.some(b => b?.categoryId === normalizedCategoryId);

        if (!hasBudget) {
          themedAlert(
            'No Budget Assigned',
            'No Budget is assigned for this category. Do you want to add Budget to this category?',
            [
              { text: 'No', style: 'cancel' },
              {
                text: 'Yes',
                onPress: () => {
                  navigation.navigate('BottomTabs', {
                    screen: 'Home',
                    params: { screen: 'Budget' },
                  });
                },
              },
            ],
          );
        }
      } catch {
        // If budget lookup fails, don't block adding misc expense.
      }
    } catch {
      themedAlert('Error', 'Failed to add expense');
    } finally {
      setAdding(false);
    }
  }, [adding, amountText, description, expenses, navigation, quickAddDate, selectedCategory.id, selectedCategory.name, showToast, validate]);

  const confirmDelete = useCallback(
    (id: string) => {
      themedAlert('Delete Expense', 'Are you sure you want to delete this expense?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMiscExpenseById(id);
              setExpenses(prev => prev.filter(e => e.id !== id));
            } catch {
              themedAlert('Error', 'Failed to delete expense');
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
      setCategoryDropdownOpen(false);
      if (p === 'custom') {
        setCustomTempStart(customRange?.start ?? null);
        setCustomTempEnd(customRange?.end ?? null);
      }
    },
    [customRange],
  );

  const periodLabel = useMemo(() => {
    if (period === 'weekly') return 'Weekly';
    if (period === 'lastMonth') return 'Last Month';
    if (period === 'thisMonth') return 'This Month';
    return 'Custom';
  }, [period]);

  const rangeLabel = useMemo(() => {
    const s = activeRange.start;
    const e = activeRange.end;
    if (period === 'custom') return `${formatDate(s, 'short')} – ${formatDate(e, 'short')}`;
    if (period === 'thisMonth' || period === 'lastMonth') return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return `${formatDate(s, 'short')} – ${formatDate(e, 'short')}`;
  }, [activeRange.end, activeRange.start, period]);

  const amountValue = useMemo(() => parseAmount(amountText), [amountText]);
  const canAdd = amountText.trim().length > 0 && description.trim().length > 0;

  const formatInputDate = useCallback((d: Date | null) => {
    if (!d) return 'mm/dd/yyyy';
    return d.toLocaleDateString('en-US');
  }, []);

  const summaryPeriodText = useMemo(() => {
    if (period === 'custom' && !customRange) return 'Custom period';
    return rangeLabel;
  }, [customRange, period, rangeLabel]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MiscExpense>) => {
      const cat = quickAddCategories.find(c => c.id === item.categoryId);
      const color = cat?.color ?? COLORS.chart[0];
      const icon = cat?.icon ?? 'tag';

      return (
        <Card variant="default" style={styles.itemCard}>
          <View style={styles.itemRow}>
            <View style={[styles.itemIconCircle, { backgroundColor: toRgba(color, 0.14) }]}>
              <CategoryIcon icon={icon} size={18} color={color} />
            </View>
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
    [colors.textSecondary, confirmDelete, quickAddCategories, styles],
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
        <View style={styles.summaryCard}>
          <LinearGradient colors={['#ff0050', '#ff006e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={styles.summaryLabel}>Total Misc. Spending</Text>
          <Text style={styles.summaryAmount}>{formatCurrency(totalForPeriod)}</Text>
          <Text style={styles.summaryPeriod}>{summaryPeriodText}</Text>
        </View>

        <Card variant="default" style={styles.periodCard}>
          <Text style={styles.periodTitle}>Time Period</Text>
          <View style={styles.periodPillsRow}>
            {(
              [
                { key: 'thisMonth' as const, label: 'This\nMonth' },
                { key: 'lastMonth' as const, label: 'Last Month' },
                { key: 'weekly' as const, label: 'Weekly' },
                { key: 'custom' as const, label: 'Custom' },
              ]
            ).map(p => {
              const selected = period === p.key;
              return (
                <Pressable
                  key={p.key}
                  accessibilityRole="button"
                  accessibilityLabel={p.key}
                  onPress={() => onSelectPeriod(p.key)}
                  style={({ pressed }) => [
                    styles.periodPill,
                    selected ? styles.periodPillSelected : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={[styles.periodPillText, selected ? styles.periodPillTextSelected : null]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {period === 'custom' ? (
            <View style={styles.customWrap}>
              <View style={styles.customDivider} />
              <View ref={customRangeAnchorRef} collapsable={false} style={styles.customRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select start date"
                  onPress={() => {
                    setCategoryDropdownOpen(false);
                    setShowRangePicker(true);
                  }}
                  style={({ pressed }) => [styles.customDateField, styles.customDateFieldOutlined, pressed ? styles.pressed : null]}
                >
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.customDateText}>
                    {formatInputDate(customTempStart)}
                  </Text>
                </Pressable>

                <Text style={styles.customToText}>to</Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select end date"
                  onPress={() => {
                    setCategoryDropdownOpen(false);
                    setShowRangePicker(true);
                  }}
                  style={({ pressed }) => [styles.customDateField, styles.customDateFieldFilled, pressed ? styles.pressed : null]}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                    style={[styles.customDateText, styles.customDateTextFilled]}
                  >
                    {formatInputDate(customTempEnd)}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Apply custom range"
                  disabled={!customTempStart || !customTempEnd}
                  onPress={() => {
                    if (!customTempStart || !customTempEnd) return;
                    const s = startOfDay(customTempStart);
                    const e = endOfDay(customTempEnd);
                    setCustomRange(s.getTime() <= e.getTime() ? { start: s, end: e } : { start: startOfDay(customTempEnd), end: endOfDay(customTempStart) });
                  }}
                  style={({ pressed }) => [
                    styles.customApplyBtn,
                    !customTempStart || !customTempEnd ? styles.customApplyBtnDisabled : null,
                    pressed && customTempStart && customTempEnd ? styles.customApplyBtnPressed : null,
                  ]}
                >
                  <Text style={styles.customApplyText}>Apply</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </Card>

        <View
          onLayout={e => {
            quickAddAnchorY.current = e.nativeEvent.layout.y;
          }}
        />

        {quickAddOpen ? (
          <Card variant="default" style={styles.quickExpenseCard}>
            <View style={styles.quickHeaderRow}>
              <Text style={styles.quickExpenseTitle}>Quick Add Expense</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close quick add"
                onPress={() => {
                  setQuickAddOpen(false);
                  setCategoryDropdownOpen(false);
                }}
                style={({ pressed }) => [styles.quickCloseBtn, pressed ? styles.pressed : null]}
              >
                <Feather name="x" size={ICON_SIZES.md} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.quickLabel}>Item</Text>
            <Input
              value={description}
              onChangeText={t => {
                setDescription(t);
                if (errors.description) setErrors(prev => ({ ...prev, description: undefined }));
              }}
              placeholder="Description (e.g., Coffee, Parking)"
              error={errors.description}
              style={styles.quickField}
              fieldStyle={styles.quickFieldInner}
            />

            <Text style={styles.quickLabel}>Amount</Text>
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
              style={styles.quickField}
              leftIcon={<Text style={styles.dollarPrefix}>$</Text>}
              fieldStyle={styles.quickFieldInner}
            />

            <Text style={styles.quickLabel}>Date</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select expense date"
              onPress={() => {
                setCategoryDropdownOpen(false);
                setShowQuickAddDatePicker(true);
              }}
              style={({ pressed }) => [styles.quickDateField, pressed ? styles.pressed : null]}
            >
              <Text style={styles.quickDateText}>{formatDate(quickAddDate, 'short')}</Text>
              <Feather name="calendar" size={ICON_SIZES.sm} color={colors.textSecondary} />
            </Pressable>

            <Text style={styles.quickLabel}>Category</Text>
            <View style={styles.dropdownWrap}>
              <View
                accessibilityRole="button"
                accessibilityLabel="Select category"
                style={[styles.dropdownField, categoryDropdownOpen ? styles.dropdownFieldOpen : null]}
              >
                <Text style={styles.dropdownValue} numberOfLines={1}>
                  {categoryDropdownOpen ? 'All Categories' : displayCategoryLabel(selectedCategory)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={categoryDropdownOpen ? 'Close category dropdown' : 'Open category dropdown'}
                  onPress={() => setCategoryDropdownOpen(v => !v)}
                  hitSlop={10}
                  style={({ pressed }) => [styles.dropdownChevronBtn, pressed ? styles.pressed : null]}
                >
                  <Feather
                    name={categoryDropdownOpen ? 'chevron-up' : 'chevron-down'}
                    size={ICON_SIZES.md}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>

              {categoryDropdownOpen ? (
                <View style={styles.dropdownPanel}>
                  <ScrollView
                    showsVerticalScrollIndicator
                    persistentScrollbar
                    nestedScrollEnabled
                    overScrollMode="never"
                    keyboardShouldPersistTaps="handled"
                    style={styles.dropdownScroll}
                    contentContainerStyle={styles.dropdownScrollContent}
                  >
                    <Text style={styles.dropdownHeader}>All Categories</Text>
                    {quickAddCategories.filter(c => c.id !== 'other').map(cat => {
                      const selected = cat.id === selectedCategoryId;
                      return (
                        <Pressable
                          key={cat.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Select ${cat.name}`}
                          onPress={() => {
                            setSelectedCategoryId(cat.id);
                            setCategoryDropdownOpen(false);
                          }}
                          style={({ pressed }) => [styles.dropdownRow, selected ? styles.dropdownRowSelected : null, pressed ? styles.pressed : null]}
                        >
                          <Text style={[styles.dropdownText, selected ? styles.dropdownTextSelected : null]}>
                            {displayCategoryLabel(cat)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}
            </View>

            <View style={styles.quickActionsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add Expense"
                onPress={handleAdd}
                disabled={!canAdd || adding}
                style={({ pressed }) => [
                  styles.quickPrimaryBtn,
                  (!canAdd || adding) ? styles.quickPrimaryBtnDisabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                {adding ? (
                  <ActivityIndicator size="small" color={COLORS.common.white} />
                ) : (
                  <Text
                    style={styles.quickPrimaryBtnText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.9}
                  >
                    Add Expense
                  </Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => {
                  setQuickAddOpen(false);
                  setCategoryDropdownOpen(false);
                }}
                style={({ pressed }) => [styles.quickSecondaryBtn, pressed ? styles.pressed : null]}
              >
                <Text style={styles.quickSecondaryBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        <Text style={styles.listTitle}>Recent Expenses</Text>
      </View>
    );
  }, [
    adding,
    amountText,
    canAdd,
    categoryDropdownOpen,
    colors.textSecondary,
    customRange,
    customTempEnd,
    customTempStart,
    description,
    errors.amount,
    errors.description,
    formatInputDate,
    handleAdd,
    onSelectPeriod,
    navigation,
    period,
    quickAddOpen,
    rangeLabel,
    selectedCategory.color,
    selectedCategory.icon,
    selectedCategory.name,
    selectedCategoryId,
    summaryPeriodText,
    styles,
    totalForPeriod,
  ]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerContainer}>
        <View style={styles.headerTopRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.headerBackBtn, pressed ? styles.pressed : null]}
          >
            <Feather name="arrow-left" size={ICON_SIZES.md} color={colors.text} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add expense"
            onPress={openQuickAddFromHeader}
            style={({ pressed }) => [styles.headerAddBtn, pressed ? styles.pressed : null]}
          >
            <Feather name="plus" size={ICON_SIZES.lg} color={primary} />
          </Pressable>
        </View>

        <Text style={styles.headerTitle}>Misc. Spend</Text>
        <Text style={styles.headerSubtitle}>Track small expenses without receipts</Text>
      </View>

      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.select({ ios: 'padding', android: undefined })}>
        <SwipeListView
          ref={listRef}
          data={filtered}
          keyExtractor={(item: MiscExpense) => item.id}
          renderItem={renderItem}
          renderHiddenItem={renderHidden}
          rightOpenValue={-92}
          disableRightSwipe
          scrollEnabled={!categoryDropdownOpen}
          disableScrollViewPanResponder={categoryDropdownOpen}
          overScrollMode="never"
          closeOnRowPress
          closeOnRowOpen
          closeOnScroll
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <Card variant="default" style={styles.emptyInfoCard}>
              <View style={styles.emptyInfoRow}>
                <View style={styles.emptyInfoIcon}>
                  <Feather name="dollar-sign" size={ICON_SIZES.lg} color={primary} />
                </View>
                <View style={styles.emptyInfoTextCol}>
                  <Text style={styles.emptyInfoTitle}>What is Misc. Spend?</Text>
                  <Text style={styles.emptyInfoBody}>
                    Track small purchases without receipts like coffee, parking, tips, and other quick expenses that add up over time.
                  </Text>
                </View>
              </View>
            </Card>
          }
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      </KeyboardAvoidingView>

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

      {/* Custom range picker */}
      <DateRangePickerModal
        visible={showRangePicker}
        anchorRef={customRangeAnchorRef}
        initialStartDate={customTempStart ?? customRange?.start ?? null}
        initialEndDate={customTempEnd ?? customRange?.end ?? null}
        onConfirm={({ start, end }) => {
          setCustomTempStart(start);
          setCustomTempEnd(end);
        }}
        onClose={() => {
          setShowRangePicker(false);
        }}
      />

      <DatePickerModal
        visible={showQuickAddDatePicker}
        title="Expense date"
        initialDate={quickAddDate}
        onClose={() => setShowQuickAddDatePicker(false)}
        onConfirm={(d) => {
          setQuickAddDate(d);
          setShowQuickAddDatePicker(false);
        }}
      />

      <LoadingOverlay visible={loading} message="Loading expenses…" />
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
  isDark,
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
  isDark: boolean;
  primary: string;
  insetBottom: number;
}) => {
  const label: TextStyle = { ...TYPOGRAPHY.label, color: colors.textSecondary };

  const fieldBg = isDark ? colors.surface : '#f1f5f9';

  const totalBottom = clamp(24 + insetBottom, 24, 48 + insetBottom);

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

    headerContainer: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      backgroundColor: colors.background,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    headerBackBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    headerAddBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    headerTitle: {
      ...TYPOGRAPHY.pageTitle,
      color: colors.text,
      marginTop: 2,
    },
    headerSubtitle: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },

    summaryCard: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
      overflow: 'hidden',
      minHeight: 124,
      justifyContent: 'center',
    },
    summaryLabel: {
      ...TYPOGRAPHY.caption,
      color: COLORS.common.white,
      opacity: 0.9,
      marginBottom: 6,
      fontWeight: '600',
    },
    summaryAmount: {
      fontSize: 30,
      lineHeight: 34,
      fontWeight: '700',
      color: COLORS.common.white,
      marginBottom: 6,
      letterSpacing: -0.2,
    },
    summaryPeriod: {
      ...TYPOGRAPHY.caption,
      color: toRgba(COLORS.common.white, 0.85),
    },

    periodCard: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
      padding: SPACING.lg,
    },
    periodTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      marginBottom: SPACING.md,
    },
    periodPillsRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    periodPill: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 0,
      backgroundColor: '#f1f5f9',
      paddingVertical: 12,
      paddingHorizontal: SPACING.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    periodPillSelected: {
      backgroundColor: primary,
    },
    periodPillText: {
      ...TYPOGRAPHY.caption,
      color: '#64748b',
      fontWeight: '700',
      textAlign: 'center',
    },
    periodPillTextSelected: {
      color: COLORS.common.white,
      fontWeight: '700',
    },

    customWrap: {
      marginTop: SPACING.md,
    },
    customDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginBottom: SPACING.md,
    },
    customRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    customDateField: {
      flex: 1,
      height: 40,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.md,
      borderWidth: 1.5,
    },
    customDateFieldOutlined: {
      backgroundColor: 'transparent',
      borderColor: colors.text,
    },
    customDateFieldFilled: {
      backgroundColor: primary,
      borderColor: colors.text,
    },
    customDateText: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      fontWeight: '600',
      textAlign: 'center',
      fontSize: 14,
      letterSpacing: -0.2,
    },
    customDateTextFilled: {
      color: COLORS.common.white,
    },
    customToText: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      paddingHorizontal: 2,
    },
    customApplyBtn: {
      height: 40,
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: primary,
      borderWidth: 1.5,
      borderColor: colors.text,
    },
    customApplyBtnDisabled: {
      backgroundColor: colors.disabled,
      borderColor: colors.border,
    },
    customApplyBtnPressed: {
      opacity: 0.9,
    },
    customApplyText: {
      ...TYPOGRAPHY.caption,
      color: COLORS.common.white,
      fontWeight: '700',
    },

    quickExpenseCard: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
      padding: SPACING.lg,
      overflow: 'visible',
      position: 'relative',
      zIndex: 100,
      elevation: 1,
    },
    quickHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    quickExpenseTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
    },
    quickCloseBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    quickLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      fontWeight: '700',
      marginBottom: SPACING.xs,
      marginLeft: 2,
    },
    quickField: {
      marginBottom: SPACING.md,
    },
    quickFieldInner: {
      backgroundColor: fieldBg,
    },
    quickDateField: {
      height: 44,
      borderRadius: 14,
      paddingHorizontal: SPACING.md,
      backgroundColor: fieldBg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 2,
      borderColor: colors.border,
      marginBottom: SPACING.md,
    },
    quickDateText: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      fontWeight: '600',
    },
    dollarPrefix: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      fontWeight: '600',
    },

    dropdownWrap: {
      marginBottom: SPACING.md,
      position: 'relative',
      zIndex: 200,
      elevation: 2,
    },
    dropdownField: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: fieldBg,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 18,
      paddingHorizontal: SPACING.md,
      height: 56,
      gap: SPACING.sm,
    },
    dropdownFieldOpen: {
      borderColor: primary,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
    dropdownValue: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      flex: 1,
      fontWeight: '700',
    },
    dropdownChevronBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
    },
    dropdownPanel: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: primary,
      borderTopWidth: 0,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      overflow: 'hidden',
      maxHeight: 320,
    },
    dropdownScroll: {
      maxHeight: 320,
    },
    dropdownScrollContent: {
      paddingBottom: 6,
    },
    dropdownHeader: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      backgroundColor: colors.surface,
    },
    dropdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    dropdownRowSelected: {
      backgroundColor: isDark ? '#1F2937' : '#EEF2FF',
    },
    dropdownText: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      flex: 1,
      fontWeight: '700',
    },
    dropdownTextSelected: {
      fontWeight: '700',
    },
    quickActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      zIndex: 1,
    },
    quickPrimaryBtn: {
      flex: 1,
      minWidth: 0,
      height: 54,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: primary,
      paddingHorizontal: SPACING.md,
    },
    quickPrimaryBtnDisabled: {
      opacity: 1,
      backgroundColor: toRgba(primary, 0.55),
    },
    quickPrimaryBtnText: {
      ...TYPOGRAPHY.bodyLarge,
      color: COLORS.common.white,
      fontWeight: '700',
      textAlign: 'center',
    },
    quickSecondaryBtn: {
      flexBasis: 104,
      flexGrow: 0,
      flexShrink: 0,
      height: 54,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#111827' : '#F1F5F9',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    quickSecondaryBtnText: {
      ...TYPOGRAPHY.bodyLarge,
      color: isDark ? COLORS.common.white : '#111827',
      fontWeight: '800',
    },

    emptyInfoCard: {
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.md,
      padding: SPACING.lg,
    },
    emptyInfoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    emptyInfoIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: toRgba(primary, 0.12),
    },
    emptyInfoTextCol: {
      flex: 1,
      marginLeft: SPACING.md,
    },
    emptyInfoTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      marginBottom: 2,
    },
    emptyInfoBody: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
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
      fontSize: 24,
      fontWeight: '600',
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
      paddingBottom: clamp(24 + insetBottom, 24, 48 + insetBottom),
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
    itemIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: SPACING.md,
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
