import AsyncStorage from '@react-native-async-storage/async-storage';

import { getUserScopedKeyForActiveUser } from '@/utils/userScopedStorage';

export interface MiscSpendCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
}

const STORAGE_KEY = 'receiptstacker.miscSpendCategories' as const;

type StoredState = {
  categories: MiscSpendCategory[];
};

const readState = async (): Promise<StoredState> => {
  const scopedKey = await getUserScopedKeyForActiveUser(STORAGE_KEY);
  if (!scopedKey) return { categories: [] };

  const raw = await AsyncStorage.getItem(scopedKey);
  if (!raw) return { categories: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return { categories: Array.isArray(parsed.categories) ? (parsed.categories as MiscSpendCategory[]) : [] };
  } catch {
    return { categories: [] };
  }
};

const writeState = async (state: StoredState): Promise<void> => {
  const scopedKey = await getUserScopedKeyForActiveUser(STORAGE_KEY);
  if (!scopedKey) return;
  await AsyncStorage.setItem(scopedKey, JSON.stringify(state));
};

export const listMiscSpendCategories = async (): Promise<MiscSpendCategory[]> => {
  const state = await readState();
  return state.categories;
};

export const addMiscSpendCategory = async (category: MiscSpendCategory): Promise<void> => {
  const state = await readState();
  const next = [category, ...state.categories.filter(c => c.id !== category.id)];
  await writeState({ categories: next });
};

export const deleteMiscSpendCategoryById = async (id: string): Promise<void> => {
  const state = await readState();
  const next = state.categories.filter(c => c.id !== id);
  await writeState({ categories: next });
};
