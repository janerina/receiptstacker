import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
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

import { Button, Card, Chip, IconButton, Input } from '@/components/common';
import { EmptyState, Header, LoadingOverlay } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { listReceipts, upsertReceipt } from '@/utils/receiptStore';
import { deleteTagById, listTags, upsertTag, type StoredTag } from '@/utils/tagsStore';

type Props = NativeStackScreenProps<MainStackParamList, 'Tags'>;

type SortBy = 'name' | 'usage';

type ReceiptLite = {
  id: string;
  tags?: string[];
};

const PRESET_COLORS = COLORS.chart;

const normalizeName = (name: string) => name.trim();

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

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState<string>(PRESET_COLORS[0]);
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

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

  const tagRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const rows = allTags
      .map(t => ({
        tag: t,
        usage: usageMap.get(t.name) ?? 0,
      }))
      .filter(x => (q ? x.tag.name.toLowerCase().includes(q) : true));

    rows.sort((a, b) => {
      if (sortBy === 'usage') {
        if (b.usage !== a.usage) return b.usage - a.usage;
        return a.tag.name.localeCompare(b.tag.name);
      }
      return a.tag.name.localeCompare(b.tag.name);
    });

    return rows;
  }, [allTags, query, sortBy, usageMap]);

  const openAdd = useCallback(() => {
    setEditingId(null);
    setDraftName('');
    setDraftColor(PRESET_COLORS[0]);
    setNameError(undefined);
    setModalVisible(true);
  }, []);

  const openEdit = useCallback(
    (tag: StoredTag) => {
      setEditingId(tag.id);
      setDraftName(tag.name);
      setDraftColor(tag.color || PRESET_COLORS[0]);
      setNameError(undefined);
      setModalVisible(true);
    },
    [],
  );

  const closeModal = useCallback(() => {
    setModalVisible(false);
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
          closeModal();
          return;
        }

        const next: StoredTag = {
          ...existing,
          name,
          color: draftColor,
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
          createdAt: now,
          updatedAt: now,
        };

        await upsertTag(next);
        setAllTags(prev => [next, ...prev]);
      }

      closeModal();
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
    closeModal,
    draftColor,
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

  const renderItem: ListRenderItem<(typeof tagRows)[number]> = useCallback(
    ({ item }) => {
      const { tag, usage } = item;

      return (
        <Pressable
          onPress={() => openEdit(tag)}
          accessibilityRole="button"
          accessibilityLabel={`Edit tag ${tag.name}`}
          style={({ pressed }) => [styles.tagPressable, pressed && styles.pressed]}
        >
          <Card variant="default" style={styles.tagCard}>
            <View style={styles.tagTopRow}>
              <View style={[styles.colorDot, { backgroundColor: tag.color || PRESET_COLORS[0] }]} />

              <View style={styles.tagTitleWrap}>
                <Text style={styles.tagName} numberOfLines={1}>
                  {tag.name}
                </Text>
                <Text style={styles.tagUsage} numberOfLines={1}>
                  Used in {pluralize(usage, 'receipt')}
                </Text>
              </View>

              <View style={styles.tagActions}>
                <IconButton
                  accessibilityLabel="Edit"
                  variant="ghost"
                  size="sm"
                  icon={<Feather name="edit-2" size={ICON_SIZES.sm} color={colors.textSecondary} />}
                  onPress={() => openEdit(tag)}
                />
                <IconButton
                  accessibilityLabel="Delete"
                  variant="ghost"
                  size="sm"
                  icon={<Feather name="trash-2" size={ICON_SIZES.sm} color={COLORS.semantic.error} />}
                  onPress={() => confirmDelete(tag)}
                />
              </View>
            </View>
          </Card>
        </Pressable>
      );
    },
    [colors.textSecondary, confirmDelete, openEdit, styles],
  );

  const empty = !loading && allTags.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header
        title="Tags"
        onBack={() => navigation.goBack()}
        showBackButton
        rightAction={
          <IconButton
            accessibilityLabel="Add Tag"
            variant="ghost"
            size="md"
            onPress={openAdd}
            icon={<Feather name="plus" size={ICON_SIZES.md} color={primary} />}
          />
        }
      />

      {empty ? (
        <EmptyState
          icon={<Feather name="tag" size={80} color={colors.textTertiary} />}
          title="No Tags Yet"
          description="Create tags to organize receipts by context (e.g. Tax, Business, Travel)."
          action={{ label: 'Add Tag', onPress: openAdd }}
        />
      ) : null}

      <View style={styles.content}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search tags"
          autoCapitalize="none"
          leftIcon={<Feather name="search" size={ICON_SIZES.sm} color={colors.textTertiary} />}
          accessibilityLabel="Search tags"
          style={styles.search}
        />

        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort</Text>
          <View style={styles.sortChips}>
            <Chip label="Name (A–Z)" selected={sortBy === 'name'} onPress={() => setSortBy('name')} />
            <Chip label="Most Used" selected={sortBy === 'usage'} onPress={() => setSortBy('usage')} />
          </View>
        </View>

        <FlatList
          data={tagRows}
          keyExtractor={item => item.tag.id}
          renderItem={renderItem}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrap}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.listEmptyWrap}>
                <Text style={styles.listEmptyText}>No tags match your search.</Text>
              </View>
            ) : null
          }
        />
      </View>

      <Modal
        isVisible={modalVisible}
        onBackdropPress={closeModal}
        onBackButtonPress={closeModal}
        backdropOpacity={0.5}
        useNativeDriver
      >
        <Card variant="default" style={styles.modalCard}>
          <Text style={styles.modalTitle}>{editingId ? 'Edit Tag' : 'Add Tag'}</Text>

          <Input
            value={draftName}
            onChangeText={t => {
              setDraftName(t);
              if (nameError) setNameError(undefined);
            }}
            label="Name"
            placeholder="e.g. Business"
            maxLength={20}
            autoCapitalize="words"
            error={nameError}
          />

          <View style={styles.colorPickerWrap}>
            <Text style={styles.colorPickerLabel}>Color</Text>
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
    columnWrap: {
      gap: SPACING.md,
      marginBottom: SPACING.md,
    } as ViewStyle,
    tagPressable: {
      flex: 1,
    },
    pressed: {
      opacity: 0.9,
    },
    tagCard: {
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      flex: 1,
    },
    tagTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    colorDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginRight: SPACING.sm,
    },
    tagTitleWrap: {
      flex: 1,
      paddingRight: SPACING.sm,
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
    tagActions: {
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
    modalTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },
    colorPickerWrap: {
      marginTop: SPACING.md,
    },
    colorPickerLabel: {
      ...label,
      marginBottom: SPACING.sm,
    },
    colorGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
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

    modalActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: SPACING.lg,
    },
  });
};

export default TagsScreen;
