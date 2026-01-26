import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import Svg, { Circle, G } from 'react-native-svg';

import { Badge, Button, Card, IconButton, Input } from '@/components/common';
import { EmptyState, LoadingOverlay } from '@/components/compositions';
import { type CategoryOption } from '@/components/modals/CategoryPickerModal';
import { COLORS, GRADIENTS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { HomeStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/contexts';
import { formatCurrency } from '@/utils/format';
import { listReceipts } from '@/utils/receiptStore';
import { deleteBudgetById, listBudgets, upsertBudget, type StoredBudget } from '@/utils/budgetStore';
import { hexToRgba } from '@/utils/color';
import { upsertCustomCategory, type StoredCategory } from '@/utils/categoriesStore';

type Props = NativeStackScreenProps<HomeStackParamList, 'Budget'>;

type BudgetView = 'monthly' | 'weekly' | 'custom';

interface Budget {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  amount: number;
  spent: number;
  percentage: number;
  effectiveAmount: number;
  status: 'on-track' | 'warning' | 'over';
}

interface Receipt {
  id: string;
  amount: number;
  date: Date | string;
  categoryId: string;
  merchant?: string;
}

const DEFAULT_CATEGORIES: CategoryOption[] = [
  { id: 'food', name: 'Food & Dining', color: '#10b981' },
  { id: 'groceries', name: 'Groceries', color: '#22c55e' },
  { id: 'transport', name: 'Transport', color: '#3b82f6' },
  { id: 'shopping', name: 'Shopping', color: '#a855f7' },
  { id: 'health', name: 'Health', color: '#ef4444' },
  { id: 'misc', name: 'Misc', color: '#f59e0b' },
];

const CATEGORY_EMOJI: Record<string, string> = {
  groceries: '🛒',
  transport: '🚗',
  food: '🍔',
  shopping: '🛍️',
  entertainment: '🎬',
  utilities: '💡',
  health: '❤️',
  misc: '✨',
};

const CHART_COLORS = Array.from(COLORS.chart);

const PRESET_COLORS = COLORS.chart;

const ADD_CATEGORY_CHOICES: Array<{ emoji: string; iconName: string; color: string }> = [
  { emoji: '🏥', iconName: 'heart', color: CHART_COLORS[0 % CHART_COLORS.length] },
  { emoji: '✈️', iconName: 'navigation', color: CHART_COLORS[1 % CHART_COLORS.length] },
  { emoji: '🎓', iconName: 'book', color: CHART_COLORS[2 % CHART_COLORS.length] },
  { emoji: '🏋️', iconName: 'activity', color: CHART_COLORS[3 % CHART_COLORS.length] },
  { emoji: '🐱', iconName: 'gift', color: CHART_COLORS[4 % CHART_COLORS.length] },
  { emoji: '🎨', iconName: 'airplay', color: CHART_COLORS[5 % CHART_COLORS.length] },
  { emoji: '🏠', iconName: 'home', color: CHART_COLORS[6 % CHART_COLORS.length] },
  { emoji: '📚', iconName: 'book', color: CHART_COLORS[7 % CHART_COLORS.length] },
  { emoji: '🎮', iconName: 'smartphone', color: CHART_COLORS[8 % CHART_COLORS.length] },
  { emoji: '🍕', iconName: 'coffee', color: CHART_COLORS[9 % CHART_COLORS.length] },
  { emoji: '☕', iconName: 'coffee', color: CHART_COLORS[10 % CHART_COLORS.length] },
  { emoji: '🚲', iconName: 'navigation', color: CHART_COLORS[11 % CHART_COLORS.length] },
];

const toDate = (value: Date | string): Date => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const isInCurrentMonth = (value: Date | string) => {
  const now = new Date();
  const d = toDate(value);
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
};

const startOfMonth = (value: Date) => {
  const d = new Date(value);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfMonth = (value: Date) => {
  const d = startOfMonth(value);
  d.setMonth(d.getMonth() + 1);
  d.setMilliseconds(-1);
  return d;
};

const monthWindow = (offset: number) => {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return { start: startOfMonth(base), end: endOfMonth(base) };
};

const startOfWeek = (value: Date) => {
  // Monday as start of week.
  const d = new Date(value);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfWeek = (value: Date) => {
  const s = startOfWeek(value);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
};

const isInCurrentWeek = (value: Date | string) => {
  const now = new Date();
  const start = startOfWeek(now);
  const end = endOfWeek(now);
  const d = toDate(value);
  return d >= start && d <= end;
};

const daysBetweenInclusive = (start: Date, end: Date) => {
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  const diff = e.getTime() - s.getTime();
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1);
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const getCategoryIcon = (categoryId: string) => {
  switch (categoryId) {
    case 'food':
      return 'coffee';
    case 'groceries':
      return 'shopping-cart';
    case 'transport':
      return 'truck';
    case 'shopping':
      return 'shopping-bag';
    case 'health':
      return 'activity';
    case 'misc':
      return 'star';
    default:
      return 'file-text';
  }
};

const normalizeCategoryIcon = (categoryId: string, storedIcon?: string) => {
  if (!storedIcon) return getCategoryIcon(categoryId);
  // Allow emoji values for budget-specific displays.
  const looksLikeFeatherName = /^[a-z0-9-]+$/i.test(storedIcon);
  return looksLikeFeatherName ? storedIcon : storedIcon;
};

const getStatus = (percentage: number): Budget['status'] => {
  if (percentage > 100) return 'over';
  if (percentage >= 80) return 'warning';
  return 'on-track';
};

const getStatusBadgeVariant = (status: Budget['status']): 'success' | 'warning' | 'error' => {
  switch (status) {
    case 'warning':
      return 'warning';
    case 'over':
      return 'error';
    case 'on-track':
    default:
      return 'success';
  }
};

const getStatusLabel = (status: Budget['status']) => {
  switch (status) {
    case 'on-track':
      return 'On Track';
    case 'warning':
      return 'Warning';
    case 'over':
      return 'Over';
    default:
      return '';
  }
};

const getStatusColor = (status: Budget['status']) => {
  switch (status) {
    case 'warning':
      return COLORS.semantic.warning;
    case 'over':
      return COLORS.semantic.error;
    case 'on-track':
    default:
      return COLORS.semantic.success;
  }
};

const getProgressGradient = (percentage: number): readonly [string, string] => {
  if (percentage > 100) return GRADIENTS.error;
  if (percentage >= 80) return GRADIENTS.warning;
  return GRADIENTS.success;
};

const parseAmount = (text: string): number => {
  const normalized = text.replace(/[^0-9.]/g, '');
  if (!normalized) return 0;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
};

const calculateSpentForCategory = (
  categoryId: string,
  receiptsData: Receipt[],
  include: (value: Date | string) => boolean,
): number => {
  return receiptsData
    .filter(r => r.categoryId === categoryId && include(r.date))
    .reduce((sum, r) => sum + r.amount, 0);
};

const recalculateBudgets = (
  stored: StoredBudget[],
  receiptsData: Receipt[],
  opts: { include: (value: Date | string) => boolean; budgetScale: number },
): Budget[] => {
  const next = stored.map(b => {
    const effectiveAmount = b.amount * opts.budgetScale;
    const spent = calculateSpentForCategory(b.categoryId, receiptsData, opts.include);
    const percentage = effectiveAmount > 0 ? Math.round((spent / effectiveAmount) * 100) : 0;
    return {
      ...b,
      spent,
      percentage,
      effectiveAmount,
      status: getStatus(percentage),
    };
  });

  // Stable sort by (over -> warning -> on-track) then by category name
  const order: Record<Budget['status'], number> = { over: 0, warning: 1, 'on-track': 2 };
  next.sort((a, b) => {
    const s = order[a.status] - order[b.status];
    if (s !== 0) return s;
    return a.categoryName.localeCompare(b.categoryName);
  });

  return next;
};

export const BudgetScreen = ({ navigation }: Props) => {
  const { colors, isDark } = useTheme();
  const primary = COLORS.brand.primary;
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { categories: appCategories, loadCategories } = useApp();

  const [view, setView] = useState<BudgetView>('monthly');
  const [customRange, setCustomRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  });

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [monthlyTotal, setMonthlyTotal] = useState({
    budget: 0,
    spent: 0,
    remaining: 0,
    percentage: 0,
  });

  const [showAddBudgetModal, setShowAddBudgetModal] = useState(false);
  const [showAddMenuModal, setShowAddMenuModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);

  const [budgetCompareExpanded, setBudgetCompareExpanded] = useState(true);

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption | null>(null);
  const [amountText, setAmountText] = useState('');

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryAmountText, setNewCategoryAmountText] = useState('');
  const [newCategoryChoice, setNewCategoryChoice] = useState<(typeof ADD_CATEGORY_CHOICES)[number] | null>(
    ADD_CATEGORY_CHOICES[0] ?? null,
  );
  const [newCategoryColor, setNewCategoryColor] = useState<string>(PRESET_COLORS[0] ?? COLORS.brand.primary);
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);

  const viewConfig = useMemo(() => {
    if (view === 'weekly') {
      return {
        label: 'This Week',
        include: isInCurrentWeek,
        budgetScale: 1 / 4,
      } as const;
    }

    if (view === 'custom') {
      const start = customRange.start;
      const end = customRange.end;
      const include = (value: Date | string) => {
        const d = toDate(value);
        return d >= start && d <= end;
      };

      const days = daysBetweenInclusive(start, end);
      return {
        label: 'Custom',
        include,
        budgetScale: days / 30,
      } as const;
    }

    return {
      label: 'This Month',
      include: isInCurrentMonth,
      budgetScale: 1,
    } as const;
  }, [customRange.end, customRange.start, view]);

  const styles = useMemo(() => createStyles({ colors, primary, isDark }), [colors, primary, isDark]);

  const categoryOptions = useMemo<CategoryOption[]>(() => {
    // Prefer global categories (includes custom), but fall back to local defaults.
    if (!appCategories?.length) return DEFAULT_CATEGORIES;
    return appCategories.map(c => ({ id: c.id, name: c.name, color: c.color, iconName: c.icon }));
  }, [appCategories]);

  const categoryMetaById = useMemo(() => {
    const map = new Map<string, { color: string; name: string }>();
    for (const c of categoryOptions) map.set(c.id, { color: c.color, name: c.name });
    return map;
  }, [categoryOptions]);

  const calculateMonthlyTotal = useCallback((budgetsData: Budget[]) => {
    const totalBudget = budgetsData.reduce((sum, b) => sum + b.effectiveAmount, 0);
    const totalSpent = budgetsData.reduce((sum, b) => sum + b.spent, 0);
    const remaining = totalBudget - totalSpent;
    const percentage = totalBudget > 0 ? Number(((totalSpent / totalBudget) * 100).toFixed(1)) : 0;

    setMonthlyTotal({
      budget: totalBudget,
      spent: totalSpent,
      remaining,
      percentage,
    });
  }, []);

  const hydrate = useCallback(async () => {
    try {
      setLoading(true);

      const [budgetsData, receiptsData] = await Promise.all([
        listBudgets(),
        listReceipts(),
      ]);

      const typedReceipts = (receiptsData as unknown as Receipt[]).filter(r => typeof r?.amount === 'number');
      const typedBudgets = budgetsData.map(b => ({
        ...b,
        categoryIcon: normalizeCategoryIcon(b.categoryId, b.categoryIcon),
      }));

      setReceipts(typedReceipts);

      const recalculated = recalculateBudgets(typedBudgets, typedReceipts, viewConfig);
      setBudgets(recalculated);
      calculateMonthlyTotal(recalculated);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading budgets:', error);
    } finally {
      setLoading(false);
    }
  }, [calculateMonthlyTotal, viewConfig]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useFocusEffect(
    useCallback(() => {
      hydrate();
    }, [hydrate]),
  );

  useEffect(() => {
    // When changing view/range, recompute budgets from the current stored budgets + receipts.
    // This avoids waiting for a focus event.
    (async () => {
      try {
        const existing = await listBudgets();
        const typedBudgets = existing.map(b => ({
          ...b,
          categoryIcon: normalizeCategoryIcon(b.categoryId, b.categoryIcon),
        }));
        const recalculated = recalculateBudgets(typedBudgets, receipts, viewConfig);
        setBudgets(recalculated);
        calculateMonthlyTotal(recalculated);
      } catch {
        // Ignore.
      }
    })();
  }, [calculateMonthlyTotal, receipts, viewConfig]);

  const openAddModal = useCallback(() => {
    setEditingBudget(null);
    setSelectedCategory(null);
    setAmountText('');
    setShowAddBudgetModal(true);
  }, []);

  const openAddMenu = useCallback(() => {
    setShowAddMenuModal(true);
  }, []);

  const closeAddMenu = useCallback(() => {
    setShowAddMenuModal(false);
  }, []);

  const openAddCategory = useCallback(() => {
    setShowAddMenuModal(false);
    setNewCategoryName('');
    setNewCategoryAmountText('');
    setNewCategoryChoice(ADD_CATEGORY_CHOICES[0] ?? null);
    setNewCategoryColor(PRESET_COLORS[0] ?? primary);
    setEmojiPickerVisible(false);
    setShowAddCategoryModal(true);
  }, [primary]);

  const closeAddCategory = useCallback(() => {
    setShowAddCategoryModal(false);
  }, []);

  const openEditModal = useCallback((budget: Budget) => {
    setEditingBudget(budget);
    const found = categoryOptions.find(c => c.id === budget.categoryId);
    setSelectedCategory(found ?? { id: budget.categoryId, name: budget.categoryName, color: COLORS.chart[0] });
    setAmountText(String(budget.amount));
    setShowAddBudgetModal(true);
  }, [categoryOptions]);

  const closeBudgetModal = useCallback(() => {
    setShowAddBudgetModal(false);
    setShowCategoryPicker(false);
    setEditingBudget(null);
    setSelectedCategory(null);
    setAmountText('');
  }, []);

  const persistAndRefresh = useCallback(
    async (nextStored: StoredBudget[]) => {
      // Persist all changes (upserts/deletes done already), then recalc from receipts
      const recalculated = recalculateBudgets(nextStored, receipts, viewConfig);
      setBudgets(recalculated);
      calculateMonthlyTotal(recalculated);
    },
    [calculateMonthlyTotal, receipts, viewConfig],
  );

  const handleSaveBudget = useCallback(async () => {
    const category = selectedCategory;
    if (!category) {
      Alert.alert('Select a Category', 'Please choose a category for this budget.');
      return;
    }

    const amount = parseAmount(amountText);
    if (!(amount > 0)) {
      Alert.alert('Invalid Amount', 'Enter a budget amount greater than 0.');
      return;
    }

    try {
      const existing = await listBudgets();

      if (editingBudget) {
        const conflict = existing.find(
          b => b.categoryId === category.id && b.id !== editingBudget.id,
        );

        if (conflict) {
          Alert.alert(
            'Category Already Budgeted',
            `You already have a budget for ${category.name}. Please edit that one instead.`,
          );
          return;
        }

        const updated: StoredBudget = {
          id: editingBudget.id,
          categoryId: category.id,
          categoryName: category.name,
          categoryIcon: getCategoryIcon(category.id),
          amount,
        };

        await upsertBudget(updated);

        const nextStored = existing.map(b => (b.id === updated.id ? updated : b));
        await persistAndRefresh(nextStored);
      } else {
        const existingForCategory = existing.find(b => b.categoryId === category.id);

        if (existingForCategory) {
          const updated: StoredBudget = {
            ...existingForCategory,
            categoryName: category.name,
            categoryIcon: getCategoryIcon(category.id),
            amount,
          };

          await upsertBudget(updated);
          const nextStored = existing.map(b => (b.id === updated.id ? updated : b));
          await persistAndRefresh(nextStored);
        } else {
          const newBudget: StoredBudget = {
            id: Date.now().toString(),
            categoryId: category.id,
            categoryName: category.name,
            categoryIcon: getCategoryIcon(category.id),
            amount,
          };

          await upsertBudget(newBudget);
          const nextStored = [newBudget, ...existing];
          await persistAndRefresh(nextStored);
        }
      }

      closeBudgetModal();
    } catch {
      Alert.alert('Error', 'Failed to save budget');
    }
  }, [amountText, closeBudgetModal, editingBudget, persistAndRefresh, selectedCategory]);

  const handleSaveNewCategory = useCallback(async () => {
    const name = newCategoryName.trim();
    if (!name) {
      Alert.alert('Category Name Required', 'Please enter a category name.');
      return;
    }

    const amount = parseAmount(newCategoryAmountText);
    if (!(amount > 0)) {
      Alert.alert('Invalid Amount', 'Enter a monthly budget amount greater than 0.');
      return;
    }

    const choice = newCategoryChoice;
    if (!choice) {
      Alert.alert('Select an Icon', 'Please choose an icon.');
      return;
    }

    try {
      const now = new Date().toISOString();
      const categoryId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

      const storedCategory: StoredCategory = {
        id: categoryId,
        name,
        iconName: choice.iconName,
        color: newCategoryColor,
        createdAt: now,
        updatedAt: now,
      };

      await upsertCustomCategory(storedCategory);
      await loadCategories();

      const newBudget: StoredBudget = {
        id: Date.now().toString(),
        categoryId,
        categoryName: name,
        // Store emoji here for Budget Manager visuals; other screens use categoriesStore iconName.
        categoryIcon: choice.emoji,
        amount,
      };

      await upsertBudget(newBudget);
      const nextStored = [newBudget, ...(await listBudgets()).filter(b => b.id !== newBudget.id)];
      await persistAndRefresh(nextStored);

      setSelectedCategory({ id: categoryId, name, color: newCategoryColor });

      closeAddCategory();
    } catch {
      Alert.alert('Error', 'Failed to add category');
    }
  }, [
    closeAddCategory,
    loadCategories,
    newCategoryColor,
    newCategoryAmountText,
    newCategoryChoice,
    newCategoryName,
    persistAndRefresh,
    setSelectedCategory,
  ]);

  const handleDeleteBudget = useCallback(
    (budgetId: string) => {
      Alert.alert('Delete Budget', 'Are you sure you want to delete this budget?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBudgetById(budgetId);
              const nextStored = (await listBudgets()).filter(b => b.id !== budgetId);
              await persistAndRefresh(nextStored);
            } catch {
              Alert.alert('Error', 'Failed to delete budget');
            }
          },
        },
      ]);
    },
    [persistAndRefresh],
  );

  const monthlyGradient = useMemo(() => getProgressGradient(monthlyTotal.percentage), [monthlyTotal.percentage]);
  const monthlyVisualPct = useMemo(() => clamp(monthlyTotal.percentage, 0, 100), [monthlyTotal.percentage]);
  const remainingColor = monthlyTotal.remaining >= 0 ? COLORS.semantic.success : COLORS.semantic.error;

  const categoryOverview = useMemo(() => {
    return budgets
      .slice()
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 6);
  }, [budgets]);

  const topMerchants = useMemo(() => {
    const totals = new Map<string, number>();
    receipts
      .filter(r => viewConfig.include(r.date))
      .forEach(r => {
        const name = (r.merchant ?? '').trim();
        if (!name) return;
        totals.set(name, (totals.get(name) ?? 0) + r.amount);
      });

    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([merchant, amount], idx) => ({
        rank: idx + 1,
        merchant,
        amount,
      }));
  }, [receipts, viewConfig]);

  const openCategories = useCallback(() => {
    navigation.navigate('Categories');
  }, [navigation]);

  const openEditBudgets = useCallback(() => {
    openAddModal();
  }, [openAddModal]);

  const renderTab = (id: BudgetView, label: string) => {
    const selected = view === id;
    return (
      <Pressable
        key={id}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setView(id)}
        style={({ pressed }) => [
          styles.tab,
          selected ? styles.tabActive : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={[styles.tabText, selected ? styles.tabTextActive : null]}>{label}</Text>
      </Pressable>
    );
  };

  const CategoryRing = ({
    pct,
    color,
    emoji,
  }: {
    pct: number;
    color: string;
    emoji: string;
  }) => {
    const trackColor = isDark ? hexToRgba(colors.text, 0.18) : '#E5E7EB';
    const size = 86;
    const stroke = 8;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = clamp(pct, 0, 100) / 100;
    const dashOffset = circumference * (1 - clamped);

    return (
      <View style={styles.ringWrap}>
        <Svg width={size} height={size}>
          <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={trackColor}
              strokeWidth={stroke}
              fill="transparent"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={dashOffset}
              fill="transparent"
            />
          </G>
        </Svg>

        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={styles.ringEmoji}>{emoji}</Text>
        </View>

        <View style={styles.ringPctPill} pointerEvents="none">
          <Text style={styles.ringPctText}>{Math.round(pct)}%</Text>
        </View>
      </View>
    );
  };

  const getBudgetEmoji = useCallback(
    (b: Pick<Budget, 'categoryId' | 'categoryIcon'>) => {
      const byId = CATEGORY_EMOJI[b.categoryId];
      if (byId) return byId;
      const stored = b.categoryIcon;
      const looksLikeFeatherName = stored ? /^[a-z0-9-]+$/i.test(stored) : true;
      if (stored && !looksLikeFeatherName) return stored;
      return '💳';
    },
    [],
  );

  const budgetModalTitle = editingBudget ? 'Edit Budget' : 'Add Budget';
  const budgetCtaLabel = editingBudget ? 'Save Budget' : 'Add Budget';

  const budgetModalWidth = useMemo(() => {
    // Full device width (responsive across form factors).
    return Math.max(0, windowWidth);
  }, [windowWidth]);

  const categoryEmojiFor = useCallback((categoryId: string) => {
    return CATEGORY_EMOJI[categoryId] ?? '🏷️';
  }, []);

  const showEmpty = !loading && budgets.length === 0;

  const thisMonthSpent = useMemo(() => {
    const { start, end } = monthWindow(0);
    return receipts.reduce((sum, r) => {
      const d = toDate(r.date);
      if (d >= start && d <= end) return sum + (Number(r.amount) || 0);
      return sum;
    }, 0);
  }, [receipts]);

  const lastMonthSpent = useMemo(() => {
    const { start, end } = monthWindow(-1);
    return receipts.reduce((sum, r) => {
      const d = toDate(r.date);
      if (d >= start && d <= end) return sum + (Number(r.amount) || 0);
      return sum;
    }, 0);
  }, [receipts]);

  const compareDiff = useMemo(() => {
    const diff = lastMonthSpent - thisMonthSpent; // positive means spending decreased
    const pct = lastMonthSpent > 0 ? (diff / lastMonthSpent) * 100 : 0;
    return { diff, pct };
  }, [lastMonthSpent, thisMonthSpent]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.headerIconBtn, pressed && styles.pressed]}
        >
          <Feather name="arrow-left" size={ICON_SIZES.md} color={colors.text} />
        </Pressable>

        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Budget Manager</Text>
          <Text style={styles.headerSubtitle}>
            You're doing great this {view === 'weekly' ? 'week' : 'month'}! 👍
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add budget"
          onPress={openAddModal}
          style={({ pressed }) => [styles.headerIconBtn, pressed && styles.pressed]}
        >
          <Feather name="plus" size={ICON_SIZES.lg} color={primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <>
          <View style={styles.summaryShadow}>
            <LinearGradient
              colors={['#00B36B', '#00A85F']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.summaryCard}
            >
              <View style={styles.summaryTopRow}>
                <View>
                  <Text style={styles.summaryLabel}>{view === 'weekly' ? 'Weekly Budget' : 'Monthly Budget'}</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(monthlyTotal.budget)}</Text>
                </View>

                <View style={styles.summaryIcons}>
                  <Feather name="dollar-sign" size={30} color={COLORS.common.white} />
                  <Feather name="award" size={26} color={hexToRgba(COLORS.common.white, 0.7)} />
                </View>
              </View>

              <View style={styles.summaryMidRow}>
                <Text style={styles.summaryMeta}>Spent: {formatCurrency(monthlyTotal.spent)}</Text>
                <Text style={styles.summaryMeta}>Remaining: {formatCurrency(monthlyTotal.remaining)}</Text>
              </View>

              <View style={styles.summaryProgressTrack}>
                <View style={[styles.summaryProgressFill, { width: `${monthlyVisualPct}%` }]} />
              </View>

              <View style={styles.summaryBottomRow}>
                <Text style={styles.summaryFoot}>{(monthlyTotal.percentage || 0).toFixed(1)}% used</Text>
                <View style={styles.summaryRemainingPill}>
                  <Feather name="trending-down" size={14} color={COLORS.common.white} />
                  <Text style={styles.summaryRemainingPillText}>{formatCurrency(Math.max(0, monthlyTotal.remaining))} to go</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          <View style={styles.tabsWrap}>
            <View style={styles.tabs}>
              {renderTab('monthly', 'Monthly')}
              {renderTab('weekly', 'Weekly')}
              {renderTab('custom', 'Custom')}
            </View>
          </View>

          <View style={styles.sectionPad}>
            <View style={styles.sectionTitleRow}>
              <Feather name="target" size={ICON_SIZES.md} color={primary} />
              <Text style={styles.sectionTitle}>Category Overview</Text>
            </View>

            {showEmpty ? (
              <Card variant="default" style={styles.inlineEmptyCard}>
                <View style={styles.inlineEmptyIcon}>
                  <Feather name="pie-chart" size={22} color={primary} />
                </View>
                <View style={styles.inlineEmptyTextWrap}>
                  <Text style={styles.inlineEmptyTitle}>No budgets yet</Text>
                  <Text style={styles.inlineEmptyDesc}>Add budgets to see category progress rings.</Text>
                </View>
              </Card>
            ) : (
              <View style={styles.overviewGrid}>
                {categoryOverview.map(b => {
                  const color = categoryMetaById.get(b.categoryId)?.color ?? primary;
                  const emoji = getBudgetEmoji(b);
                  return (
                    <View key={b.id} style={styles.overviewCell}>
                      <CategoryRing pct={b.percentage} color={color} emoji={emoji} />
                      <Text style={styles.overviewLabel} numberOfLines={1}>
                        {b.categoryName}
                      </Text>
                      <Text style={styles.overviewAmount} numberOfLines={1}>
                        {formatCurrency(b.spent)} / {formatCurrency(b.effectiveAmount)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <Card variant="default" style={styles.compareCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Budget vs Last Month"
              onPress={() => setBudgetCompareExpanded(v => !v)}
              style={({ pressed }) => [styles.compareHeader, pressed && styles.pressed]}
            >
              <Text style={styles.compareTitle}>Budget vs Last Month</Text>
              <View style={styles.compareHeaderRight}>
                <Text style={styles.compareToggleText}>{budgetCompareExpanded ? 'Hide' : 'Show'}</Text>
                <Feather
                  name="chevron-down"
                  size={ICON_SIZES.md}
                  color={primary}
                  style={{ transform: [{ rotate: budgetCompareExpanded ? '0deg' : '180deg' }] }}
                />
              </View>
            </Pressable>

            {budgetCompareExpanded ? (
              <View style={styles.compareBody}>
                <View style={styles.compareRow}>
                  <Text style={styles.compareLabel}>This Month</Text>
                  <Text style={styles.compareValue}>{formatCurrency(thisMonthSpent)}</Text>
                </View>
                <View style={styles.compareDivider} />
                <View style={styles.compareRow}>
                  <Text style={styles.compareLabel}>Last Month</Text>
                  <Text style={styles.compareValue}>{formatCurrency(lastMonthSpent)}</Text>
                </View>
                <View style={styles.compareDivider} />

                {(() => {
                  const diff = compareDiff.diff;
                  const pct = compareDiff.pct;
                  const isGood = diff >= 0;
                  const color = isGood ? COLORS.semantic.success : COLORS.semantic.error;
                  return (
                    <View style={styles.compareRow}>
                      <Text style={styles.compareLabel}>Difference</Text>
                      <View style={styles.compareDiffRight}>
                        <Feather name={isGood ? 'trending-down' : 'trending-up'} size={16} color={color} />
                        <Text style={[styles.compareDiffText, { color }]}>
                          {formatCurrency(Math.abs(diff))} ({Math.abs(pct).toFixed(1)}%)
                        </Text>
                      </View>
                    </View>
                  );
                })()}
              </View>
            ) : null}
          </Card>

          <LinearGradient
            colors={['#8B4DFF', '#A855F7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.topSpendingCard}
          >
            <Text style={styles.topSpendingTitle}>✨ Top Spending {view === 'weekly' ? 'This Week' : 'This Month'}</Text>

            {topMerchants.length === 0 ? (
              <Text style={styles.topSpendingEmpty}>{showEmpty ? 'Add a budget and start tracking spending.' : 'No merchant data yet.'}</Text>
            ) : (
              topMerchants.map(m => (
                <View key={m.merchant} style={styles.topSpendingRow}>
                  <View style={styles.topSpendingLeft}>
                    <Text style={styles.rankEmoji}>{m.rank === 1 ? '🥇' : m.rank === 2 ? '🥈' : '🥉'}</Text>
                    <Text style={styles.topSpendingMerchant} numberOfLines={1}>
                      {m.merchant}
                    </Text>
                  </View>
                  <Text style={styles.topSpendingAmount}>{formatCurrency(m.amount)}</Text>
                </View>
              ))
            )}
          </LinearGradient>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Spending Timeline"
            onPress={() => {}}
            style={({ pressed }) => [styles.infoCard, pressed && styles.pressed]}
          >
            <Text style={styles.infoCardTitle}>Spending Timeline</Text>
            <View style={styles.infoCardRight}>
              <Text style={styles.infoCardLink}>Show</Text>
              <Feather name="chevron-right" size={ICON_SIZES.md} color={primary} />
            </View>
          </Pressable>

          <Text style={styles.sectionTitlePlain}>Category Budgets</Text>

            {showEmpty ? (
            <View style={{ paddingHorizontal: SPACING.lg }}>
              <EmptyState
                icon={<Feather name="dollar-sign" size={70} color={colors.textTertiary} />}
                title="No Budgets Set"
                description="Create budgets to track your spending by category"
              />
            </View>
          ) : (
            budgets.map(item => {
              const statusColor = getStatusColor(item.status);
              const visualPct = clamp(item.percentage, 0, 100);
                const categoryColor = categoryMetaById.get(item.categoryId)?.color ?? primary;
                const emoji = getBudgetEmoji(item);
              const remaining = item.effectiveAmount - item.spent;

              return (
                <Card
                  key={item.id}
                  variant="default"
                  style={styles.budgetRowCard}
                  onPress={() => openEditModal(item)}
                  accessibilityLabel={`Budget for ${item.categoryName}`}
                >
                  <View style={styles.budgetRowTop}>
                    <View style={styles.budgetRowLeft}>
                      <View style={styles.budgetRowIconCircle}>
                        <Text style={styles.budgetRowEmoji}>{emoji}</Text>
                      </View>
                      <View style={styles.budgetRowMain}>
                        <Text style={styles.budgetRowTitle}>{item.categoryName}</Text>
                        <Text style={styles.budgetRowSub}>
                          {formatCurrency(item.spent)} <Text style={{ color: colors.textSecondary }}>of</Text> {formatCurrency(item.effectiveAmount)}
                        </Text>
                      </View>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${item.categoryName}`}
                      onPress={() => openEditModal(item)}
                      style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
                    >
                      <Feather name="edit-2" size={18} color={colors.textSecondary} />
                    </Pressable>
                  </View>

                  <View style={styles.progressTrack2}>
                    <View style={[styles.progressFill2, { width: `${visualPct}%`, backgroundColor: categoryColor }]} />
                  </View>

                  <View style={styles.budgetRowBottom}>
                    <Text style={styles.budgetRowFoot}>{Math.round(item.percentage * 10) / 10}% used</Text>
                    <Text style={[styles.budgetRowFoot, { color: remaining >= 0 ? statusColor : COLORS.semantic.error }]}>
                      <Feather name="trending-down" size={14} color={remaining >= 0 ? statusColor : COLORS.semantic.error} />{' '}
                      {formatCurrency(Math.abs(remaining))} {remaining >= 0 ? 'remaining' : 'over'}
                    </Text>
                  </View>
                </Card>
              );
            })
          )}

            <View style={styles.suggestedCard}>
              <Text style={styles.suggestedTitle}>✨ Suggested Budgets (Based on last 3 months)</Text>

              {categoryOverview.slice(0, 3).map((b) => (
                <View key={b.id} style={styles.suggestedRow}>
                  <View style={styles.suggestedLeft}>
                    <Text style={styles.suggestedEmoji}>{getBudgetEmoji(b)}</Text>
                    <Text style={styles.suggestedName} numberOfLines={1}>{b.categoryName}</Text>
                  </View>
                  <Text style={styles.suggestedAmt}>{formatCurrency(Math.max(b.spent, b.amount))}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Apply suggested budget for ${b.categoryName}`}
                    onPress={() => {
                      setSelectedCategory(categoryOptions.find(c => c.id === b.categoryId) ?? null);
                      setAmountText(String(Math.round(Math.max(b.spent, b.amount))));
                      setShowAddBudgetModal(true);
                    }}
                    style={({ pressed }) => [styles.applyBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.applyBtnText}>Apply</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            <View style={styles.bottomActionsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add Budget"
                onPress={openAddModal}
                style={({ pressed }) => [styles.bottomAction, pressed && styles.pressed]}
              >
                <View style={styles.bottomActionIconCircle}>
                  <Feather name="plus" size={22} color={primary} />
                </View>
                <Text style={styles.bottomActionText}>Add Budget</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit Budget"
                onPress={openEditBudgets}
                style={({ pressed }) => [styles.bottomAction, pressed && styles.pressed]}
              >
                <View style={[styles.bottomActionIconCircle, { backgroundColor: hexToRgba('#A855F7', 0.16) }]}>
                  <Feather name="edit-2" size={22} color={'#A855F7'} />
                </View>
                <Text style={styles.bottomActionText}>Edit Budget</Text>
              </Pressable>
            </View>
        </>

        <View style={{ height: SPACING['3xl'] }} />
      </ScrollView>

      {/* Add menu */}
      <Modal
        isVisible={showAddMenuModal}
        onBackdropPress={closeAddMenu}
        onBackButtonPress={closeAddMenu}
        backdropOpacity={0.45}
        useNativeDriver
        style={styles.addMenuModal}
      >
        <Card variant="default" style={styles.addMenuCard}>
          <View style={styles.addMenuHandle} />
          <Text style={styles.addMenuTitle}>Add</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add Category"
            onPress={openAddCategory}
            style={({ pressed }) => [styles.addMenuRow, pressed && styles.pressed]}
          >
            <View style={[styles.addMenuIconCircle, { backgroundColor: hexToRgba(primary, 0.14) }]}>
              <Feather name="grid" size={ICON_SIZES.md} color={primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.addMenuRowTitle}>Add Category</Text>
              <Text style={styles.addMenuRowDesc}>Create a new category and budget</Text>
            </View>
            <Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add Budget"
            onPress={() => {
              closeAddMenu();
              openAddModal();
            }}
            style={({ pressed }) => [styles.addMenuRow, pressed && styles.pressed]}
          >
            <View style={[styles.addMenuIconCircle, { backgroundColor: hexToRgba('#A855F7', 0.16) }]}>
              <Feather name="dollar-sign" size={ICON_SIZES.md} color={'#A855F7'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.addMenuRowTitle}>Add Budget</Text>
              <Text style={styles.addMenuRowDesc}>Budget an existing category</Text>
            </View>
            <Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textSecondary} />
          </Pressable>

          <View style={{ height: SPACING.md }} />
          <Button title="Cancel" variant="secondary" onPress={closeAddMenu} fullWidth />
        </Card>
      </Modal>

      {/* Add Category */}
      <Modal
        isVisible={showAddCategoryModal}
        onBackdropPress={closeAddCategory}
        onBackButtonPress={closeAddCategory}
        backdropOpacity={0.45}
        useNativeDriver
        style={styles.createCategoryModal}
      >
        <Card variant="default" style={styles.createCategoryCard}>
          <View style={styles.createCategoryHeader}>
            <Text style={styles.createCategoryTitle}>Create New Category</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={closeAddCategory}
              style={({ pressed }) => [styles.createCategoryClose, pressed && styles.pressed]}
            >
              <Feather name="x" size={ICON_SIZES.md} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.createCategoryLabel}>Category Name</Text>
          <Input
            value={newCategoryName}
            onChangeText={setNewCategoryName}
            placeholder="e.g., Groceries, Transport"
            autoCapitalize="words"
          />

          <Text style={styles.createCategoryLabel}>Category Color</Text>
          <View style={styles.colorSummaryRow}>
            <View style={[styles.colorBigSwatch, { backgroundColor: newCategoryColor }]} />
            <View style={styles.colorSummaryTextCol}>
              <Text style={styles.colorSummaryTitle}>Selected Color</Text>
              <View style={styles.colorSummaryMetaRow}>
                <View style={[styles.colorDot, { backgroundColor: newCategoryColor }]} />
                <Text style={styles.colorHex}>{newCategoryColor.toUpperCase()}</Text>
              </View>
            </View>
          </View>

          <View style={styles.colorGrid}>
            {PRESET_COLORS.map((c) => {
              const selected = newCategoryColor === c;
              return (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={`Select color ${c}`}
                  onPress={() => setNewCategoryColor(c)}
                  style={({ pressed }) => [styles.colorSwatch, { backgroundColor: c }, pressed && { opacity: 0.9 }]}
                >
                  {selected ? <Feather name="check" size={16} color={COLORS.common.white} /> : null}
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.createCategoryLabel}>Category Icon</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose emoji icon"
            onPress={() => setEmojiPickerVisible(true)}
            style={({ pressed }) => [styles.emojiPickerField, pressed && styles.pressed]}
          >
            <Text style={styles.emojiPickerValue}>{newCategoryChoice?.emoji ?? '🙂'}</Text>
          </Pressable>
          <Text style={styles.emojiPickerHint}>Click to choose from emoji picker</Text>

          <Text style={styles.createCategoryLabel}>Monthly Budget</Text>
          <Input
            value={newCategoryAmountText}
            onChangeText={setNewCategoryAmountText}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />

          <View style={styles.createCategoryActions}>
            <View style={{ flex: 1 }}>
              <Button title="Create" variant="primary" onPress={handleSaveNewCategory} fullWidth />
            </View>
            <View style={{ width: SPACING.md }} />
            <View style={{ flex: 1 }}>
              <Button title="Cancel" variant="secondary" onPress={closeAddCategory} fullWidth />
            </View>
          </View>
        </Card>
      </Modal>

      {/* Emoji picker for Create Category */}
      <Modal
        isVisible={emojiPickerVisible}
        onBackdropPress={() => setEmojiPickerVisible(false)}
        onBackButtonPress={() => setEmojiPickerVisible(false)}
        backdropOpacity={0.5}
        useNativeDriver
        style={styles.emojiPickerModal}
      >
        <Card variant="default" style={styles.emojiPickerCard}>
          <View style={styles.emojiPickerHeader}>
            <Text style={styles.emojiPickerTitle}>Pick an Icon</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setEmojiPickerVisible(false)}
              style={({ pressed }) => [styles.createCategoryClose, pressed && styles.pressed]}
            >
              <Feather name="x" size={ICON_SIZES.md} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.emojiGrid}>
            {ADD_CATEGORY_CHOICES.map((c) => {
              const selected = newCategoryChoice?.emoji === c.emoji;
              return (
                <Pressable
                  key={`${c.emoji}-${c.iconName}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Select icon ${c.emoji}`}
                  onPress={() => {
                    setNewCategoryChoice(c);
                    setEmojiPickerVisible(false);
                  }}
                  style={({ pressed }) => [
                    styles.emojiCell,
                    selected && styles.emojiCellSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.emoji}>{c.emoji}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      </Modal>

      <Modal
        isVisible={showAddBudgetModal}
        onBackdropPress={closeBudgetModal}
        onBackButtonPress={closeBudgetModal}
        backdropOpacity={0.5}
        useNativeDriver
        avoidKeyboard
        style={[styles.centerModal, { marginBottom: insets.bottom + 96 }]}
      >
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          style={styles.centerModalKav}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.centerModalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Card variant="default" style={[styles.budgetModalCard, { width: budgetModalWidth }]}>
              <View style={styles.budgetModalHeader}>
                <Text style={styles.budgetModalHeaderTitle}>{budgetModalTitle}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={closeBudgetModal}
                  style={({ pressed }) => [styles.budgetModalClose, pressed && styles.pressed]}
                >
                  <Feather name="x" size={ICON_SIZES.md} color={colors.textSecondary} />
                </Pressable>
              </View>

              <View style={styles.budgetModalBody}>
                <View style={styles.addBudgetPill}>
                  <Feather name="calendar" size={ICON_SIZES.sm} color={primary} />
                  <Text style={styles.addBudgetPillText}>
                    Adding to <Text style={{ fontWeight: '800' }}>{view === 'weekly' ? 'Weekly' : 'Monthly'}</Text> budget
                  </Text>
                </View>

                <Text style={styles.budgetFieldLabel}>Category Name</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select category"
                  onPress={() => setShowCategoryPicker((v) => !v)}
                  style={({ pressed }) => [styles.dropdownField, pressed && styles.dropdownFieldPressed]}
                >
                  <Text style={styles.dropdownFieldText} numberOfLines={1}>
                    {selectedCategory?.name ?? 'Select a category'}
                  </Text>
                  <Feather name="chevron-down" size={ICON_SIZES.md} color={colors.textSecondary} />
                </Pressable>

                {showCategoryPicker && (
                  <View style={styles.dropdownPanel}>
                    <View style={styles.dropdownHeaderRow}>
                      <Text style={styles.dropdownHeaderText}>Select a category</Text>
                    </View>

                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                      style={styles.dropdownScroll}
                    >
                      {categoryOptions.map((cat) => {
                        const selected = cat.id === selectedCategory?.id;
                        return (
                          <Pressable
                            key={cat.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Select category ${cat.name}`}
                            onPress={() => {
                              setSelectedCategory(cat);
                              setShowCategoryPicker(false);
                            }}
                            style={({ pressed }) => [
                              styles.dropdownRow,
                              selected && styles.dropdownRowSelected,
                              pressed && styles.dropdownRowPressed,
                            ]}
                          >
                            <Text style={styles.dropdownEmoji}>{categoryEmojiFor(cat.id)}</Text>
                            <Text style={styles.dropdownRowText} numberOfLines={1}>
                              {cat.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Add New Category"
                      onPress={() => {
                        setShowCategoryPicker(false);
                        openAddCategory();
                      }}
                      style={({ pressed }) => [styles.dropdownAddRow, pressed && styles.dropdownRowPressed]}
                    >
                      <Text style={[styles.dropdownAddPlus, { color: primary }]}>＋</Text>
                      <Text style={[styles.dropdownAddText, { color: primary }]}>Add New Category</Text>
                    </Pressable>
                  </View>
                )}

                <Input
                  value={amountText}
                  onChangeText={setAmountText}
                  label={view === 'weekly' ? 'Weekly Budget Amount' : 'Monthly Budget Amount'}
                  placeholder="$ 0.00"
                  keyboardType={Platform.select({ ios: 'decimal-pad', android: 'numeric', default: 'numeric' })}
                  accessibilityLabel="Budget Amount"
                  style={styles.amountInput}
                />

                <Text style={styles.helperText}>Budget resets every month on the 1st</Text>

                <View style={{ height: SPACING.md }} />
                <Button title={budgetCtaLabel} variant="primary" onPress={handleSaveBudget} fullWidth />
              </View>
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <LoadingOverlay visible={loading} message="Loading budgets…" />
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
    disabled: string;
  };
  primary: string;
  isDark: boolean;
}) => {
  const cardTitle: TextStyle = { ...TYPOGRAPHY.cardTitle, color: colors.text };
  const sectionHeading: TextStyle = { ...TYPOGRAPHY.sectionHeading, color: colors.text };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    header: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    headerIconBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitles: {
      flex: 1,
      marginLeft: SPACING.md,
      marginRight: SPACING.md,
    },
    headerTitle: {
      ...TYPOGRAPHY.sectionHeading,
      fontSize: 24,
      lineHeight: 30,
      color: colors.text,
    },
    headerSubtitle: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginTop: 2,
    },
    pressed: {
      opacity: 0.75,
    },

    scrollContent: {
      paddingBottom: SPACING['3xl'],
    },

    summaryShadow: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
    },
    summaryCard: {
      borderRadius: 22,
      padding: SPACING.lg,
      overflow: 'hidden',
    },
    summaryTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    summaryLabel: {
      ...TYPOGRAPHY.bodyNormal,
      color: hexToRgba(COLORS.common.white, 0.9),
      fontWeight: '600',
      marginBottom: 6,
    },
    summaryValue: {
      fontSize: 40,
      lineHeight: 46,
      fontWeight: '800',
      color: COLORS.common.white,
    },
    summaryIcons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 6,
    },
    summaryMidRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: SPACING.md,
    },
    summaryMeta: {
      ...TYPOGRAPHY.bodySmall,
      color: hexToRgba(COLORS.common.white, 0.9),
      fontWeight: '600',
    },
    summaryProgressTrack: {
      height: 14,
      borderRadius: RADIUS.full,
      backgroundColor: hexToRgba(COLORS.common.white, 0.22),
      marginTop: SPACING.md,
      overflow: 'hidden',
    },
    summaryProgressFill: {
      height: 14,
      borderRadius: RADIUS.full,
      backgroundColor: COLORS.common.white,
    },
    summaryBottomRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: SPACING.lg,
    },
    summaryFoot: {
      ...TYPOGRAPHY.bodySmall,
      color: hexToRgba(COLORS.common.white, 0.9),
      fontWeight: '700',
    },
    summaryRemainingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: SPACING.md,
      paddingVertical: 8,
      borderRadius: RADIUS.full,
      backgroundColor: hexToRgba(COLORS.common.white, 0.18),
    },
    summaryRemainingPillText: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '700',
    },

    tabsWrap: {
      paddingHorizontal: SPACING.lg,
      marginTop: SPACING.lg,
    },
    tabs: {
      backgroundColor: isDark ? colors.surface : '#EEF2F7',
      borderRadius: RADIUS.full,
      padding: 6,
      flexDirection: 'row',
      gap: 6,
    },
    tab: {
      flex: 1,
      height: 44,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    tabActive: {
      backgroundColor: primary,
      ...(Platform.OS === 'android' ? ({ elevation: 2 } as ViewStyle) : null),
    },
    tabText: {
      ...TYPOGRAPHY.bodyNormal,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: COLORS.common.white,
    },

    sectionPad: {
      paddingHorizontal: SPACING.lg,
      marginTop: SPACING.xl,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    sectionTitle: {
      ...sectionHeading,
    },

    overviewGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: SPACING.xl,
    },
    overviewCell: {
      width: '31%',
      alignItems: 'center',
    },
    overviewLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginTop: SPACING.md,
      textAlign: 'center',
    },
    overviewAmount: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      marginTop: 4,
      fontWeight: '700',
      textAlign: 'center',
    },

    inlineEmptyCard: {
      padding: SPACING.lg,
      borderRadius: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    inlineEmptyIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(primary, 0.14),
    },
    inlineEmptyTextWrap: {
      flex: 1,
      paddingRight: SPACING.sm,
    },
    inlineEmptyTitle: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
    },
    inlineEmptyDesc: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginTop: 2,
    },

    ringWrap: {
      width: 86,
      height: 86,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringCenter: {
      position: 'absolute',
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringEmoji: {
      fontSize: 22,
    },
    ringPctPill: {
      position: 'absolute',
      bottom: -8,
      paddingHorizontal: 10,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringPctText: {
      ...TYPOGRAPHY.caption,
      color: colors.text,
      fontWeight: '700',
    },

    infoCard: {
      marginTop: SPACING.xl,
      marginHorizontal: SPACING.lg,
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    infoCardTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
    },
    infoCardRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    infoCardLink: {
      ...TYPOGRAPHY.bodyNormal,
      color: primary,
      fontWeight: '700',
    },

    compareCard: {
      marginTop: SPACING.xl,
      marginHorizontal: SPACING.lg,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      padding: 0,
    },
    compareHeader: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    compareTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
    },
    compareHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    compareToggleText: {
      ...TYPOGRAPHY.bodyNormal,
      color: primary,
      fontWeight: '700',
    },
    compareBody: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.lg,
    },
    compareRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.md,
    },
    compareLabel: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    compareValue: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '700',
    },
    compareDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    compareDiffRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    compareDiffText: {
      ...TYPOGRAPHY.bodyLarge,
      fontWeight: '800',
    },

    topSpendingCard: {
      marginTop: SPACING.xl,
      marginHorizontal: SPACING.lg,
      borderRadius: 22,
      padding: SPACING.xl,
    },
    topSpendingTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: COLORS.common.white,
      marginBottom: SPACING.lg,
    },
    topSpendingEmpty: {
      ...TYPOGRAPHY.bodyNormal,
      color: hexToRgba(COLORS.common.white, 0.9),
    },
    topSpendingRow: {
      backgroundColor: hexToRgba(COLORS.common.white, 0.14),
      borderRadius: 14,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.md,
    },
    topSpendingLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      flex: 1,
      paddingRight: SPACING.md,
    },
    rankEmoji: {
      fontSize: 18,
    },
    topSpendingMerchant: {
      ...TYPOGRAPHY.bodyLarge,
      color: COLORS.common.white,
      fontWeight: '700',
      flex: 1,
    },
    topSpendingAmount: {
      ...TYPOGRAPHY.bodyLarge,
      color: COLORS.common.white,
      fontWeight: '800',
    },

    sectionTitlePlain: {
      ...sectionHeading,
      marginTop: SPACING.xl,
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
    },

    budgetRowCard: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
      padding: SPACING.lg,
      borderRadius: 18,
    },
    budgetRowTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    budgetRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      flex: 1,
      paddingRight: SPACING.md,
    },
    budgetRowIconCircle: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: isDark ? hexToRgba(colors.text, 0.08) : '#EEF2F7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    budgetRowEmoji: {
      fontSize: 20,
    },
    budgetRowMain: {
      flex: 1,
    },
    budgetRowTitle: {
      ...cardTitle,
      fontWeight: '800',
    },
    budgetRowSub: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      marginTop: 2,
      fontWeight: '700',
    },
    editBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    progressTrack2: {
      height: 10,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? hexToRgba(colors.text, 0.12) : '#EEF2F7',
      overflow: 'hidden',
      marginTop: SPACING.lg,
    },
    progressFill2: {
      height: 10,
      borderRadius: RADIUS.full,
    },
    budgetRowBottom: {
      marginTop: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    budgetRowFoot: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      fontWeight: '700',
    },

    suggestedCard: {
      marginTop: SPACING.xl,
      marginHorizontal: SPACING.lg,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hexToRgba(primary, 0.25),
      backgroundColor: isDark ? hexToRgba(primary, 0.08) : '#EAF2FF',
      padding: SPACING.lg,
    },
    suggestedTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      marginBottom: SPACING.md,
    },
    suggestedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.sm,
    },
    suggestedLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      flex: 1,
      paddingRight: SPACING.md,
    },
    suggestedEmoji: {
      fontSize: 18,
    },
    suggestedName: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '700',
      flex: 1,
    },
    suggestedAmt: {
      ...TYPOGRAPHY.bodyNormal,
      color: primary,
      fontWeight: '800',
      marginRight: SPACING.md,
    },
    applyBtn: {
      paddingHorizontal: SPACING.md,
      height: 34,
      borderRadius: 10,
      backgroundColor: hexToRgba(primary, 0.14),
      alignItems: 'center',
      justifyContent: 'center',
    },
    applyBtnText: {
      ...TYPOGRAPHY.bodySmall,
      color: primary,
      fontWeight: '800',
    },

    bottomActionsRow: {
      flexDirection: 'row',
      gap: SPACING.md,
      marginTop: SPACING.xl,
      marginHorizontal: SPACING.lg,
    },
    bottomAction: {
      flex: 1,
      height: 72,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.md,
    },
    bottomActionIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(primary, 0.14),
    },
    bottomActionText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '800',
    },

    addMenuModal: {
      margin: 0,
      justifyContent: 'flex-end',
    },
    addMenuCard: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      paddingTop: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.lg,
    },
    addMenuHandle: {
      alignSelf: 'center',
      width: 48,
      height: 5,
      borderRadius: 3,
      backgroundColor: hexToRgba(colors.text, isDark ? 0.18 : 0.12),
      marginBottom: SPACING.md,
    },
    addMenuTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },
    addMenuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.sm,
      borderRadius: 16,
    },
    addMenuIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addMenuRowTitle: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
    },
    addMenuRowDesc: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginTop: 2,
    },

    createCategoryModal: {
      margin: SPACING.lg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    createCategoryCard: {
      width: '100%',
      maxWidth: 560,
      borderRadius: 22,
      padding: SPACING.lg,
      backgroundColor: colors.surface,
    },
    createCategoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    createCategoryTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
    },
    createCategoryClose: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    createCategoryLabel: {
      ...TYPOGRAPHY.label,
      color: colors.text,
      marginTop: SPACING.md,
      marginBottom: SPACING.sm,
    },

    colorSummaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.lg,
      marginBottom: SPACING.md,
    },
    colorBigSwatch: {
      width: 72,
      height: 72,
      borderRadius: 14,
    },
    colorSummaryTextCol: {
      flex: 1,
    },
    colorSummaryTitle: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '700',
      marginBottom: 6,
    },
    colorSummaryMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    colorDot: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    colorHex: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    colorGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    colorSwatch: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },

    emojiPickerField: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      backgroundColor: isDark ? hexToRgba(colors.text, 0.04) : '#F3F6FA',
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.lg,
      alignItems: 'flex-start',
    },
    emojiPickerValue: {
      fontSize: 22,
    },
    emojiPickerHint: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginTop: SPACING.sm,
    },
    createCategoryActions: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACING.lg,
    },

    emojiPickerModal: {
      margin: SPACING.lg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emojiPickerCard: {
      width: '100%',
      maxWidth: 560,
      borderRadius: 22,
      padding: SPACING.lg,
      backgroundColor: colors.surface,
    },
    emojiPickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    emojiPickerTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
    },

    addCategoryCard: {
      borderRadius: 28,
      padding: SPACING.lg,
    },
    addCategoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    addCategoryTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
    },
    closeX: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addCategoryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: 16,
      backgroundColor: hexToRgba(primary, isDark ? 0.12 : 0.10),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hexToRgba(primary, 0.22),
      marginBottom: SPACING.lg,
    },
    addCategoryPillText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '700',
    },
    helperText: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginTop: -SPACING.sm,
      marginBottom: SPACING.lg,
    },
    iconLabel: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
      marginBottom: SPACING.md,
    },
    emojiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    emojiCell: {
      width: '15.5%',
      aspectRatio: 1,
      borderRadius: 16,
      backgroundColor: isDark ? hexToRgba(colors.text, 0.06) : '#EEF2F7',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    emojiCellSelected: {
      borderColor: primary,
      backgroundColor: hexToRgba(primary, 0.12),
    },
    emoji: {
      fontSize: 22,
    },

    centerModal: {
      margin: 0,
      justifyContent: 'center',
      alignItems: 'stretch',
    },
    centerModalKav: {
      flex: 1,
    },
    centerModalScrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    budgetModalCard: {
      padding: 0,
      borderRadius: 28,
      overflow: 'hidden',
      alignSelf: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 24,
      elevation: 16,
      backgroundColor: colors.surface,
    },
    budgetModalHeader: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    budgetModalHeaderTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
    },
    budgetModalClose: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    budgetModalBody: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.lg,
      paddingTop: SPACING.lg,
    },
    addBudgetPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      borderRadius: 14,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hexToRgba(primary, 0.35),
      backgroundColor: isDark ? hexToRgba(primary, 0.10) : hexToRgba(primary, 0.06),
      marginBottom: SPACING.lg,
    },
    addBudgetPillText: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      fontWeight: '700',
    },
    budgetFieldLabel: {
      ...TYPOGRAPHY.label,
      color: colors.text,
      marginBottom: SPACING.xs,
    },
    dropdownField: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.surface,
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    dropdownFieldPressed: {
      opacity: 0.9,
    },
    dropdownFieldText: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '700',
      flex: 1,
      paddingRight: SPACING.md,
    },

    dropdownPanel: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.surface,
      marginTop: -SPACING.sm,
      marginBottom: SPACING.md,
      overflow: 'hidden',
    },
    dropdownScroll: {
      maxHeight: 220,
    },
    dropdownHeaderRow: {
      backgroundColor: isDark ? hexToRgba(colors.text, 0.10) : '#D1D1D1',
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    dropdownHeaderText: {
      ...TYPOGRAPHY.bodyNormal,
      color: isDark ? colors.text : '#111827',
      fontWeight: '600',
    },
    dropdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: 8,
      paddingHorizontal: SPACING.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    dropdownRowSelected: {
      backgroundColor: hexToRgba(primary, isDark ? 0.14 : 0.08),
    },
    dropdownRowPressed: {
      opacity: 0.9,
    },
    dropdownEmoji: {
      fontSize: 18,
      width: 28,
      textAlign: 'center',
    },
    dropdownRowText: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '600',
      flex: 1,
    },
    dropdownAddRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: 8,
      paddingHorizontal: SPACING.lg,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    dropdownAddPlus: {
      width: 28,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '700',
    },
    dropdownAddText: {
      ...TYPOGRAPHY.bodyLarge,
      fontWeight: '600',
      flex: 1,
    },
    amountInput: {
      marginBottom: SPACING.lg,
    },
  });
};

export default BudgetScreen;
