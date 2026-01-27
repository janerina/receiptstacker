import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StoredTag {
  id: string;
  name: string;
  color: string;
  icon?: string; // emoji
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

const STORAGE_KEY = 'receiptstacker.tags' as const;

type StoredState = {
  tags: StoredTag[];
};

const readState = async (): Promise<StoredState> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return { tags: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return { tags: Array.isArray(parsed.tags) ? (parsed.tags as StoredTag[]) : [] };
  } catch {
    return { tags: [] };
  }
};

const writeState = async (state: StoredState): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const listTags = async (): Promise<StoredTag[]> => {
  const state = await readState();
  return state.tags;
};

export const upsertTag = async (tag: StoredTag): Promise<void> => {
  const state = await readState();
  const idx = state.tags.findIndex(t => t.id === tag.id);
  const next = [...state.tags];

  if (idx >= 0) {
    next[idx] = tag;
  } else {
    next.unshift(tag);
  }

  await writeState({ tags: next });
};

export const deleteTagById = async (id: string): Promise<void> => {
  const state = await readState();
  const next = state.tags.filter(t => t.id !== id);
  await writeState({ tags: next });
};
