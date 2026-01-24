import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
  type SectionListData,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';

import { Button, Card, Chip, IconButton, Input } from '@/components/common';
import { EmptyState, Header, LoadingOverlay } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
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

type Props = NativeStackScreenProps<MainStackParamList, 'Categories'>;

type SectionKey = 'default' | 'custom';

type SortBy = 'name' | 'usage';

type ReceiptLite = {
  id: string;
  categoryId: string;
  category: string;
  categoryColor: string;
};

type CategoryRow = {
  category: Category;
  isDefault: boolean;
  usage: number;
};

const PRESET_COLORS = COLORS.chart;

const ICONS: Array<{ id: string; label: string }> = [
  { id: 'utensils', label: 'Food' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'shopping-bag', label: 'Shopping' },
  { id: 'shopping-cart', label: 'Cart' },
  { id: 'credit-card', label: 'Card' },
  { id: 'truck', label: 'Truck' },
  { id: 'car', label: 'Car' },
  { id: 'home', label: 'Home' },
  { id: 'heart', label: 'Health' },
  { id: 'activity', label: 'Fitness' },
  { id: 'film', label: 'Movies' },
  { id: 'music', label: 'Music' },
  { id: 'book', label: 'Books' },
  { id: 'gift', label: 'Gifts' },
  { id: 'briefcase', label: 'Business' },
  { id: 'airplay', label: 'Tech' },
  { id: 'smartphone', label: 'Mobile' },
  { id: 'wifi', label: 'Internet' },
  { id: 'zap', label: 'Electric' },
  { id: 'droplet', label: 'Water' },
  { id: 'map-pin', label: 'Travel' },
  { id: 'navigation', label: 'Trip' },
  { id: 'dollar-sign', label: 'Bills' },
  { id: 'tag', label: 'Other' },
  { id: 'more-horizontal', label: 'Misc' },
  { id: 'tool', label: 'Tools' },
  { id: 'package', label: 'Package' },
  { id: 'calendar', label: 'Events' },
] as const;

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

const normalizeName = (name: string) => name.trim();

const pluralize = (count: number, one: string, many?: string) => {
  if (count === 1) return `1 ${one}`;
  return `${count} ${many ?? `${one}s`}`;
};

