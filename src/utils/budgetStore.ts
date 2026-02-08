import AsyncStorage from '@react-native-async-storage/async-storage';

import { getUserScopedKeyForActiveUser } from '@/utils/userScopedStorage';

export interface StoredBudget {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  amount: number;
}

const STORAGE_KEY = 'receiptstacker.budgets' as const;

type StoredState = {
  budgets: StoredBudget[];
};

const readState = async (): Promise<StoredState> => {
  const scopedKey = await getUserScopedKeyForActiveUser(STORAGE_KEY);
  if (!scopedKey) return { budgets: [] };

  const raw = await AsyncStorage.getItem(scopedKey);
  if (!raw) return { budgets: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return { budgets: Array.isArray(parsed.budgets) ? (parsed.budgets as StoredBudget[]) : [] };
  } catch {
    return { budgets: [] };
  }
};

const writeState = async (state: StoredState): Promise<void> => {
  const scopedKey = await getUserScopedKeyForActiveUser(STORAGE_KEY);
  if (!scopedKey) return;
  await AsyncStorage.setItem(scopedKey, JSON.stringify(state));
};

export const listBudgets = async (): Promise<StoredBudget[]> => {
  const state = await readState();
  return state.budgets;
};

export const getBudgetById = async (id: string): Promise<StoredBudget | null> => {
  const state = await readState();
  return state.budgets.find(b => b.id === id) ?? null;
};

export const upsertBudget = async (budget: StoredBudget): Promise<void> => {
  const state = await readState();
  const idx = state.budgets.findIndex(b => b.id === budget.id);
  const next = [...state.budgets];

  if (idx >= 0) {
    next[idx] = budget;
  } else {
    next.unshift(budget);
  }

  await writeState({ budgets: next });
};

export const deleteBudgetById = async (id: string): Promise<void> => {
  const state = await readState();
  const next = state.budgets.filter(b => b.id !== id);
  await writeState({ budgets: next });
};
