import AsyncStorage from '@react-native-async-storage/async-storage';

import { getUserScopedKeyForActiveUser } from '@/utils/userScopedStorage';

export interface Category {
  id: string;
  name: string;
  iconName: string;
  color: string;
}

export interface DefaultCategoryOverride {
  id: string; // default category id
  name?: string;
  iconName?: string;
  color?: string;
  updatedAt: string; // ISO
}

export interface StoredCategory extends Category {
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

const STORAGE_KEY = 'receiptstacker.categories' as const;

type StoredState = {
  custom: StoredCategory[];
  defaultOverrides: DefaultCategoryOverride[];
};

const readState = async (): Promise<StoredState> => {
  const scopedKey = await getUserScopedKeyForActiveUser(STORAGE_KEY);
  if (!scopedKey) return { custom: [], defaultOverrides: [] };

  const raw = await AsyncStorage.getItem(scopedKey);
  if (!raw) return { custom: [], defaultOverrides: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      custom: Array.isArray(parsed.custom) ? (parsed.custom as StoredCategory[]) : [],
      defaultOverrides: Array.isArray(parsed.defaultOverrides)
        ? (parsed.defaultOverrides as DefaultCategoryOverride[])
        : [],
    };
  } catch {
    return { custom: [], defaultOverrides: [] };
  }
};

const writeState = async (state: StoredState): Promise<void> => {
  const scopedKey = await getUserScopedKeyForActiveUser(STORAGE_KEY);
  if (!scopedKey) return;
  await AsyncStorage.setItem(scopedKey, JSON.stringify(state));
};

export const listCustomCategories = async (): Promise<StoredCategory[]> => {
  const state = await readState();
  return state.custom;
};

export const upsertCustomCategory = async (category: StoredCategory): Promise<void> => {
  const state = await readState();
  const idx = state.custom.findIndex(c => c.id === category.id);
  const next = [...state.custom];

  if (idx >= 0) {
    next[idx] = category;
  } else {
    next.unshift(category);
  }

  await writeState({ ...state, custom: next });
};

export const deleteCustomCategoryById = async (id: string): Promise<void> => {
  const state = await readState();
  const next = state.custom.filter(c => c.id !== id);
  await writeState({ ...state, custom: next });
};

export const listDefaultCategoryOverrides = async (): Promise<DefaultCategoryOverride[]> => {
  const state = await readState();
  return state.defaultOverrides;
};

export const upsertDefaultCategoryOverride = async (override: DefaultCategoryOverride): Promise<void> => {
  const state = await readState();
  const idx = state.defaultOverrides.findIndex(o => o.id === override.id);
  const next = [...state.defaultOverrides];

  if (idx >= 0) {
    next[idx] = override;
  } else {
    next.unshift(override);
  }

  await writeState({ ...state, defaultOverrides: next });
};

export const clearDefaultCategoryOverride = async (id: string): Promise<void> => {
  const state = await readState();
  const next = state.defaultOverrides.filter(o => o.id !== id);
  await writeState({ ...state, defaultOverrides: next });
};
