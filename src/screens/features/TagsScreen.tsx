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

import { Button, Card, Input } from '@/components/common';
import { ColorPickerModal } from '@/components/modals';
import { LoadingOverlay } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { listReceipts, upsertReceipt } from '@/utils/receiptStore';
import { deleteTagById, listTags, upsertTag, type StoredTag } from '@/utils/tagsStore';

type Props = NativeStackScreenProps<MainStackParamList, 'Tags'>;

type SortBy = 'name' | 'receiptCount' | 'color';

type ViewMode = 'grid' | 'list';

type ReceiptLite = {
  id: string;
  tags?: string[];
};

const PRESET_COLORS = COLORS.chart;

type EmojiCategoryId = 'smileys' | 'hearts' | 'food' | 'gifts' | 'travel' | 'ideas';

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
    id: 'gifts',
    icon: '🎁',
    emojis: ['🎁', '🎉', '🎈', '🎂', '🏷️', '📌', '📦', '🛒', '🧰', '🧾', '💳', '💰', '🧮'],
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

const SUGGESTED_TAGS: Array<{ name: string; icon: string }> = [
  { name: 'Meeting', icon: '📌' },
  { name: 'Lunch', icon: '🍔' },
  { name: 'Office Supplies', icon: '📦' },
  { name: 'Marketing', icon: '📣' },
  { name: 'Training', icon: '📚' },
  { name: 'Equipment', icon: '🧰' },
];

const normalizeName = (name: string) => name.trim();

const defaultIconForTagName = (name: string): string => {
  const n = name.trim().toLowerCase();
  if (!n) return '🏷️';
  if (n.includes('trip') || n.includes('travel')) return '✈️';
  if (n.includes('client')) return '🤝';
  if (n.includes('important')) return '⭐';
  if (n.includes('personal')) return '👤';
  if (n.includes('reimburse')) return '💰';
  if (n.includes('tax')) return '📊';
  if (n.includes('urgent')) return '🔥';
  if (n.includes('work') || n.includes('business')) return '💼';
  return '🏷️';
};

const pluralize = (count: number, one: string, many?: string) => {
  if (count === 1) return `1 ${one}`;
  return `${count} ${many ?? `${one}s`}`;
};

const buildUsageMap = (receipts: ReceiptLite[]) => {
  const map = new Map<string, number>();
  for (const r of receipts) {
    const tags = Array.isArray(r.tags) ? r.tags : [];
    const unique = new Set(tags.filter(Boolean));
    for (const t of unique) {
      map.set(t, (map.get(t) ?? 0) + 1);
    }
  }
  return map;
};

