import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';

import { Badge, Button, Card, IconButton, Input } from '@/components/common';
import { EmptyState, Header, LoadingOverlay } from '@/components/compositions';
import { CategoryPickerModal, type CategoryOption } from '@/components/modals/CategoryPickerModal';
import { COLORS, GRADIENTS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrency } from '@/utils/format';
import { listReceipts } from '@/utils/receiptStore';
import { deleteBudgetById, listBudgets, upsertBudget, type StoredBudget } from '@/utils/budgetStore';

type Props = NativeStackScreenProps<MainStackParamList, 'Budget'>;

interface Budget {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  amount: number;
  spent: number;
  percentage: number;
  status: 'on-track' | 'warning' | 'over';
}

interface Receipt {
  id: string;
  amount: number;
  date: Date | string;
  categoryId: string;
}

const DEFAULT_CATEGORIES: CategoryOption[] = [
  { id: 'food', name: 'Food & Dining', color: '#10b981' },
  { id: 'groceries', name: 'Groceries', color: '#22c55e' },
  { id: 'transport', name: 'Transport', color: '#3b82f6' },
  { id: 'shopping', name: 'Shopping', color: '#a855f7' },
  { id: 'health', name: 'Health', color: '#ef4444' },
  { id: 'misc', name: 'Misc', color: '#f59e0b' },
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

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const getCategoryIcon = (categoryId: string) => {
  switch (categoryId) {
    case 'food':
      return '🍔';
    case 'groceries':
      return '🛒';
    case 'transport':
      return '🚗';
    case 'shopping':
      return '🛍️';
    case 'health':
      return '💊';
    case 'misc':
      return '✨';
    default:
      return '🧾';
  }
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

const calculateSpentForCategory = (categoryId: string, receiptsData: Receipt[]): number => {
  return receiptsData
    .filter(r => r.categoryId === categoryId && isInCurrentMonth(r.date))
    .reduce((sum, r) => sum + r.amount, 0);
};

const recalculateBudgets = (stored: StoredBudget[], receiptsData: Receipt[]): Budget[] => {
  const next = stored.map(b => {
    const spent = calculateSpentForCategory(b.categoryId, receiptsData);
    const percentage = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
    return {
      ...b,
      spent,
      percentage,
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
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [monthlyTotal, setMonthlyTotal] = useState({
    budget: 0,
    spent: 0,
    remaining: 0,
    percentage: 0,
  });

  const [showAddBudgetModal, setShowAddBudgetModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption | null>(null);
  const [amountText, setAmountText] = useState('');

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

  const calculateMonthlyTotal = useCallback((budgetsData: Budget[]) => {
    const totalBudget = budgetsData.reduce((sum, b) => sum + b.amount, 0);
    const totalSpent = budgetsData.reduce((sum, b) => sum + b.spent, 0);
    const remaining = totalBudget - totalSpent;
    const percentage = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

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
        categoryIcon: b.categoryIcon || getCategoryIcon(b.categoryId),
      }));

      setReceipts(typedReceipts);

      const recalculated = recalculateBudgets(typedBudgets, typedReceipts);
      setBudgets(recalculated);
      calculateMonthlyTotal(recalculated);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading budgets:', error);
    } finally {
      setLoading(false);
    }
  }, [calculateMonthlyTotal]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useFocusEffect(
    useCallback(() => {
      hydrate();
    }, [hydrate]),
  );

  const openAddModal = useCallback(() => {
    setEditingBudget(null);
    setSelectedCategory(null);
    setAmountText('');
    setShowAddBudgetModal(true);
  }, []);

  const openEditModal = useCallback((budget: Budget) => {
    setEditingBudget(budget);
    const found = DEFAULT_CATEGORIES.find(c => c.id === budget.categoryId);
    setSelectedCategory(found ?? { id: budget.categoryId, name: budget.categoryName, color: COLORS.chart[0] });
    setAmountText(String(budget.amount));
    setShowAddBudgetModal(true);
  }, []);

  const closeBudgetModal = useCallback(() => {
    setShowAddBudgetModal(false);
    setEditingBudget(null);
    setSelectedCategory(null);
    setAmountText('');
  }, []);

  const persistAndRefresh = useCallback(
    async (nextStored: StoredBudget[]) => {
      // Persist all changes (upserts/deletes done already), then recalc from receipts
      const recalculated = recalculateBudgets(nextStored, receipts);
      setBudgets(recalculated);
      calculateMonthlyTotal(recalculated);
    },
    [calculateMonthlyTotal, receipts],
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

  const rightAction = useMemo(
    () => (
      <IconButton
        accessibilityLabel="Add budget"
        variant="ghost"
        size="md"
        onPress={openAddModal}
        icon={<Feather name="plus" size={ICON_SIZES.md} color={primary} />}
      />
    ),
    [openAddModal, primary],
  );

  const monthlyGradient = useMemo(() => getProgressGradient(monthlyTotal.percentage), [monthlyTotal.percentage]);
  const monthlyVisualPct = useMemo(() => clamp(monthlyTotal.percentage, 0, 100), [monthlyTotal.percentage]);
  const remainingColor = monthlyTotal.remaining >= 0 ? COLORS.semantic.success : COLORS.semantic.error;

  const renderBudget: ListRenderItem<Budget> = useCallback(
    ({ item }) => {
      const statusColor = getStatusColor(item.status);
      const visualPct = clamp(item.percentage, 0, 100);

      return (
        <Card
          variant="default"
          style={styles.budgetCard}
          onPress={() => openEditModal(item)}
          accessibilityLabel={`Budget for ${item.categoryName}`}
        >
          <View style={styles.budgetHeaderRow}>
            <View style={styles.budgetTitleRow}>
              <Text style={styles.categoryIcon}>{item.categoryIcon}</Text>
              <Text style={styles.budgetTitle} numberOfLines={1}>
                {item.categoryName}
              </Text>
            </View>

            <Badge text={getStatusLabel(item.status)} variant={getStatusBadgeVariant(item.status)} />
          </View>

          <Text style={styles.budgetAmounts}>
            {formatCurrency(item.spent)} / {formatCurrency(item.amount)}
          </Text>

          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${visualPct}%`, backgroundColor: statusColor }]} />
            </View>
          </View>

          <View style={styles.budgetFooterRow}>
            <Text style={[styles.budgetPct, { color: statusColor }]}>{item.percentage}%</Text>
            <IconButton
              accessibilityLabel={`Delete ${item.categoryName} budget`}
              variant="ghost"
              size="sm"
              onPress={() => handleDeleteBudget(item.id)}
              icon={<Feather name="trash-2" size={ICON_SIZES.sm} color={colors.textSecondary} />}
            />
          </View>
        </Card>
      );
    },
    [colors.textSecondary, handleDeleteBudget, openEditModal, styles],
  );

  const listHeader = useMemo(() => {
    return (
      <View>
        <Card variant="glassmorphism" style={styles.monthlyCard}>
          <LinearGradient
            colors={Array.from([`${primary}22`, `${primary}10`])}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <Text style={styles.monthlyLabel}>Monthly Budget</Text>
          <Text style={styles.monthlyAmount}>
            {formatCurrency(monthlyTotal.spent)} / {formatCurrency(monthlyTotal.budget)}
          </Text>

          <View style={styles.monthlyProgressRow}>
            <View style={styles.monthlyProgressTrack}>
              <LinearGradient
                colors={Array.from(monthlyGradient)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.monthlyProgressFill, { width: `${monthlyVisualPct}%` }]}
              />
            </View>
            <Text style={styles.monthlyPct}>{monthlyTotal.percentage}%</Text>
          </View>

          <Text style={[styles.remainingText, { color: remainingColor }]}>
            {formatCurrency(Math.abs(monthlyTotal.remaining))} {monthlyTotal.remaining >= 0 ? 'remaining' : 'over'}
          </Text>
        </Card>

        <Text style={styles.sectionTitle}>Category Budgets</Text>
      </View>
    );
  }, [
    monthlyGradient,
    monthlyTotal.budget,
    monthlyTotal.percentage,
    monthlyTotal.remaining,
    monthlyTotal.spent,
    monthlyVisualPct,
    primary,
    remainingColor,
    styles,
  ]);

  const budgetModalTitle = editingBudget ? 'Edit Budget' : 'Add Budget';

  const selectedCategoryLabel = selectedCategory?.name ?? 'Select category';

  const showEmpty = !loading && budgets.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title="Budget Manager" onBack={() => navigation.goBack()} showBackButton rightAction={rightAction} />

      {showEmpty ? (
        <EmptyState
          icon={<Feather name="dollar-sign" size={80} color={colors.textTertiary} />}
          title="No Budgets Set"
          description="Create budgets to track your spending by category"
          action={{ label: 'Add Budget', onPress: openAddModal }}
        />
      ) : (
        <FlatList
          data={budgets}
          keyExtractor={item => item.id}
          renderItem={renderBudget}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add Budget"
        onPress={openAddModal}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <LinearGradient
          colors={Array.from(GRADIENTS.primary)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Feather name="plus" size={24} color={COLORS.common.white} />
      </Pressable>

      <Modal
        isVisible={showAddBudgetModal}
        onBackdropPress={closeBudgetModal}
        onBackButtonPress={closeBudgetModal}
        backdropOpacity={0.5}
        useNativeDriver
      >
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })}>
          <Card variant="default" style={styles.modalCard}>
            <Text style={styles.modalTitle}>{budgetModalTitle}</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pick category"
              onPress={() => setShowCategoryPicker(true)}
              style={({ pressed }) => [styles.categoryPickRow, pressed && styles.categoryPickPressed]}
            >
              <Text style={styles.categoryPickText} numberOfLines={1}>
                {selectedCategoryLabel}
              </Text>
              <Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textSecondary} />
            </Pressable>

            <Input
              value={amountText}
              onChangeText={setAmountText}
              label="Budget Amount"
              placeholder="0.00"
              keyboardType={Platform.select({ ios: 'decimal-pad', android: 'numeric', default: 'numeric' })}
              accessibilityLabel="Budget Amount"
              style={styles.amountInput}
            />

            <View style={styles.modalActionsRow}>
              <Button title="Cancel" onPress={closeBudgetModal} variant="secondary" />
              <View style={{ width: SPACING.sm }} />
              <Button title="Save" onPress={handleSaveBudget} variant="primary" />
            </View>
          </Card>
        </KeyboardAvoidingView>
      </Modal>

      <CategoryPickerModal
        visible={showCategoryPicker}
        selectedId={selectedCategory?.id}
        categories={DEFAULT_CATEGORIES}
        onSelect={cat => setSelectedCategory(cat)}
        onClose={() => setShowCategoryPicker(false)}
      />

      <LoadingOverlay visible={loading} message="Loading budgets…" />
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
  };
  primary: string;
}) => {
  const cardTitle: TextStyle = { ...TYPOGRAPHY.cardTitle, color: colors.text };
  const sectionHeading: TextStyle = { ...TYPOGRAPHY.sectionHeading, color: colors.text };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    listContent: {
      paddingBottom: SPACING['3xl'],
    },

    monthlyCard: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.xl,
      padding: 20,
    },
    monthlyLabel: {
      ...TYPOGRAPHY.label,
      color: colors.textSecondary,
      marginBottom: SPACING.xs,
    },
    monthlyAmount: {
      fontSize: 24,
      fontWeight: '600',
      color: colors.text,
      marginBottom: SPACING.md,
    },
    monthlyProgressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    monthlyProgressTrack: {
      flex: 1,
      height: 8,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(255,255,255,0.20)',
      overflow: 'hidden',
    },
    monthlyProgressFill: {
      height: 8,
      borderRadius: RADIUS.full,
    },
    monthlyPct: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginLeft: SPACING.md,
      width: 52,
      textAlign: 'right',
    },
    remainingText: {
      ...TYPOGRAPHY.bodyNormal,
      fontWeight: '600',
    },

    sectionTitle: {
      ...sectionHeading,
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
    },

    budgetCard: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
      padding: 16,
    },
    budgetHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    budgetTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      paddingRight: SPACING.md,
    },
    categoryIcon: {
      fontSize: 18,
      marginRight: SPACING.sm,
    },
    budgetTitle: {
      ...cardTitle,
      flexShrink: 1,
    },
    budgetAmounts: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      marginTop: SPACING.sm,
    },

    progressWrap: {
      marginTop: SPACING.sm,
    },
    progressTrack: {
      height: 6,
      borderRadius: RADIUS.full,
      backgroundColor: colors.disabled,
      overflow: 'hidden',
    },
    progressFill: {
      height: 6,
      borderRadius: RADIUS.full,
    },

    budgetFooterRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: SPACING.sm,
    },
    budgetPct: {
      ...TYPOGRAPHY.caption,
      fontWeight: '700',
    },

    fab: {
      position: 'absolute',
      right: 24,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      ...(Platform.OS === 'android'
        ? { elevation: 8 }
        : {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.2,
            shadowRadius: 12,
          }),
    },
    fabPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.98 }],
    },

    modalCard: {
      padding: SPACING.lg,
    },
    modalTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },
    categoryPickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      backgroundColor: colors.surface,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.md,
    },
    categoryPickPressed: {
      opacity: 0.85,
    },
    categoryPickText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      flex: 1,
      paddingRight: SPACING.md,
    },
    amountInput: {
      marginBottom: SPACING.lg,
    },
    modalActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  });
};

export default BudgetScreen;
