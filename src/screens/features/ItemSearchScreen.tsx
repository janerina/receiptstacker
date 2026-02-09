import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';

import { Header } from '@/components/compositions';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { MainStackParamList } from '@/navigation/types';
import {
  searchItemsAcrossReceipts,
  type UnifiedSearchResult,
} from '@/services/itemSearchService';
import { formatCurrency, formatDate } from '@/utils/format';
import type { SortField } from '@/utils/itemSearch';

type Props = NativeStackScreenProps<MainStackParamList, 'ItemSearch'>;

const sortLabel = (field: SortField) => {
  if (field === 'date') return 'Date';
  if (field === 'price') return 'Price';
  if (field === 'store') return 'Store';
  return 'Name';
};

const sortIcon = (field: SortField) => {
  if (field === 'date') return 'calendar';
  if (field === 'price') return 'dollar-sign';
  if (field === 'store') return 'shopping-bag';
  return 'tag';
};

const arrowFor = (order: 'asc' | 'desc') => (order === 'asc' ? '↑' : '↓');

/** Format an ISO date string as a short date + time label. */
const formatTimestamp = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const datePart = formatDate(iso, 'short');
  try {
    const timePart = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  } catch {
    return datePart;
  }
};

export const ItemSearchScreen = ({ navigation }: Props) => {
  const { colors, isDark } = useTheme();
  const primary = COLORS.brand.primary;

  // ── State ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const styles = useMemo(() => createStyles({ colors, isDark, primary }), [colors, isDark, primary]);

  // ── Derived data ─────────────────────────────────────────────────────────

  const sortedResults = useMemo(() => {
    if (!results.length) return [];
    return [...results].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case 'price':
          cmp = a.itemPrice - b.itemPrice;
          break;
        case 'store':
          cmp = a.storeName.localeCompare(b.storeName, undefined, { sensitivity: 'base' });
          break;
        case 'name':
          cmp = a.itemName.localeCompare(b.itemName, undefined, { sensitivity: 'base' });
          break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [results, sortField, sortOrder]);

  // ── Callbacks ────────────────────────────────────────────────────────────

  const handleSortPress = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev !== field) {
        setSortOrder(field === 'date' ? 'desc' : 'asc');
        return field;
      }
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
      return prev;
    });
  }, []);

  const runSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const rows = await searchItemsAcrossReceipts(q);
      setResults(rows);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      runSearch(searchQuery).catch(() => undefined);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [runSearch, searchQuery]);

  const clearSearch = () => {
    setSearchQuery('');
    setResults([]);
  };

  // ── Row renderer ─────────────────────────────────────────────────────────

  const renderRow = ({ item }: { item: UnifiedSearchResult }) => {
    const hasReceipt = Boolean(item.receiptId);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.itemName} at ${item.storeName}`}
        onPress={() => {
          if (hasReceipt) {
            navigation.navigate('ReceiptDetail', { receiptId: item.receiptId! });
          }
        }}
        style={({ pressed }) => [
          styles.tableRow,
          pressed && hasReceipt ? styles.pressed : null,
        ]}
      >
        <Text style={styles.cellDate} numberOfLines={1}>
          {formatTimestamp(item.timestamp)}
        </Text>
        <Text style={styles.cellStore} numberOfLines={1}>
          {item.storeName}
        </Text>
        <Text style={styles.cellItem} numberOfLines={1}>
          {item.itemName}
        </Text>
        <Text style={styles.cellPrice} numberOfLines={1}>
          {formatCurrency(item.itemPrice)}
        </Text>
      </Pressable>
    );
  };

  // ── List header ──────────────────────────────────────────────────────────

  const ListHeader = (
    <View>
      <Header
        title="Item Search"
        showBackButton
        onBack={() => navigation.goBack()}
      />

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Feather name="search" size={18} color={colors.textSecondary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search for items (e.g., banana, milk, bread)..."
              placeholderTextColor={colors.textTertiary}
              style={styles.searchInput}
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="search"
              clearButtonMode="never"
            />
            {searchQuery.trim() ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={clearSearch}
                hitSlop={10}
                style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
              >
                <Feather name="x" size={18} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {/* Sort buttons */}
      <View style={styles.sortRow}>
        {(['date', 'price', 'store', 'name'] as const).map((field) => {
          const active = sortField === field;
          return (
            <Pressable
              key={field}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${sortLabel(field)}`}
              onPress={() => handleSortPress(field)}
              style={({ pressed }) => [
                styles.sortBtn,
                active ? styles.sortBtnActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Feather name={sortIcon(field) as any} size={16} color={active ? primary : colors.textSecondary} />
              <Text style={[styles.sortText, active ? styles.sortTextActive : null]}>
                {sortLabel(field)} {active ? arrowFor(sortOrder) : '▼'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Loading indicator */}
      {isSearching ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={primary} />
          <Text style={styles.loadingText}>Searching…</Text>
        </View>
      ) : null}

      {/* Results count + table header */}
      {searchQuery.trim() && !isSearching && sortedResults.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>
            {sortedResults.length} item{sortedResults.length === 1 ? '' : 's'} found
          </Text>
          <View style={styles.tableHeader}>
            <Text style={styles.headerDate}>Date & Time</Text>
            <Text style={styles.headerStore}>Store Name</Text>
            <Text style={styles.headerItem}>Item Name</Text>
            <Text style={styles.headerPrice}>Item Price</Text>
          </View>
        </>
      ) : null}

      {/* Empty state – no query */}
      {!searchQuery.trim() && !isSearching ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>Search for Items</Text>
          <Text style={styles.emptyBody}>
            {'Find items across all your receipts\nand compare prices between different stores'}
          </Text>
        </View>
      ) : null}

      {/* Empty state – no results */}
      {searchQuery.trim() && !isSearching && !sortedResults.length ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>No items found</Text>
          <Text style={styles.emptyBody}>Try searching for a different item name</Text>
        </View>
      ) : null}
    </View>
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <FlatList
        data={searchQuery.trim() && !isSearching ? sortedResults : []}
        keyExtractor={(item) => `${item.source}:${item.id}`}
        renderItem={renderRow}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={ListHeader}
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const createStyles = ({
  colors,
  isDark,
  primary,
}: {
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
    border: string;
    disabled: string;
  };
  isDark: boolean;
  primary: string;
}) => {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    listContent: { paddingBottom: SPACING.xl },

    pressed: { opacity: 0.85 },

    // ── Search bar ───────────────────────────────────────────────────────
    searchWrap: { paddingHorizontal: SPACING.lg, marginTop: SPACING.sm },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      width: '100%',
    },
    searchBar: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.full,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    searchInput: {
      flex: 1,
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      paddingVertical: 0,
    },
    clearBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? `${colors.text}10` : '#F3F4F6',
    },

    // ── Sort row ─────────────────────────────────────────────────────────
    sortRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: SPACING.lg,
      marginTop: SPACING.md,
    },
    sortBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      borderRadius: RADIUS.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sortBtnActive: {
      borderColor: primary,
      backgroundColor: isDark ? `${primary}22` : `${primary}12`,
    },
    sortText: { ...TYPOGRAPHY.label, color: colors.textSecondary, fontWeight: '800' },
    sortTextActive: { color: primary },

    // ── Loading ──────────────────────────────────────────────────────────
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: SPACING.lg,
      marginTop: SPACING.md,
    },
    loadingText: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },

    // ── Section title ────────────────────────────────────────────────────
    sectionTitle: {
      ...TYPOGRAPHY.caption,
      color: colors.textTertiary,
      letterSpacing: 1,
      marginTop: SPACING.lg,
      marginBottom: 10,
      marginHorizontal: SPACING.lg,
    },

    // ── Table header ─────────────────────────────────────────────────────
    tableHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingVertical: 10,
      marginHorizontal: SPACING.md,
      backgroundColor: isDark ? `${colors.text}08` : '#F1F5F9',
      borderTopLeftRadius: RADIUS.lg,
      borderTopRightRadius: RADIUS.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerDate: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      fontWeight: '900',
      width: '28%',
    },
    headerStore: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      fontWeight: '900',
      width: '24%',
    },
    headerItem: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      fontWeight: '900',
      flex: 1,
    },
    headerPrice: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      fontWeight: '900',
      width: '18%',
      textAlign: 'right',
    },

    // ── Table row ────────────────────────────────────────────────────────
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingVertical: 12,
      marginHorizontal: SPACING.md,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    cellDate: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      width: '28%',
    },
    cellStore: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      fontWeight: '700',
      width: '24%',
      paddingRight: 4,
    },
    cellItem: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      flex: 1,
      paddingRight: 4,
    },
    cellPrice: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      fontWeight: '900',
      width: '18%',
      textAlign: 'right',
    },

    // ── Empty state ──────────────────────────────────────────────────────
    emptyState: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.xl,
      alignItems: 'center',
    },
    emptyIcon: { fontSize: 34, marginBottom: 12 },
    emptyTitle: { ...TYPOGRAPHY.sectionHeading, color: colors.text, textAlign: 'center' },
    emptyBody: { ...TYPOGRAPHY.bodyNormal, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
  });
};

export default ItemSearchScreen;
