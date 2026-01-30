import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';

import { Button, Card, CategoryIcon, Input } from '@/components/common';
import { ColorPickerModal } from '@/components/modals';
import { LoadingOverlay } from '@/components/compositions';
import { COLORS, ICON_SIZES, SPACING, TYPOGRAPHY } from '@/constants';
import type { HomeStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrency } from '@/utils/format';
import { listReceipts, upsertReceipt } from '@/utils/receiptStore';
import {
  deleteCustomCategoryById,
  listCustomCategories,
  listDefaultCategoryOverrides,
  upsertCustomCategory,
  upsertDefaultCategoryOverride,
  type Category,
  type DefaultCategoryOverride,
  type StoredCategory,
} from '@/utils/categoriesStore';

type Props = NativeStackScreenProps<HomeStackParamList, 'Categories'>;

type SortBy = 'name' | 'spent' | 'receipts';

type ReceiptLite = {
  id: string;
  amount: number;
  categoryId: string;
  category: string;
  categoryColor: string;
};

type CategoryRow = {
  category: Category;
  isDefault: boolean;
  receiptCount: number;
  totalSpent: number;
};

const PRESET_COLORS = COLORS.chart;

// Prompt-specified defaults plus a couple legacy ids used elsewhere in the app.
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food', name: 'Food & Dining', iconName: 'utensils', color: '#10b981' },
  { id: 'transport', name: 'Transportation', iconName: 'car', color: '#3b82f6' },
  { id: 'shopping', name: 'Shopping', iconName: 'shopping-bag', color: '#8b5cf6' },
  { id: 'entertainment', name: 'Entertainment', iconName: 'film', color: '#ec4899' },
  { id: 'health', name: 'Health', iconName: 'heart', color: '#ef4444' },
  { id: 'bills', name: 'Bills', iconName: 'credit-card', color: '#f59e0b' },
  { id: 'travel', name: 'Travel', iconName: 'map-pin', color: '#3b82f6' },
  { id: 'other', name: 'Other', iconName: 'tag', color: '#94a3b8' },
  // legacy ids used by earlier screens
  { id: 'groceries', name: 'Groceries', iconName: 'shopping-cart', color: '#22c55e' },
  { id: 'misc', name: 'Misc', iconName: 'more-horizontal', color: '#f59e0b' },
];

type EmojiCategoryId = 'smileys' | 'hearts' | 'food' | 'charts' | 'travel' | 'ideas';

const EMOJI_CATEGORIES: Array<{ id: EmojiCategoryId; icon: string; emojis: string[] }> = [
  {
    id: 'smileys',
    icon: '🙂',
    emojis: [
      '😀',
      '😃',
      '😄',
      '😁',
      '😆',
      '😅',
      '🤣',
      '😂',
      '🙂',
      '🙃',
      '😉',
      '😊',
      '😇',
      '🥰',
      '😍',
      '🤩',
      '😘',
      '😗',
      '😚',
      '😋',
      '😛',
      '😝',
      '😜',
      '🤪',
      '😎',
      '🥸',
      '😏',
      '😒',
      '😔',
      '😴',
      '🤔',
      '🤐',
      '😶',
      '😮',
      '😯',
      '😲',
      '🥳',
      '🤗',
      '🤭',
      '🫠',
    ],
  },
  {
    id: 'hearts',
    icon: '❤️',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💖', '💗', '💞', '💘', '💕', '💝', '💟'],
  },
  {
    id: 'food',
    icon: '☕️',
    emojis: ['☕️', '🍵', '🥤', '🍔', '🍟', '🍕', '🌮', '🌯', '🥗', '🍣', '🍜', '🍰', '🍩', '🍪', '🥐', '🍎', '🍌'],
  },
  {
    id: 'charts',
    icon: '📊',
    emojis: ['📊', '📈', '📉', '🧾', '💳', '💰', '🧮', '🧠', '🏷️', '📌', '📦', '🛒', '🧰'],
  },
  {
    id: 'travel',
    icon: '✈️',
    emojis: ['✈️', '🚗', '🚕', '🚌', '🚆', '🚇', '🚲', '🏨', '🧳', '🗺️', '🌍', '⛽️'],
  },
  {
    id: 'ideas',
    icon: '💡',
    emojis: ['💡', '⭐', '🔥', '✅', '🧩', '🎯', '🧑‍💻', '👤', '🤝', '🏠', '🏥', '🎉', '📚'],
  },
];