export const TagsScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [allTags, setAllTags] = useState<StoredTag[]>([]);
  const [receipts, setReceipts] = useState<ReceiptLite[]>([]);

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');

  const [filterVisible, setFilterVisible] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [filterColor, setFilterColor] = useState<'all' | string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const [createVisible, setCreateVisible] = useState(false);
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [emojiCategory, setEmojiCategory] = useState<EmojiCategoryId>('smileys');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState<string>(PRESET_COLORS[0]);
  const [draftIcon, setDraftIcon] = useState<string>('🏷️');
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const [customColorVisible, setCustomColorVisible] = useState(false);
  const [customColorTarget, setCustomColorTarget] = useState<'filter' | 'draft'>('draft');
  const [customColorInitial, setCustomColorInitial] = useState<string>(PRESET_COLORS[0]);

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

  const openCustomColor = useCallback(
    (target: 'filter' | 'draft') => {
      setCustomColorTarget(target);
      if (target === 'draft') {
        setCustomColorInitial(draftColor);
      } else {
        setCustomColorInitial(filterColor === 'all' ? PRESET_COLORS[0] : filterColor);
      }
      setCustomColorVisible(true);
    },
    [draftColor, filterColor],
  );

  const hydrate = useCallback(async () => {
    try {
      setLoading(true);
      const [tags, receiptsList] = await Promise.all([listTags(), listReceipts()]);
      setAllTags(tags);
      setReceipts(receiptsList as unknown as ReceiptLite[]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load tags', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const usageMap = useMemo(() => buildUsageMap(receipts), [receipts]);

  const openAdd = useCallback(() => {
    setEditingId(null);
    setDraftName('');
    setDraftColor(PRESET_COLORS[0]);
    setDraftIcon('🏷️');
    setNameError(undefined);
    setCreateVisible(true);
  }, []);

  const openSuggested = useCallback((name: string, icon: string) => {
    setEditingId(null);
    setDraftName(name);
    setDraftColor(PRESET_COLORS[0]);
    setDraftIcon(icon || defaultIconForTagName(name));
    setNameError(undefined);
    setCreateVisible(true);
  }, []);

  const openEdit = useCallback(
    (tag: StoredTag) => {
      setEditingId(tag.id);
      setDraftName(tag.name);
      setDraftColor(tag.color || PRESET_COLORS[0]);
      setDraftIcon(tag.icon || defaultIconForTagName(tag.name));
      setNameError(undefined);
      setCreateVisible(true);
    },
    [],
  );

  const closeCreate = useCallback(() => {
    setCreateVisible(false);
    setNameError(undefined);
  }, []);

  const validateName = useCallback(
    (raw: string) => {
      const name = normalizeName(raw);
      if (!name) return 'Name is required';
      if (name.length > 20) return 'Max 20 characters';

      const conflict = allTags.some(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== editingId);
      if (conflict) return 'A tag with this name already exists';

      return undefined;
    },
    [allTags, editingId],
  );

  const updateReceiptsForRename = useCallback(async (fromName: string, toName: string) => {
    if (!fromName || !toName || fromName === toName) return;

    const list = await listReceipts();
    const toUpdate = list.filter(r => Array.isArray(r.tags) && r.tags.includes(fromName));
    if (toUpdate.length === 0) return;

    await Promise.all(
      toUpdate.map(r => {
        const nextTags = (r.tags ?? []).map(t => (t === fromName ? toName : t));
        const unique = Array.from(new Set(nextTags.filter(Boolean))).sort((a, b) => a.localeCompare(b));
        return upsertReceipt({ ...r, tags: unique });
      }),
    );
  }, []);

  const removeTagFromReceipts = useCallback(async (name: string) => {
    if (!name) return;

    const list = await listReceipts();
    const toUpdate = list.filter(r => Array.isArray(r.tags) && r.tags.includes(name));
    if (toUpdate.length === 0) return;

    await Promise.all(
      toUpdate.map(r => {
        const nextTags = (r.tags ?? []).filter(t => t !== name);
        const unique = Array.from(new Set(nextTags.filter(Boolean))).sort((a, b) => a.localeCompare(b));
        return upsertReceipt({ ...r, tags: unique });
      }),
    );
  }, []);

  const onSave = useCallback(async () => {
    const err = validateName(draftName);
    setNameError(err);
    if (err) return;

    const name = normalizeName(draftName);

    try {
      setSaving(true);

      const now = new Date().toISOString();

      if (editingId) {
        const existing = allTags.find(t => t.id === editingId);
        if (!existing) {
          closeCreate();
          return;
        }

        const next: StoredTag = {
          ...existing,
          name,
          color: draftColor,
          icon: draftIcon,
          updatedAt: now,
        };

        await upsertTag(next);

        if (existing.name !== name) {
          await updateReceiptsForRename(existing.name, name);
        }

        setAllTags(prev => prev.map(t => (t.id === editingId ? next : t)));
      } else {
        const id = Date.now().toString();
        const next: StoredTag = {
          id,
          name,
          color: draftColor,
          icon: draftIcon,
          createdAt: now,
          updatedAt: now,
        };

        await upsertTag(next);
        setAllTags(prev => [next, ...prev]);
      }

      closeCreate();
      await hydrate();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to save tag', e);
      Alert.alert('Error', 'Failed to save tag');
    } finally {
      setSaving(false);
    }
  }, [
    allTags,
    closeCreate,
    draftColor,
    draftIcon,
    draftName,
    editingId,
    hydrate,
    updateReceiptsForRename,
    validateName,
  ]);

  const confirmDelete = useCallback(
    (tag: StoredTag) => {
      const used = usageMap.get(tag.name) ?? 0;
      const message = used > 0 ? `This tag is used in ${used} receipt${used === 1 ? '' : 's'}. Continue?` : 'Delete this tag?';

      Alert.alert('Delete Tag', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await deleteTagById(tag.id);
              await removeTagFromReceipts(tag.name);
              setAllTags(prev => prev.filter(t => t.id !== tag.id));
              await hydrate();
            } catch {
              Alert.alert('Error', 'Failed to delete tag');
            } finally {
              setSaving(false);
            }
          },
        },
      ]);
    },
    [hydrate, removeTagFromReceipts, usageMap],
  );

  const totalTags = allTags.length;
  const taggedReceipts = useMemo(() => receipts.filter(r => Array.isArray(r.tags) && r.tags.length > 0).length, [receipts]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const rows = allTags
      .map(t => ({ tag: t, usage: usageMap.get(t.name) ?? 0 }))
      .filter(x => (q ? x.tag.name.toLowerCase().includes(q) : true))
      .filter(x => {
        if (filterColor === 'all') return true;
        return (x.tag.color || '').toLowerCase() === filterColor.toLowerCase();
      });

    rows.sort((a, b) => {
      if (sortBy === 'receiptCount') {
        if (b.usage !== a.usage) return b.usage - a.usage;
        return a.tag.name.localeCompare(b.tag.name);
      }
      if (sortBy === 'color') {
        const ac = (a.tag.color || 'zzzz').toLowerCase();
        const bc = (b.tag.color || 'zzzz').toLowerCase();
        if (ac !== bc) return ac.localeCompare(bc);
        return a.tag.name.localeCompare(b.tag.name);
      }
      return a.tag.name.localeCompare(b.tag.name);
    });

    return rows;
  }, [allTags, filterColor, query, sortBy, usageMap]);

  const renderItem: ListRenderItem<(typeof filteredRows)[number]> = useCallback(
    ({ item }) => {
      const { tag, usage } = item;
      const icon = tag.icon || defaultIconForTagName(tag.name);
      const countLabel = `${usage} receipts`;

      return (
        <Pressable
          onPress={() => openEdit(tag)}
          onLongPress={() => confirmDelete(tag)}
          accessibilityRole="button"
          accessibilityLabel={`Open tag ${tag.name}`}
          style={({ pressed }) => [styles.tagPressable, viewMode === 'list' && styles.tagPressableList, pressed && styles.pressed]}
        >
          <Card variant="default" style={[styles.tagCard, viewMode === 'list' && styles.tagCardList]}>
            <View style={styles.tagCardTop}>
              <View style={[styles.colorDot, { backgroundColor: tag.color || PRESET_COLORS[0] }]} />
              <Text style={styles.tagEmoji} accessibilityLabel="Tag icon">
                {icon}
              </Text>
            </View>

            <Text style={styles.tagName} numberOfLines={1}>
              {tag.name}
            </Text>
            <Text style={styles.tagUsage} numberOfLines={1}>
              {countLabel}
            </Text>
          </Card>
        </Pressable>
      );
    },
    [confirmDelete, openEdit, styles, viewMode],
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
          <Text style={styles.topTitle}>Tags</Text>
          <Text style={styles.topSubtitle}>Organize receipts with custom labels</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add Tag"
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
            colors={['#0ea5a6', '#10b981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.statsLeft}>
            <Text style={styles.statsLabel}>Total Tags</Text>
            <Text style={styles.statsValue}>{totalTags}</Text>
            <Text style={styles.statsSub}>{pluralize(taggedReceipts, 'tagged receipt')}</Text>
          </View>

          <View style={styles.statsIconCircle}>
            <Feather name="tag" size={24} color={COLORS.common.white} />
          </View>
        </View>
      </View>

      <View style={styles.searchRow}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search tags..."
          autoCapitalize="none"
          leftIcon={<Feather name="hash" size={ICON_SIZES.sm} color={colors.textSecondary} />}
          accessibilityLabel="Search tags"
          style={styles.search}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filters"
          onPress={() => {
            setSortDropdownOpen(false);
            setFilterVisible(v => !v);
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
                {sortBy === 'name' ? 'Name' : sortBy === 'receiptCount' ? 'Receipt Count' : 'Color'}
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
                  accessibilityLabel="Sort by receipt count"
                  onPress={() => {
                    setSortBy('receiptCount');
                    setSortDropdownOpen(false);
                  }}
                  style={({ pressed }) => [styles.dropdownOption, pressed && styles.pressed]}
                >
                  <Text style={styles.dropdownOptionText}>Receipt Count</Text>
                  {sortBy === 'receiptCount' ? <Feather name="check" size={18} color={primary} /> : null}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sort by color"
                  onPress={() => {
                    setSortBy('color');
                    setSortDropdownOpen(false);
                  }}
                  style={({ pressed }) => [styles.dropdownOption, pressed && styles.pressed]}
                >
                  <Text style={styles.dropdownOptionText}>Color</Text>
                  {sortBy === 'color' ? <Feather name="check" size={18} color={primary} /> : null}
                </Pressable>
              </View>
            ) : null}

            <Text style={[styles.filterLabel, { marginTop: SPACING.lg }]}>Filter Color</Text>
            <View style={styles.filterColorCard}>
              <View style={styles.selectedColorRowSm}>
                <View
                  style={[
                    styles.colorPreviewSm,
                    { backgroundColor: filterColor === 'all' ? colors.surface : filterColor },
                  ]}
                />
                <View style={styles.selectedColorTextCol}>
                  <Text style={styles.selectedColorTitle}>
                    {filterColor === 'all' ? 'All Colors' : 'Selected Color'}
                  </Text>
                  <View style={styles.selectedColorMetaRow}>
                    <View
                      style={[
                        styles.colorTinyDot,
                        { backgroundColor: filterColor === 'all' ? colors.border : filterColor },
                      ]}
                    />
                    <Text style={styles.selectedColorHex}>
                      {filterColor === 'all' ? '—' : filterColor.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.colorGrid}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="All colors"
                  onPress={() => setFilterColor('all')}
                  style={({ pressed }) => [
                    styles.colorSwatchRound,
                    styles.colorSwatchAll,
                    filterColor === 'all' && styles.colorSwatchSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.colorSwatchAllText, filterColor === 'all' && styles.colorSwatchAllTextActive]}>All</Text>
                </Pressable>

                {PRESET_COLORS.map(c => {
                  const selected = typeof filterColor === 'string' && filterColor.toLowerCase() === c.toLowerCase();
                  return (
                    <Pressable
                      key={c}
                      accessibilityRole="button"
                      accessibilityLabel={`Color ${c}`}
                      onPress={() => setFilterColor(c)}
                      style={({ pressed }) => [
                        styles.colorSwatchRound,
                        { backgroundColor: c },
                        selected && styles.colorSwatchSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      {selected ? <Feather name="check" size={14} color={COLORS.common.white} /> : null}
                    </Pressable>
                  );
                })}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Custom color"
                  onPress={() => openCustomColor('filter')}
                  style={({ pressed }) => [styles.colorSwatchRound, styles.colorSwatchCustom, pressed && styles.pressed]}
                >
                  <Feather name="plus" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>

            <Text style={[styles.filterLabel, { marginTop: SPACING.lg }]}>View Mode</Text>
            <View style={styles.viewModeRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Grid view"
                onPress={() => setViewMode('grid')}
                style={({ pressed }) => [styles.viewModeBtn, viewMode === 'grid' && styles.viewModeBtnActive, pressed && styles.pressed]}
              >
                <Feather name="grid" size={20} color={viewMode === 'grid' ? COLORS.common.white : colors.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="List view"
                onPress={() => setViewMode('list')}
                style={({ pressed }) => [styles.viewModeBtn, viewMode === 'list' && styles.viewModeBtnActive, pressed && styles.pressed]}
              >
                <Feather name="list" size={20} color={viewMode === 'list' ? COLORS.common.white : colors.text} />
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {createVisible ? (
        <View style={styles.inlinePanelWrap}>
          <View style={styles.inlinePanelCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Create New Tag</Text>
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
              label="Tag Name"
              placeholder="e.g., Project Alpha, Q1 2026"
              maxLength={20}
              autoCapitalize="words"
              error={nameError}
            />

            <View style={styles.createSection}>
              <Text style={styles.createSectionLabel}>Tag Color</Text>
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
                {PRESET_COLORS.map(c => {
                  const selected = draftColor === c;
                  return (
                    <Pressable
                      key={c}
                      accessibilityRole="button"
                      accessibilityLabel={`Select color ${c}`}
                      onPress={() => setDraftColor(c)}
                      style={({ pressed }) => [
                        styles.colorSwatchRound,
                        { backgroundColor: c },
                        selected && styles.colorSwatchSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      {selected ? <Feather name="check" size={14} color={COLORS.common.white} /> : null}
                    </Pressable>
                  );
                })}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Custom color"
                  onPress={() => openCustomColor('draft')}
                  style={({ pressed }) => [styles.colorSwatchRound, styles.colorSwatchCustom, pressed && styles.pressed]}
                >
                  <Feather name="plus" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>

            <View style={styles.createSection}>
              <Text style={styles.createSectionLabel}>Tag Icon</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose tag icon"
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
              title={editingId ? 'Save Tag' : 'Create Tag'}
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

      <Text style={styles.sectionHeading}>Your Tags</Text>
    </View>
  );

  const listFooter = (
    <View>
      <Text style={styles.sectionHeading}>Suggested Tags</Text>

      <View style={styles.suggestedWrap}>
        {SUGGESTED_TAGS.map(t => (
          <Pressable
            key={t.name}
            accessibilityRole="button"
            accessibilityLabel={`Add suggested tag ${t.name}`}
            onPress={() => openSuggested(t.name, t.icon)}
            style={({ pressed }) => [styles.suggestedPill, pressed && styles.pressed]}
          >
            <Text style={styles.suggestedPlus}>+</Text>
            <Text style={styles.suggestedText}>{t.name}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.proTipCard}>
        <View style={styles.proTipIconCircle}>
          <Feather name="tag" size={20} color="#0f766e" />
        </View>

        <View style={styles.proTipTextCol}>
          <Text style={styles.proTipTitle}>Pro Tip</Text>
          <Text style={styles.proTipBody}>
            Use tags to organize receipts across multiple categories. You can add multiple tags to a single receipt!
          </Text>
        </View>
      </View>

      <View style={{ height: 28 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={filteredRows}
        key={viewMode}
        keyExtractor={item => item.tag.id}
        renderItem={renderItem}
        numColumns={viewMode === 'grid' ? 2 : 1}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={viewMode === 'grid' ? styles.columnWrap : undefined}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.listEmptyWrap}>
              <Text style={styles.listEmptyText}>No tags match your search.</Text>
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
        style={styles.emojiModal}
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
        onConfirm={hex => {
          if (customColorTarget === 'draft') setDraftColor(hex);
          else setFilterColor(hex);
        }}
        onClose={() => setCustomColorVisible(false)}
      />

      <LoadingOverlay visible={loading} message="Loading tags…" />
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
    tagPressable: {
      flex: 1,
    },
    tagPressableList: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
    },

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

    tagCard: {
      paddingVertical: 18,
      paddingHorizontal: 18,
      borderRadius: 18,
      flex: 1,
    },
    tagCardList: {
      width: '100%',
    },
    tagCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
    },
    colorDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginRight: SPACING.sm,
    },
    tagEmoji: {
      fontSize: 22,
      lineHeight: 24,
    },
    tagName: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
    },
    tagUsage: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginTop: 2,
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
      borderRadius: RADIUS.lg,
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


    filterCard: {
      padding: SPACING.lg,
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
    colorFilterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    } as ViewStyle,
    colorPill: {
      width: 46,
      height: 46,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    colorPillAll: {
      backgroundColor: primary,
      borderColor: primary,
      width: 56,
    },
    colorPillSelected: {
      borderWidth: 2,
      borderColor: '#11182755',
    },
    colorPillText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '800',
    },
    colorPillTextSelected: {
      color: COLORS.common.white,
    },
    viewModeRow: {
      flexDirection: 'row',
      gap: 10,
    },
    viewModeBtn: {
      width: 54,
      height: 54,
      borderRadius: 16,
      backgroundColor: '#f1f5f9',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewModeBtnActive: {
      backgroundColor: primary,
      borderColor: primary,
    },

    suggestedWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
    } as ViewStyle,
    suggestedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: RADIUS.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    suggestedPlus: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
      marginTop: -1,
    },
    suggestedText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '700',
    },

    proTipCard: {
      marginHorizontal: SPACING.lg,
      borderRadius: 18,
      padding: SPACING.lg,
      backgroundColor: '#ecfdf5',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#a7f3d0',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.md,
    },
    proTipIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#ccfbf1',
      alignItems: 'center',
      justifyContent: 'center',
    },
    proTipTextCol: {
      flex: 1,
    },
    proTipTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: '#0f766e',
      fontWeight: '900',
      marginBottom: 6,
    },
    proTipBody: {
      ...TYPOGRAPHY.bodyNormal,
      color: '#0f766e',
      fontWeight: '600',
      lineHeight: 22,
    },

    emojiPickerShell: {
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      backgroundColor: colors.background,
      overflow: 'hidden',
      maxHeight: 720,
    },
    emojiModal: {
      justifyContent: 'flex-end',
      margin: 0,
    } as ViewStyle,
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
      gap: 8,
      padding: SPACING.lg,
    } as ViewStyle,
    emojiPick: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: 'transparent',
      borderWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emojiPickText: {
      fontSize: 22,
    },

    filterColorCard: {
      marginTop: SPACING.sm,
    },
    selectedColorRowSm: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      marginBottom: SPACING.md,
    },
    colorPreviewSm: {
      width: 58,
      height: 58,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    colorSwatchAll: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    colorSwatchAllText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '800',
    },
    colorSwatchAllTextActive: {
      color: colors.text,
    },
  });
};

export default TagsScreen;