const buildUsageMap = (receipts: ReceiptLite[]) => {
  const map = new Map<string, number>();
  for (const r of receipts) {
    if (!r.categoryId) continue;
    map.set(r.categoryId, (map.get(r.categoryId) ?? 0) + 1);
  }
  return map;
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

export const CategoriesScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [customCategories, setCustomCategories] = useState<StoredCategory[]>([]);
  const [defaultOverrides, setDefaultOverrides] = useState<DefaultCategoryOverride[]>([]);
  const [receipts, setReceipts] = useState<ReceiptLite[]>([]);

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsDefault, setEditingIsDefault] = useState(false);

  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState<string>(PRESET_COLORS[0]);
  const [draftIcon, setDraftIcon] = useState<string>(ICONS[0].id);
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const [iconPickerVisible, setIconPickerVisible] = useState(false);

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

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

  const usageMap = useMemo(() => buildUsageMap(receipts), [receipts]);

  const defaultCategories = useMemo(() => applyOverrides(DEFAULT_CATEGORIES, defaultOverrides), [defaultOverrides]);

  const allRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const defaultRows: CategoryRow[] = defaultCategories.map(c => ({
      category: c,
      isDefault: true,
      usage: usageMap.get(c.id) ?? 0,
    }));

    const customRows: CategoryRow[] = customCategories.map(c => ({
      category: c,
      isDefault: false,
      usage: usageMap.get(c.id) ?? 0,
    }));

    const filter = (rows: CategoryRow[]) => rows.filter(r => (q ? r.category.name.toLowerCase().includes(q) : true));

    const sorter = (a: CategoryRow, b: CategoryRow) => {
      if (sortBy === 'usage') {
        if (b.usage !== a.usage) return b.usage - a.usage;
        return a.category.name.localeCompare(b.category.name);
      }
      return a.category.name.localeCompare(b.category.name);
    };

    const d = filter(defaultRows).sort(sorter);
    const c = filter(customRows).sort(sorter);

    return { d, c };
  }, [customCategories, defaultCategories, query, sortBy, usageMap]);

  const sections = useMemo(() => {
    const s: Array<SectionListData<CategoryRow, { key: SectionKey; title: string }>> = [
      { key: 'default' as const, title: 'Default Categories', data: allRows.d },
      { key: 'custom' as const, title: 'Custom Categories', data: allRows.c },
    ];
    return s;
  }, [allRows.c, allRows.d]);

  const empty = !loading && defaultCategories.length === 0 && customCategories.length === 0;

  const openAdd = useCallback(() => {
    setEditingId(null);
    setEditingIsDefault(false);
    setDraftName('');
    setDraftIcon(ICONS[0].id);
    setDraftColor(PRESET_COLORS[0]);
    setNameError(undefined);
    setModalVisible(true);
  }, []);

  const openEdit = useCallback((row: CategoryRow) => {
    setEditingId(row.category.id);
    setEditingIsDefault(row.isDefault);
    setDraftName(row.category.name);
    setDraftIcon(row.category.iconName);
    setDraftColor(row.category.color || PRESET_COLORS[0]);
    setNameError(undefined);
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setIconPickerVisible(false);
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
            closeModal();
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

      closeModal();
      await hydrate();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to save category', e);
      Alert.alert('Error', 'Failed to save category');
    } finally {
      setSaving(false);
    }
  }, [
    closeModal,
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

      const used = usageMap.get(row.category.id) ?? 0;
      const message = used > 0 ? `This category is used in ${used} receipt${used === 1 ? '' : 's'}. Continue?` : 'Delete this category?';

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
    [hydrate, usageMap],
  );

  const renderRow = useCallback(
    (row: CategoryRow) => {
      const { category, usage, isDefault } = row;

      return (
        <Pressable
          onPress={() => openEdit(row)}
          accessibilityRole="button"
          accessibilityLabel={`Edit category ${category.name}`}
          style={({ pressed }) => [styles.itemPressable, pressed && styles.pressed]}
        >
          <Card variant="default" style={styles.itemCard}>
            <View style={styles.itemRow}>
              <View style={[styles.iconWrap, { backgroundColor: `${category.color}22`, borderColor: `${category.color}55` }]}>
                <Feather name={category.iconName as never} size={ICON_SIZES.md} color={category.color} />
              </View>

              <View style={styles.itemMain}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {category.name}
                </Text>
                <Text style={styles.itemSub} numberOfLines={1}>
                  Used in {pluralize(usage, 'receipt')}
                </Text>
              </View>

              <View style={styles.itemActions}>
                <IconButton
                  accessibilityLabel="Edit"
                  variant="ghost"
                  size="sm"
                  icon={<Feather name="edit-2" size={ICON_SIZES.sm} color={colors.textSecondary} />}
                  onPress={() => openEdit(row)}
                />
                {!isDefault ? (
                  <IconButton
                    accessibilityLabel="Delete"
                    variant="ghost"
                    size="sm"
                    icon={<Feather name="trash-2" size={ICON_SIZES.sm} color={COLORS.semantic.error} />}
                    onPress={() => confirmDelete(row)}
                  />
                ) : null}
              </View>
            </View>
          </Card>
        </Pressable>
      );
    },
    [colors.textSecondary, confirmDelete, openEdit, styles],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<CategoryRow, { key: SectionKey; title: string }> }) => {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionCount}>{section.data.length}</Text>
        </View>
      );
    },
    [styles],
  );

  const renderItem = useCallback(({ item }: { item: CategoryRow }) => renderRow(item), [renderRow]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header
        title="Categories"
        onBack={() => navigation.goBack()}
        showBackButton
        rightAction={
          <IconButton
            accessibilityLabel="Add Category"
            variant="ghost"
            size="md"
            onPress={openAdd}
            icon={<Feather name="plus" size={ICON_SIZES.md} color={primary} />}
          />
        }
      />

      {empty ? (
        <EmptyState
          icon={<Feather name="grid" size={80} color={colors.textTertiary} />}
          title="No Categories"
          description="Create categories to organize spending."
          action={{ label: 'Add Category', onPress: openAdd }}
        />
      ) : null}

      <View style={styles.content}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search categories"
          autoCapitalize="none"
          leftIcon={<Feather name="search" size={ICON_SIZES.sm} color={colors.textTertiary} />}
          accessibilityLabel="Search categories"
          style={styles.search}
        />

        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort</Text>
          <View style={styles.sortChips}>
            <Chip label="Name (A–Z)" selected={sortBy === 'name'} onPress={() => setSortBy('name')} />
            <Chip label="Most Used" selected={sortBy === 'usage'} onPress={() => setSortBy('usage')} />
          </View>
        </View>

        <SectionList
          sections={sections}
          keyExtractor={item => `${item.category.id}-${item.isDefault ? 'd' : 'c'}`}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.listEmptyWrap}>
                <Text style={styles.listEmptyText}>No categories match your search.</Text>
              </View>
            ) : null
          }
        />
      </View>

      {/* Add/Edit Modal */}
      <Modal
        isVisible={modalVisible}
        onBackdropPress={closeModal}
        onBackButtonPress={closeModal}
        backdropOpacity={0.5}
        useNativeDriver
      >
        <Card variant="default" style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {editingId ? (editingIsDefault ? 'Edit Default Category' : 'Edit Category') : 'Add Category'}
          </Text>

          <Input
            value={draftName}
            onChangeText={t => {
              setDraftName(t);
              if (nameError) setNameError(undefined);
            }}
            label="Name"
            placeholder="e.g. Bills"
            autoCapitalize="words"
            maxLength={24}
            error={nameError}
          />

          <View style={styles.pickerRow}>
            <Text style={styles.pickerLabel}>Icon</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose icon"
              onPress={() => setIconPickerVisible(true)}
              style={({ pressed }) => [styles.iconPickerButton, pressed && styles.pressed]}
            >
              <View style={styles.iconPickerInner}>
                <Feather name={draftIcon as never} size={ICON_SIZES.md} color={colors.text} />
                <Text style={styles.iconPickerText}>Choose</Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.colorPickerWrap}>
            <Text style={styles.pickerLabel}>Color</Text>
            <View style={styles.colorGrid}>
              {PRESET_COLORS.map(c => {
                const selected = draftColor === c;
                return (
                  <Pressable
                    key={c}
                    accessibilityRole="button"
                    accessibilityLabel={`Select color ${c}`}
                    onPress={() => setDraftColor(c)}
                    style={({ pressed }) => [styles.colorSwatch, { backgroundColor: c }, pressed && { opacity: 0.9 }]}
                  >
                    {selected ? <Feather name="check" size={16} color={COLORS.common.white} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.modalActions}>
            <Button title="Cancel" variant="secondary" onPress={closeModal} disabled={saving} />
            <View style={{ width: SPACING.sm }} />
            <Button title="Save" variant="primary" onPress={onSave} loading={saving} disabled={saving} />
          </View>
        </Card>
      </Modal>

      {/* Icon picker */}
      <Modal
        isVisible={iconPickerVisible}
        onBackdropPress={() => setIconPickerVisible(false)}
        onBackButtonPress={() => setIconPickerVisible(false)}
        backdropOpacity={0.5}
        useNativeDriver
      >
        <Card variant="default" style={styles.iconModalCard}>
          <Text style={styles.modalTitle}>Pick an Icon</Text>

          <FlatList
            data={ICONS}
            keyExtractor={i => i.id}
            numColumns={5}
            contentContainerStyle={styles.iconGrid}
            columnWrapperStyle={styles.iconRow}
            renderItem={({ item }) => {
              const selected = draftIcon === item.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${item.label}`}
                  onPress={() => setDraftIcon(item.id)}
                  style={({ pressed }) => [
                    styles.iconCell,
                    selected && styles.iconCellSelected,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Feather name={item.id as never} size={ICON_SIZES.md} color={selected ? primary : colors.text} />
                </Pressable>
              );
            }}
          />

          <View style={styles.modalActions}>
            <Button title="Done" variant="primary" onPress={() => setIconPickerVisible(false)} />
          </View>
        </Card>
      </Modal>

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
    content: {
      flex: 1,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.lg,
    },

    search: {
      marginBottom: SPACING.md,
    },

    sortRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    sortLabel: {
      ...label,
    },
    sortChips: {
      flexDirection: 'row',
      gap: SPACING.sm,
    } as ViewStyle,

    listContent: {
      paddingBottom: SPACING['3xl'],
    },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.sm,
      marginBottom: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    sectionTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
    },
    sectionCount: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
    },

    itemPressable: {
      marginBottom: SPACING.md,
    },
    pressed: {
      opacity: 0.9,
    },
    itemCard: {
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      marginRight: SPACING.md,
    },
    itemMain: {
      flex: 1,
      paddingRight: SPACING.md,
    },
    itemTitle: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
    },
    itemSub: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    itemActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    } as ViewStyle,

    listEmptyWrap: {
      paddingVertical: SPACING.lg,
      alignItems: 'center',
    },
    listEmptyText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
    },

    modalCard: {
      padding: SPACING.lg,
    },
    iconModalCard: {
      padding: SPACING.lg,
      maxHeight: 520,
    },
    modalTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },

    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.md,
    },
    pickerLabel: {
      ...label,
    },
    iconPickerButton: {
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    iconPickerInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    } as ViewStyle,
    iconPickerText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '700',
    },

    colorPickerWrap: {
      marginTop: SPACING.md,
    },
    colorGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      marginTop: SPACING.sm,
    } as ViewStyle,
    colorSwatch: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${primary}55`,
    },

    iconGrid: {
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
    },
    iconRow: {
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    } as ViewStyle,
    iconCell: {
      width: 52,
      height: 52,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.sm,
    },
    iconCellSelected: {
      borderWidth: 2,
      borderColor: primary,
    },

    modalActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: SPACING.lg,
    },
  });
};

export default CategoriesScreen;