const normalizeName = (name: string) => name.trim();

const pluralize = (count: number, one: string, many?: string) => {
  if (count === 1) return `1 ${one}`;
  return `${count} ${many ?? `${one}s`}`;
};

const applyOverrides = (defaults: Category[], overrides: DefaultCategoryOverride[]) => {
  const map = new Map(overrides.map(o => [o.id, o] as const));
  return defaults.map(d => {
    const o = map.get(d.id);
    if (!o) return d;
    return {
      ...d,
      name: o.name ?? d.name,
      iconName: o.iconName ?? d.iconName,
      color: o.color ?? d.color,
    };
  });
};

const buildCategoryStats = (receipts: ReceiptLite[]) => {
  const receiptCountByCategory = new Map<string, number>();
  const spentByCategory = new Map<string, number>();

  for (const r of receipts) {
    if (!r.categoryId) continue;
    receiptCountByCategory.set(r.categoryId, (receiptCountByCategory.get(r.categoryId) ?? 0) + 1);
    spentByCategory.set(r.categoryId, (spentByCategory.get(r.categoryId) ?? 0) + (Number.isFinite(r.amount) ? r.amount : 0));
  }

  return { receiptCountByCategory, spentByCategory };
};

export const CategoriesScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;

  const listRef = useRef<any>(null);
  const createAnchorY = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [customCategories, setCustomCategories] = useState<StoredCategory[]>([]);
  const [defaultOverrides, setDefaultOverrides] = useState<DefaultCategoryOverride[]>([]);
  const [receipts, setReceipts] = useState<ReceiptLite[]>([]);

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [filterVisible, setFilterVisible] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  const [createVisible, setCreateVisible] = useState(false);
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [emojiCategory, setEmojiCategory] = useState<EmojiCategoryId>('smileys');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsDefault, setEditingIsDefault] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState<string>(PRESET_COLORS[0]);
  const [draftIcon, setDraftIcon] = useState<string>('🧾');
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const [customColorVisible, setCustomColorVisible] = useState(false);
  const [customColorInitial, setCustomColorInitial] = useState<string>(PRESET_COLORS[0]);

  const scrollToCreatePanel = useCallback(() => {
    const y = createAnchorY.current ?? 0;
    const offset = Math.max(y - SPACING.sm, 0);
    listRef.current?.scrollToOffset?.({ offset, animated: true });
  }, []);

  useEffect(() => {
    if (!createVisible) return;
    requestAnimationFrame(scrollToCreatePanel);
  }, [createVisible, scrollToCreatePanel]);

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

  const openCustomColor = useCallback(() => {
    setCustomColorInitial(draftColor);
    setCustomColorVisible(true);
  }, [draftColor]);

  const hydrate = useCallback(async () => {
    try {
      setLoading(true);
      const [custom, overrides, receiptsList] = await Promise.all([
        listCustomCategories(),
        listDefaultCategoryOverrides(),
        listReceipts(),
      ]);

      setCustomCategories(custom);
      setDefaultOverrides(overrides);
      setReceipts(receiptsList as unknown as ReceiptLite[]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load categories', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const defaultCategories = useMemo(() => applyOverrides(DEFAULT_CATEGORIES, defaultOverrides), [defaultOverrides]);
  const { receiptCountByCategory, spentByCategory } = useMemo(() => buildCategoryStats(receipts), [receipts]);

  const totalCategories = defaultCategories.length + customCategories.length;
  const categorizedReceipts = useMemo(() => receipts.filter(r => !!r.categoryId).length, [receipts]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const all: CategoryRow[] = [
      ...defaultCategories.map(c => ({
        category: c,
        isDefault: true,
        receiptCount: receiptCountByCategory.get(c.id) ?? 0,
        totalSpent: spentByCategory.get(c.id) ?? 0,
      })),
      ...customCategories.map(c => ({
        category: c,
        isDefault: false,
        receiptCount: receiptCountByCategory.get(c.id) ?? 0,
        totalSpent: spentByCategory.get(c.id) ?? 0,
      })),
    ].filter(r => (q ? r.category.name.toLowerCase().includes(q) : true));

    const sorter = (a: CategoryRow, b: CategoryRow) => {
      if (sortBy === 'spent') {
        if (b.totalSpent !== a.totalSpent) return b.totalSpent - a.totalSpent;
        if (b.receiptCount !== a.receiptCount) return b.receiptCount - a.receiptCount;
        return a.category.name.localeCompare(b.category.name);
      }
      if (sortBy === 'receipts') {
        if (b.receiptCount !== a.receiptCount) return b.receiptCount - a.receiptCount;
        if (b.totalSpent !== a.totalSpent) return b.totalSpent - a.totalSpent;
        return a.category.name.localeCompare(b.category.name);
      }
      return a.category.name.localeCompare(b.category.name);
    };

    return all.sort(sorter);
  }, [customCategories, defaultCategories, query, receiptCountByCategory, sortBy, spentByCategory]);

  const openAdd = useCallback(() => {
    setEditingId(null);
    setEditingIsDefault(false);
    setDraftName('');
    setDraftColor(PRESET_COLORS[0]);
    setDraftIcon('🧾');
    setNameError(undefined);
    setFilterVisible(false);
    setSortDropdownOpen(false);
    setCreateVisible(true);
    requestAnimationFrame(scrollToCreatePanel);
  }, [scrollToCreatePanel]);

  const openEdit = useCallback(
    (row: CategoryRow) => {
    setEditingId(row.category.id);
    setEditingIsDefault(row.isDefault);
    setDraftName(row.category.name);
    setDraftColor(row.category.color || PRESET_COLORS[0]);
    setDraftIcon(row.category.iconName || '🧾');
    setNameError(undefined);
    setFilterVisible(false);
    setSortDropdownOpen(false);
    setCreateVisible(true);
      requestAnimationFrame(scrollToCreatePanel);
    },
    [scrollToCreatePanel],
  );

  const closeCreate = useCallback(() => {
    setCreateVisible(false);
    setNameError(undefined);
  }, []);

  const validateName = useCallback(
    (raw: string) => {
      const name = normalizeName(raw);
      if (!name) return 'Name is required';
      if (name.length > 24) return 'Keep it under 24 characters';

      const existingNames = [
        ...defaultCategories.map(c => ({ id: c.id, name: c.name })),
        ...customCategories.map(c => ({ id: c.id, name: c.name })),
      ];

      const conflict = existingNames.some(x => x.name.toLowerCase() === name.toLowerCase() && x.id !== editingId);
      if (conflict) return 'A category with this name already exists';

      return undefined;
    },
    [customCategories, defaultCategories, editingId],
  );

  const updateReceiptsForCategory = useCallback(async (categoryId: string, nextName: string, nextColor: string) => {
    const list = await listReceipts();
    const toUpdate = list.filter(r => r.categoryId === categoryId);
    if (toUpdate.length === 0) return;

    await Promise.all(
      toUpdate.map(r =>
        upsertReceipt({
          ...r,
          category: nextName,
          categoryColor: nextColor,
        }),
      ),
    );
  }, []);

  const onSave = useCallback(async () => {
    const err = validateName(draftName);
    setNameError(err);
    if (err) return;

    const name = normalizeName(draftName);
    const iconName = draftIcon;
    const color = draftColor;

    try {
      setSaving(true);
      const now = new Date().toISOString();

      if (editingId) {
        if (editingIsDefault) {
          const override: DefaultCategoryOverride = {
            id: editingId,
            name,
            iconName,
            color,
            updatedAt: now,
          };

          await upsertDefaultCategoryOverride(override);
          setDefaultOverrides(prev => {
            const idx = prev.findIndex(o => o.id === override.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = override;
              return next;
            }
            return [override, ...prev];
          });

          await updateReceiptsForCategory(editingId, name, color);
        } else {
          const existing = customCategories.find(c => c.id === editingId);
          if (!existing) {
            closeCreate();
            return;
          }

          const next: StoredCategory = {
            ...existing,
            name,
            iconName,
            color,
            updatedAt: now,
          };

          await upsertCustomCategory(next);
          setCustomCategories(prev => prev.map(c => (c.id === editingId ? next : c)));
          await updateReceiptsForCategory(editingId, name, color);
        }
      } else {
        const id = Date.now().toString();
        const next: StoredCategory = {
          id,
          name,
          iconName,
          color,
          createdAt: now,
          updatedAt: now,
        };

        await upsertCustomCategory(next);
        setCustomCategories(prev => [next, ...prev]);
      }

      closeCreate();
      await hydrate();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to save category', e);
      Alert.alert('Error', 'Failed to save category');
    } finally {
      setSaving(false);
    }
  }, [
    closeCreate,
    customCategories,
    draftColor,
    draftIcon,
    draftName,
    editingId,
    editingIsDefault,
    hydrate,
    updateReceiptsForCategory,
    validateName,
  ]);

  const confirmDelete = useCallback(
    (row: CategoryRow) => {
      if (row.isDefault) return;

      const used = receiptCountByCategory.get(row.category.id) ?? 0;
      const message = used > 0 ? `This category is used in ${pluralize(used, 'receipt')}. Continue?` : 'Delete this category?';

      Alert.alert('Delete Category', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await deleteCustomCategoryById(row.category.id);
              setCustomCategories(prev => prev.filter(c => c.id !== row.category.id));
              await hydrate();
            } catch {
              Alert.alert('Error', 'Failed to delete category');
            } finally {
              setSaving(false);
            }
          },
        },
      ]);
    },
    [hydrate, receiptCountByCategory],
  );

  const renderItem: ListRenderItem<(typeof rows)[number]> = useCallback(
    ({ item }) => {
      const { category, receiptCount, totalSpent } = item;

      return (
        <Pressable
          onPress={() => openEdit(item)}
          onLongPress={() => confirmDelete(item)}
          accessibilityRole="button"
          accessibilityLabel={`Open category ${category.name}`}
          style={({ pressed }) => [styles.categoryPressable, pressed && styles.pressed]}
        >
          <Card variant="default" style={styles.categoryCard}>
            <View style={styles.categoryCardTop}>
              <View style={[styles.colorDot, { backgroundColor: category.color || PRESET_COLORS[0] }]} />
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: `${category.color}22`, borderColor: `${category.color}55` },
                ]}
              >
                <CategoryIcon icon={category.iconName} size={22} color={category.color} />
              </View>
            </View>

            <Text style={styles.categoryName} numberOfLines={1}>
              {category.name}
            </Text>

            <View style={styles.categoryMetaRow}>
              <Text style={styles.categoryMetaText} numberOfLines={1}>
                {formatCurrency(totalSpent)}
              </Text>
              <Text style={styles.categoryMetaSep}>•</Text>
              <Text style={styles.categoryMetaText} numberOfLines={1}>
                {pluralize(receiptCount, 'receipt')}
              </Text>
            </View>
          </Card>
        </Pressable>
      );
    },
    [confirmDelete, openEdit, styles],
  );

  const listHeader = (
    <View>
      <View style={styles.topHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>

        <View style={styles.topHeaderText}>
          <Text style={styles.topTitle}>Categories</Text>
          <Text style={styles.topSubtitle}>Organize spending your way</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add Category"
          onPress={openAdd}
          hitSlop={12}
          style={({ pressed }) => [styles.addCircleBtn, pressed && styles.backButtonPressed]}
        >
          <Feather name="plus" size={22} color={primary} />
        </Pressable>
      </View>

      <View style={styles.statsWrap}>
        <View style={styles.statsCard}>
          <LinearGradient
            colors={['#3b82f6', '#6366f1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.statsLeft}>
            <Text style={styles.statsLabel}>Total Categories</Text>
            <Text style={styles.statsValue}>{totalCategories}</Text>
            <Text style={styles.statsSub}>{pluralize(categorizedReceipts, 'categorized receipt')}</Text>
          </View>

          <View style={styles.statsIconCircle}>
            <Feather name="grid" size={24} color={COLORS.common.white} />
          </View>
        </View>
      </View>

      <View style={styles.searchRow}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search categories..."
          autoCapitalize="none"
          leftIcon={<Feather name="search" size={ICON_SIZES.sm} color={colors.textSecondary} />}
          accessibilityLabel="Search categories"
          style={styles.search}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sort and filters"
          onPress={() => {
            setCreateVisible(false);
            setFilterVisible(v => !v);
            setSortDropdownOpen(false);
          }}
          hitSlop={10}
          style={({ pressed }) => [styles.filterBtn, pressed && styles.pressed]}
        >
          <Feather name="sliders" size={20} color={COLORS.common.white} />
        </Pressable>
      </View>

      {filterVisible ? (
        <View style={styles.inlinePanelWrap}>
          <View style={styles.inlinePanelCard}>
            <View style={styles.filterHeaderRow}>
              <Text style={styles.filterTitle}>Filters</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close filters"
                onPress={() => {
                  setSortDropdownOpen(false);
                  setFilterVisible(false);
                }}
                hitSlop={10}
                style={({ pressed }) => [styles.filterCloseBtn, pressed && styles.pressed]}
              >
                <Feather name="x" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.filterLabel}>Sort By</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sort by"
              onPress={() => setSortDropdownOpen(v => !v)}
              style={({ pressed }) => [styles.dropdown, pressed && styles.pressed]}
            >
              <Text style={styles.dropdownText}>
                {sortBy === 'name' ? 'Name' : sortBy === 'spent' ? 'Spent' : 'Receipts'}
              </Text>
              <Feather name="chevron-down" size={20} color={colors.textSecondary} />
            </Pressable>

            {sortDropdownOpen ? (
              <View style={styles.dropdownMenu}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sort by name"
                  onPress={() => {
                    setSortBy('name');
                    setSortDropdownOpen(false);
                  }}
                  style={({ pressed }) => [styles.dropdownOption, pressed && styles.pressed]}
                >
                  <Text style={styles.dropdownOptionText}>Name</Text>
                  {sortBy === 'name' ? <Feather name="check" size={18} color={primary} /> : null}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sort by spent"
                  onPress={() => {
                    setSortBy('spent');
                    setSortDropdownOpen(false);
                  }}
                  style={({ pressed }) => [styles.dropdownOption, pressed && styles.pressed]}
                >
                  <Text style={styles.dropdownOptionText}>Spent</Text>
                  {sortBy === 'spent' ? <Feather name="check" size={18} color={primary} /> : null}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sort by receipts"
                  onPress={() => {
                    setSortBy('receipts');
                    setSortDropdownOpen(false);
                  }}
                  style={({ pressed }) => [styles.dropdownOption, pressed && styles.pressed]}
                >
                  <Text style={styles.dropdownOptionText}>Receipts</Text>
                  {sortBy === 'receipts' ? <Feather name="check" size={18} color={primary} /> : null}
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      <View
        onLayout={e => {
          createAnchorY.current = e.nativeEvent.layout.y;
        }}
      />

      {createVisible ? (
        <View style={styles.inlinePanelWrap}>
          <View style={styles.inlinePanelCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Category' : 'Create New Category'}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={closeCreate}
                hitSlop={10}
                style={({ pressed }) => [styles.filterCloseBtn, pressed && styles.pressed]}
              >
                <Feather name="x" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Input
              value={draftName}
              onChangeText={t => {
                setDraftName(t);
                if (nameError) setNameError(undefined);
              }}
              label="Category Name"
              placeholder="e.g., Groceries, Gas, Subscriptions"
              maxLength={24}
              autoCapitalize="words"
              error={nameError}
            />

            <View style={styles.createSection}>
              <Text style={styles.createSectionLabel}>Category Color</Text>
              <View style={styles.selectedColorRow}>
                <View style={[styles.colorPreview, { backgroundColor: draftColor }]} />
                <View style={styles.selectedColorTextCol}>
                  <Text style={styles.selectedColorTitle}>Selected Color</Text>
                  <View style={styles.selectedColorMetaRow}>
                    <View style={[styles.colorTinyDot, { backgroundColor: draftColor }]} />
                    <Text style={styles.selectedColorHex}>{draftColor.toUpperCase()}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.colorGrid}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Custom color"
                  onPress={openCustomColor}
                  style={({ pressed }) => [styles.colorSwatchRound, styles.colorSwatchCustom, pressed && styles.pressed]}
                >
                  <Feather name="plus" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>

            <View style={styles.createSection}>
              <Text style={styles.createSectionLabel}>Category Icon</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose category icon"
                onPress={() => {
                  setEmojiSearch('');
                  setEmojiCategory('smileys');
                  setEmojiPickerVisible(true);
                }}
                style={({ pressed }) => [styles.emojiField, pressed && styles.pressed]}
              >
                <Text style={styles.emojiValue}>{draftIcon}</Text>
              </Pressable>
              <Text style={styles.emojiHint}>Click to choose from emoji picker</Text>
            </View>

            <Button
              title={editingId ? 'Save Category' : 'Create Category'}
              variant="primary"
              size="lg"
              fullWidth
              onPress={onSave}
              loading={saving}
              disabled={saving}
              style={styles.createBtn}
            />
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionHeading}>All Categories</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={item => item.category.id}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrap}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.listEmptyWrap}>
              <Text style={styles.listEmptyText}>No categories match your search.</Text>
            </View>
          ) : null
        }
      />

      {/* Emoji picker */}
      <Modal
        isVisible={emojiPickerVisible}
        onBackdropPress={() => setEmojiPickerVisible(false)}
        onBackButtonPress={() => setEmojiPickerVisible(false)}
        backdropOpacity={0.5}
        useNativeDriver
      >
        <View style={styles.emojiPickerShell}>
          <View style={styles.emojiPickerHeader}>
            <Text style={styles.emojiPickerTitle}>Choose an Emoji</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setEmojiPickerVisible(false)}
              hitSlop={10}
              style={({ pressed }) => [styles.filterCloseBtn, pressed && styles.pressed]}
            >
              <Feather name="x" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.emojiSearchRow}>
            <Input
              value={emojiSearch}
              onChangeText={setEmojiSearch}
              placeholder="Search emojis..."
              autoCapitalize="none"
              leftIcon={<Feather name="search" size={ICON_SIZES.sm} color={colors.textSecondary} />}
              accessibilityLabel="Search emojis"
              style={styles.emojiSearch}
            />
          </View>

          <View style={styles.emojiCategoryRow}>
            {EMOJI_CATEGORIES.map(c => {
              const active = c.id === emojiCategory;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Emoji category ${c.id}`}
                  onPress={() => setEmojiCategory(c.id)}
                  style={({ pressed }) => [styles.emojiCategoryBtn, active && styles.emojiCategoryBtnActive, pressed && styles.pressed]}
                >
                  <Text style={[styles.emojiCategoryIcon, active && styles.emojiCategoryIconActive]}>{c.icon}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.emojiDivider} />

          <ScrollView style={styles.emojiScroll} contentContainerStyle={styles.emojiScrollContent} showsVerticalScrollIndicator>
            {(() => {
              const cat = EMOJI_CATEGORIES.find(c => c.id === emojiCategory) ?? EMOJI_CATEGORIES[0];
              const q = emojiSearch.trim();
              const emojis = q ? cat.emojis.filter(e => e.includes(q)) : cat.emojis;

              return emojis.map(e => (
                <Pressable
                  key={`${emojiCategory}-${e}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${e}`}
                  onPress={() => {
                    setDraftIcon(e);
                    setEmojiPickerVisible(false);
                  }}
                  style={({ pressed }) => [styles.emojiPick, pressed && styles.pressed]}
                >
                  <Text style={styles.emojiPickText}>{e}</Text>
                </Pressable>
              ));
            })()}
          </ScrollView>
        </View>
      </Modal>

      <ColorPickerModal
        visible={customColorVisible}
        initialColor={customColorInitial}
        title="Custom Color"
        onConfirm={hex => setDraftColor(hex)}
        onClose={() => setCustomColorVisible(false)}
      />

      <LoadingOverlay visible={loading} message="Loading categories…" />
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
  };
  primary: string;
}) => {
  const label: TextStyle = { ...TYPOGRAPHY.label, color: colors.textSecondary };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    pressed: {
      opacity: 0.9,
    },

    listContent: {
      paddingBottom: SPACING['3xl'],
    },
    columnWrap: {
      gap: SPACING.md,
      marginBottom: SPACING.md,
      paddingHorizontal: SPACING.lg,
    } as ViewStyle,

    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backButtonPressed: {
      backgroundColor: colors.surface,
    },
    topHeaderText: {
      flex: 1,
      marginLeft: SPACING.md,
      marginRight: SPACING.md,
    },
    topTitle: {
      ...TYPOGRAPHY.pageTitle,
      color: colors.text,
    },
    topSubtitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      marginTop: 2,
    },
    addCircleBtn: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.text,
      backgroundColor: colors.background,
    },

    statsWrap: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    statsCard: {
      borderRadius: 18,
      padding: SPACING.lg,
      minHeight: 130,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.12,
      shadowRadius: 14,
      elevation: 8,
    },
    statsLeft: {
      flex: 1,
      paddingRight: SPACING.md,
    },
    statsLabel: {
      ...TYPOGRAPHY.bodyNormal,
      color: COLORS.common.white,
      fontWeight: '700',
      marginBottom: 10,
    },
    statsValue: {
      fontSize: 36,
      lineHeight: 40,
      color: COLORS.common.white,
      fontWeight: '900',
      marginBottom: 10,
    },
    statsSub: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '600',
    },
    statsIconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.lg,
    },
    search: {
      flex: 1,
    },
    filterBtn: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: primary,
      borderWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },

    inlinePanelWrap: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.lg,
    },
    inlinePanelCard: {
      borderRadius: 18,
      backgroundColor: colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: SPACING.lg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 6,
    },

    sectionHeading: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
      fontWeight: '800',
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
      marginTop: SPACING.sm,
    },

    categoryPressable: {
      flex: 1,
    },
    categoryCard: {
      paddingVertical: 18,
      paddingHorizontal: 18,
      borderRadius: 18,
      flex: 1,
    },
    categoryCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginBottom: 14,
    },
    colorDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    iconCircle: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
    },
    categoryName: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
    },
    categoryMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    categoryMetaText: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      fontWeight: '700',
    },
    categoryMetaSep: {
      ...TYPOGRAPHY.caption,
      color: colors.textTertiary,
      marginTop: -1,
    },

    listEmptyWrap: {
      paddingVertical: SPACING.lg,
      alignItems: 'center',
    },
    listEmptyText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
    },

    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    modalTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      fontWeight: '800',
    },

    createSection: {
      marginTop: SPACING.lg,
    },
    createSectionLabel: {
      ...label,
      marginBottom: SPACING.sm,
    },
    selectedColorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      marginBottom: SPACING.md,
    },
    colorPreview: {
      width: 70,
      height: 70,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    selectedColorTextCol: {
      flex: 1,
    },
    selectedColorTitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '700',
      marginBottom: 8,
    },
    selectedColorMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    colorTinyDot: {
      width: 26,
      height: 26,
      borderRadius: 13,
    },
    selectedColorHex: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      fontWeight: '700',
    },

    colorGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    } as ViewStyle,
    colorSwatchRound: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${primary}55`,
    },
    colorSwatchCustom: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: StyleSheet.hairlineWidth,
    },
    colorSwatchSelected: {
      borderWidth: 2,
      borderColor: '#11182722',
    },

    emojiField: {
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 14,
      minHeight: 56,
      justifyContent: 'center',
    },
    emojiValue: {
      fontSize: 22,
    },
    emojiHint: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginTop: SPACING.sm,
    },
    createBtn: {
      marginTop: SPACING.lg,
    },

    filterHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    filterTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
      fontWeight: '800',
    },
    filterCloseBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterLabel: {
      ...label,
      marginBottom: SPACING.sm,
    },
    dropdown: {
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: primary,
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dropdownText: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '700',
    },
    dropdownMenu: {
      marginTop: SPACING.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 0,
      overflow: 'hidden',
    },
    dropdownOption: {
      backgroundColor: colors.surface,
      paddingVertical: 14,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dropdownOptionText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '700',
    },

    emojiPickerShell: {
      borderRadius: 18,
      backgroundColor: colors.background,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      maxHeight: 640,
    },
    emojiPickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
    },
    emojiPickerTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
      fontWeight: '800',
    },
    emojiSearchRow: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    emojiSearch: {
      marginBottom: 0,
    },
    emojiCategoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    emojiCategoryBtn: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: '#f1f5f9',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    emojiCategoryBtnActive: {
      backgroundColor: primary,
      borderColor: primary,
    },
    emojiCategoryIcon: {
      fontSize: 18,
      color: colors.text,
    },
    emojiCategoryIconActive: {
      color: COLORS.common.white,
    },
    emojiDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    emojiScroll: {
      flexGrow: 0,
    },
    emojiScrollContent: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      padding: SPACING.lg,
    } as ViewStyle,
    emojiPick: {
      width: 52,
      height: 52,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emojiPickText: {
      fontSize: 22,
    },
  });
};

export default CategoriesScreen;
