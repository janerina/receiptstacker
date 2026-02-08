import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from './AuthContext';
import { useApp } from './AppContext';
import { useReceipts } from './ReceiptContext';
import { getUserScopedKeyForActiveUser } from '@/utils/userScopedStorage';

export interface Budget {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  spent: number;
  month: string; // YYYY-MM
}

export interface BudgetsState {
  budgets: Budget[];
  isLoading: boolean;
}

export interface BudgetContextValue extends BudgetsState {
  error: string | null;
  loadBudgets: () => Promise<void>;
  addBudget: (categoryId: string, amount: number, month: string) => Promise<void>;
  updateBudget: (id: string, amount: number) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
  getBudgetByCategory: (categoryId: string, month: string) => Budget | undefined;
  calculateSpent: (categoryId: string, month: string) => number;
  clearError: () => void;
}

export const BudgetContext = createContext<BudgetContextValue | undefined>(undefined);

export interface BudgetProviderProps {
  children: React.ReactNode;
}

type StoredBudget = Omit<Budget, 'spent'>;

const STORAGE_KEY = 'receiptstacker.budgets.v2' as const;

const toDate = (value: Date | string): Date => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
};

const monthKeyFor = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const makeId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

const readStored = async (): Promise<StoredBudget[]> => {
  const scopedKey = await getUserScopedKeyForActiveUser(STORAGE_KEY);
  if (!scopedKey) return [];

  const raw = await AsyncStorage.getItem(scopedKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { budgets?: StoredBudget[] };
    return Array.isArray(parsed.budgets) ? parsed.budgets : [];
  } catch {
    return [];
  }
};

const writeStored = async (budgets: StoredBudget[]): Promise<void> => {
  const scopedKey = await getUserScopedKeyForActiveUser(STORAGE_KEY);
  if (!scopedKey) return;
  await AsyncStorage.setItem(scopedKey, JSON.stringify({ budgets }));
};

export const BudgetProvider = ({ children }: BudgetProviderProps) => {
  const { user, isAuthenticated } = useAuth();
  const { receipts } = useReceipts();
  const { categories } = useApp();

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const calculateSpent = useCallback(
    (categoryId: string, month: string) => {
      return receipts
        .filter((r) => r.categoryId === categoryId)
        .filter((r) => monthKeyFor(toDate(r.date)) === month)
        .reduce((sum, r) => sum + (typeof r.amount === 'number' ? r.amount : 0), 0);
    },
    [receipts],
  );

  const materialize = useCallback(
    (stored: StoredBudget[]): Budget[] => {
      return stored.map((b) => ({
        ...b,
        spent: calculateSpent(b.categoryId, b.month),
      }));
    },
    [calculateSpent],
  );

  const loadBudgets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const stored = await readStored();
      setBudgets(materialize(stored));
    } catch (e) {
      setBudgets([]);
      setError(e instanceof Error ? e.message : 'Failed to load budgets');
    } finally {
      setIsLoading(false);
    }
  }, [materialize]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await loadBudgets();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [loadBudgets]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setBudgets([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    void loadBudgets();
  }, [isAuthenticated, loadBudgets, user?.id]);

  // Recompute spent when receipts change.
  useEffect(() => {
    setBudgets((prev) => prev.map((b) => ({ ...b, spent: calculateSpent(b.categoryId, b.month) })));
  }, [calculateSpent]);

  const addBudget = useCallback(
    async (categoryId: string, amount: number, month: string) => {
      setError(null);

      const category = categories.find((c) => c.id === categoryId);
      const categoryName = category?.name ?? categoryId;

      const storedBudget: StoredBudget = {
        id: makeId(),
        categoryId,
        categoryName,
        amount,
        month,
      };

      const next: Budget = { ...storedBudget, spent: calculateSpent(categoryId, month) };
      const prev = budgets;
      setBudgets([next, ...prev]);

      try {
        const existing = await readStored();
        await writeStored([storedBudget, ...existing]);
      } catch (e) {
        setBudgets(prev);
        setError(e instanceof Error ? e.message : 'Failed to add budget');
        throw e;
      }
    },
    [budgets, calculateSpent, categories],
  );

  const updateBudget = useCallback(
    async (id: string, amount: number) => {
      setError(null);
      const prev = budgets;
      const idx = prev.findIndex((b) => b.id === id);
      if (idx < 0) return;

      const updated: Budget = { ...prev[idx], amount };
      const next = [...prev];
      next[idx] = updated;
      setBudgets(next);

      try {
        const stored = await readStored();
        const nextStored = stored.map((b) => (b.id === id ? { ...b, amount } : b));
        await writeStored(nextStored);
      } catch (e) {
        setBudgets(prev);
        setError(e instanceof Error ? e.message : 'Failed to update budget');
        throw e;
      }
    },
    [budgets],
  );

  const deleteBudget = useCallback(
    async (id: string) => {
      setError(null);
      const prev = budgets;
      setBudgets(prev.filter((b) => b.id !== id));
      try {
        const stored = await readStored();
        await writeStored(stored.filter((b) => b.id !== id));
      } catch (e) {
        setBudgets(prev);
        setError(e instanceof Error ? e.message : 'Failed to delete budget');
        throw e;
      }
    },
    [budgets],
  );

  const getBudgetByCategory = useCallback(
    (categoryId: string, month: string) => budgets.find((b) => b.categoryId === categoryId && b.month === month),
    [budgets],
  );

  const value = useMemo<BudgetContextValue>(
    () => ({
      budgets,
      isLoading,
      error,
      loadBudgets,
      addBudget,
      updateBudget,
      deleteBudget,
      getBudgetByCategory,
      calculateSpent,
      clearError: () => setError(null),
    }),
    [
      budgets,
      isLoading,
      error,
      loadBudgets,
      addBudget,
      updateBudget,
      deleteBudget,
      getBudgetByCategory,
      calculateSpent,
    ],
  );

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
};

export const useBudgets = (): BudgetContextValue => {
  const ctx = React.useContext(BudgetContext);
  if (!ctx) throw new Error('useBudgets must be used within a BudgetProvider');
  return ctx;
};
