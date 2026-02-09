import AsyncStorage from '@react-native-async-storage/async-storage';

import { getUserScopedKeyForActiveUser } from '@/utils/userScopedStorage';

export interface MiscExpense {
  id: string;
  amount: number;
  description: string;
  categoryId: string;
  categoryName: string;
  date: string; // ISO
}

type MiscSpendChangeListener = () => void;

const listeners = new Set<MiscSpendChangeListener>();

const emitChange = () => {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // ignore listener errors
    }
  }
};

export const subscribeMiscSpendChanges = (listener: MiscSpendChangeListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const STORAGE_KEY = 'receiptstacker.miscSpend' as const;

type StoredState = {
  expenses: MiscExpense[];
};

const readState = async (): Promise<StoredState> => {
  const scopedKey = await getUserScopedKeyForActiveUser(STORAGE_KEY);
  if (!scopedKey) return { expenses: [] };

  const raw = await AsyncStorage.getItem(scopedKey);
  if (!raw) return { expenses: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return { expenses: Array.isArray(parsed.expenses) ? (parsed.expenses as MiscExpense[]) : [] };
  } catch {
    return { expenses: [] };
  }
};

const writeState = async (state: StoredState): Promise<void> => {
  const scopedKey = await getUserScopedKeyForActiveUser(STORAGE_KEY);
  if (!scopedKey) return;
  await AsyncStorage.setItem(scopedKey, JSON.stringify(state));
};

export const listMiscExpenses = async (): Promise<MiscExpense[]> => {
  const state = await readState();
  return state.expenses;
};

export const upsertMiscExpense = async (expense: MiscExpense): Promise<void> => {
  const state = await readState();
  const idx = state.expenses.findIndex(e => e.id === expense.id);
  const next = [...state.expenses];

  if (idx >= 0) {
    next[idx] = expense;
  } else {
    next.unshift(expense);
  }

  await writeState({ expenses: next });
  emitChange();
};

export const deleteMiscExpenseById = async (id: string): Promise<void> => {
  const state = await readState();
  const next = state.expenses.filter(e => e.id !== id);
  await writeState({ expenses: next });
  emitChange();
};
