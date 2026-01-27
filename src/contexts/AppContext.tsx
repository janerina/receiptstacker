import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import {
  deleteCustomCategoryById,
  listCustomCategories,
  listDefaultCategoryOverrides,
  upsertCustomCategory,
  upsertDefaultCategoryOverride,
  type StoredCategory,
} from '@/utils/categoriesStore';
import { deleteTagById, listTags, upsertTag, type StoredTag } from '@/utils/tagsStore';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  icon?: string;
}

export interface AppState {
  categories: Category[];
  tags: Tag[];
  isLoading: boolean;
}

export interface AppContextValue extends AppState {
  error: string | null;
  loadCategories: () => Promise<void>;
  loadTags: () => Promise<void>;
  addCategory: (category: Omit<Category, 'id' | 'isDefault'>) => Promise<void>;
  updateCategory: (id: string, category: Partial<Omit<Category, 'id'>>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addTag: (tag: Omit<Tag, 'id'>) => Promise<void>;
  updateTag: (id: string, tag: Partial<Omit<Tag, 'id'>>) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  clearError: () => void;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export interface AppProviderProps {
  children: React.ReactNode;
}

const DEFAULT_CATEGORIES: Array<Omit<Category, 'isDefault'>> = [
  { id: 'food', name: 'Food & Dining', icon: 'utensils', color: '#10b981' },
  { id: 'groceries', name: 'Groceries', icon: 'shopping-cart', color: '#22c55e' },
  { id: 'transport', name: 'Transport', icon: 'car', color: '#3b82f6' },
  { id: 'shopping', name: 'Shopping', icon: 'shopping-bag', color: '#a855f7' },
  { id: 'health', name: 'Health', icon: 'heart', color: '#ef4444' },
  { id: 'misc', name: 'Misc', icon: 'more-horizontal', color: '#f59e0b' },
] as const;

const makeId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

const applyOverrides = (
  defaults: Array<Omit<Category, 'isDefault'>>,
  overrides: Array<{ id: string; name?: string; iconName?: string; color?: string }>,
): Category[] => {
  const map = new Map(overrides.map((o) => [o.id, o]));
  return defaults.map((c) => {
    const o = map.get(c.id);
    return {
      id: c.id,
      name: o?.name ?? c.name,
      icon: o?.iconName ?? c.icon,
      color: o?.color ?? c.color,
      isDefault: true,
    };
  });
};

const toCategory = (c: StoredCategory): Category => ({
  id: c.id,
  name: c.name,
  icon: c.iconName,
  color: c.color,
  isDefault: false,
});

const toTag = (t: StoredTag): Tag => ({
  id: t.id,
  name: t.name,
  color: t.color,
  icon: t.icon,
});

export const AppProvider = ({ children }: AppProviderProps) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    setError(null);
    try {
      const [custom, overrides] = await Promise.all([
        listCustomCategories(),
        listDefaultCategoryOverrides(),
      ]);

      const defaults = applyOverrides(DEFAULT_CATEGORIES, overrides);
      const customMapped = custom.map(toCategory);

      // Defaults first, then custom.
      setCategories([...defaults, ...customMapped]);
    } catch (e) {
      setCategories([]);
      setError(e instanceof Error ? e.message : 'Failed to load categories');
    }
  }, []);

  const loadTags = useCallback(async () => {
    setError(null);
    try {
      const stored = await listTags();
      setTags(stored.map(toTag));
    } catch (e) {
      setTags([]);
      setError(e instanceof Error ? e.message : 'Failed to load tags');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      try {
        await Promise.all([loadCategories(), loadTags()]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [loadCategories, loadTags]);

  const addCategory = useCallback(
    async (category: Omit<Category, 'id' | 'isDefault'>) => {
      setError(null);
      const now = new Date().toISOString();
      const stored: StoredCategory = {
        id: makeId(),
        name: category.name.trim(),
        iconName: category.icon,
        color: category.color,
        createdAt: now,
        updatedAt: now,
      };

      // Optimistic.
      setCategories((prev) => [...prev, toCategory(stored)]);

      try {
        await upsertCustomCategory(stored);
      } catch (e) {
        // Re-sync.
        await loadCategories();
        setError(e instanceof Error ? e.message : 'Failed to add category');
        throw e;
      }
    },
    [loadCategories],
  );

  const updateCategory = useCallback(
    async (id: string, patch: Partial<Omit<Category, 'id'>>) => {
      setError(null);
      const existing = categories.find((c) => c.id === id);
      if (!existing) return;

      // Optimistic.
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

      try {
        const now = new Date().toISOString();

        if (existing.isDefault) {
          // Update defaults via override record.
          await upsertDefaultCategoryOverride({
            id,
            name: patch.name?.trim() || undefined,
            iconName: patch.icon || undefined,
            color: patch.color || undefined,
            updatedAt: now,
          });
          return;
        }

        // Custom category update.
        const custom = await listCustomCategories();
        const found = custom.find((c) => c.id === id);
        if (!found) return;

        const next: StoredCategory = {
          ...found,
          name: (patch.name ?? found.name).trim(),
          iconName: patch.icon ?? found.iconName,
          color: patch.color ?? found.color,
          updatedAt: now,
        };

        await upsertCustomCategory(next);
      } catch (e) {
        await loadCategories();
        setError(e instanceof Error ? e.message : 'Failed to update category');
        throw e;
      }
    },
    [categories, loadCategories],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      setError(null);
      const existing = categories.find((c) => c.id === id);
      if (!existing) return;

      if (existing.isDefault) {
        setError('Default categories cannot be deleted');
        throw new Error('Default categories cannot be deleted');
      }

      // Optimistic.
      setCategories((prev) => prev.filter((c) => c.id !== id));
      try {
        await deleteCustomCategoryById(id);
      } catch (e) {
        await loadCategories();
        setError(e instanceof Error ? e.message : 'Failed to delete category');
        throw e;
      }
    },
    [categories, loadCategories],
  );

  const addTag = useCallback(
    async (tag: Omit<Tag, 'id'>) => {
      setError(null);
      const now = new Date().toISOString();
      const stored: StoredTag = {
        id: makeId(),
        name: tag.name.trim(),
        color: tag.color,
        icon: tag.icon,
        createdAt: now,
        updatedAt: now,
      };

      setTags((prev) => [toTag(stored), ...prev]);
      try {
        await upsertTag(stored);
      } catch (e) {
        await loadTags();
        setError(e instanceof Error ? e.message : 'Failed to add tag');
        throw e;
      }
    },
    [loadTags],
  );

  const updateTag = useCallback(
    async (id: string, patch: Partial<Omit<Tag, 'id'>>) => {
      setError(null);
      const existing = tags.find((t) => t.id === id);
      if (!existing) return;

      setTags((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      try {
        const now = new Date().toISOString();
        const stored: StoredTag = {
          id,
          name: (patch.name ?? existing.name).trim(),
          color: patch.color ?? existing.color,
          icon: patch.icon ?? existing.icon,
          createdAt: now,
          updatedAt: now,
        };
        // Preserve createdAt if possible.
        const all = await listTags();
        const found = all.find((t) => t.id === id);
        if (found) stored.createdAt = found.createdAt;

        await upsertTag(stored);
      } catch (e) {
        await loadTags();
        setError(e instanceof Error ? e.message : 'Failed to update tag');
        throw e;
      }
    },
    [loadTags, tags],
  );

  const deleteTag = useCallback(
    async (id: string) => {
      setError(null);
      setTags((prev) => prev.filter((t) => t.id !== id));
      try {
        await deleteTagById(id);
      } catch (e) {
        await loadTags();
        setError(e instanceof Error ? e.message : 'Failed to delete tag');
        throw e;
      }
    },
    [loadTags],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      categories,
      tags,
      isLoading,
      error,
      loadCategories,
      loadTags,
      addCategory,
      updateCategory,
      deleteCategory,
      addTag,
      updateTag,
      deleteTag,
      clearError: () => setError(null),
    }),
    [
      categories,
      tags,
      isLoading,
      error,
      loadCategories,
      loadTags,
      addCategory,
      updateCategory,
      deleteCategory,
      addTag,
      updateTag,
      deleteTag,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextValue => {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within an AppProvider');
  return ctx;
};
