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
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';

import { Card } from '@/components/common';
import { Header } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { MainStackParamList } from '@/navigation/types';
import { searchReceiptItemPurchases, type ItemSearchPurchaseRow } from '@/services/database';
import { formatCurrency, formatDate } from '@/utils/format';
import {
  applyFiltersAndSort,
  calculatePriceComparison,
  filterPurchasesByAccuracy,
  filterPurchasesByDateRange,
  getTopStores,
  getAccuracyIconForPct,
  groupPurchasesToResults,
  rankAndFilterPurchases,
  toReceiptItemPurchases,
  type ItemSearchResult,
  type ReceiptItemPurchase,
  type SearchFilters,
  type SortField,
} from '@/utils/itemSearch';

import { getAccuracyBucketFromPct, getAccuracyLabelForBucket, type AccuracyLevelFilter } from '@/utils/scannedReceipts';

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

const formatTimeMaybe = (iso: string): string | null => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
};

export const ItemSearchScreen = ({ navigation }: Props) => {
  const { colors, isDark } = useTheme();
  const primary = COLORS.brand.primary;

  const [searchQuery, setSearchQuery] = useState('');
  const [rawRows, setRawRows] = useState<ItemSearchPurchaseRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());

  const [accuracyFilter, setAccuracyFilter] = useState<AccuracyLevelFilter>('all');
  const [dateRangeId, setDateRangeId] = useState<'all' | '30d' | '90d' | '1y'>('all');

  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());

  const [selectedItem, setSelectedItem] = useState<ItemSearchResult | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const styles = useMemo(() => createStyles({ colors, isDark, primary }), [colors, isDark, primary]);

  const filters: SearchFilters = useMemo(
    () => ({
      selectedStores,
      sortField,
      sortOrder,
    }),
    [selectedStores, sortField, sortOrder],
  );

  const purchasesAll = useMemo(() => toReceiptItemPurchases(rawRows), [rawRows]);

  const rankedPurchases = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return rankAndFilterPurchases(purchasesAll, q);
  }, [purchasesAll, searchQuery]);

  const dateRange = useMemo(() => {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

    switch (dateRangeId) {
      case '30d': {
        const end = new Date(now);
        const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { start: startOfDay(start), end };
      }
      case '90d': {
        const end = new Date(now);
        const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
        return { start: startOfDay(start), end };
      }
      case '1y': {
        const end = new Date(now);
        const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        return { start: startOfDay(start), end };
      }
      case 'all':
      default:
        return null;
    }
  }, [dateRangeId]);

  const rankedFiltered = useMemo(() => {
    const byAcc = filterPurchasesByAccuracy(rankedPurchases, accuracyFilter);
    return filterPurchasesByDateRange(byAcc, dateRange);
  }, [accuracyFilter, dateRange, rankedPurchases]);

  const filteredSorted = useMemo(() => {
    if (!rankedFiltered.length) return [];
    return applyFiltersAndSort(rankedFiltered, filters);
  }, [filters, rankedFiltered]);

  const storesForChips = useMemo(() => getTopStores(rankedPurchases, 8), [rankedPurchases]);

  const groupedResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return groupPurchasesToResults(filteredSorted);
  }, [filteredSorted, searchQuery]);

  const selectedPurchases = useMemo(() => {
    if (!selectedItem) return [];
    return selectedItem.purchases
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedItem]);

  const lowAccuracyPurchases = useMemo(() => {
    if (!selectedPurchases.length) return [];
    return selectedPurchases
      .filter((p) => (p.ocrConfidencePct ?? 0) > 0 && (p.ocrConfidencePct ?? 0) < 80)
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedPurchases]);

  const comparison = useMemo(() => {
    if (!selectedItem || !selectedPurchases.length) return null;
    return calculatePriceComparison(selectedPurchases, selectedItem.itemName);
  }, [selectedItem, selectedPurchases]);

  const storeRows = useMemo(() => {
    if (!comparison) return [];
    const rows = Array.from(comparison.byStore.entries()).map(([store, data]) => ({ store, ...data }));
    // Default: best price first, then count.
    rows.sort((a, b) => a.avgPrice - b.avgPrice || b.count - a.count);
    return rows;
  }, [comparison]);

  const filterCount = useMemo(() => {
    let c = selectedStores.size;
    if (accuracyFilter !== 'all') c += 1;
    if (dateRangeId !== 'all') c += 1;
    return c;
  }, [accuracyFilter, dateRangeId, selectedStores.size]);

  const toggleStoreFilter = useCallback((store: string) => {
    setSelectedStores((prev) => {
      const next = new Set(prev);
      if (next.has(store)) next.delete(store);
      else next.add(store);
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setSelectedStores(new Set());
    setAccuracyFilter('all');
    setDateRangeId('all');
  }, []);

  const toggleStoreExpanded = useCallback((store: string) => {
    setExpandedStores((prev) => {
      const next = new Set(prev);
      if (next.has(store)) next.delete(store);
      else next.add(store);
      return next;
    });
  }, []);

  const handleSortPress = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev !== field) {
        // When switching field, default to intuitive ordering.
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
      setRawRows([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const rows = await searchReceiptItemPurchases(q, 350);
      setRawRows(rows);

      // Remove store selections that no longer exist.
      const stores = new Set(rows.map((r) => r.merchant).filter(Boolean));
      setSelectedStores((prev) => {
        if (!prev.size) return prev;
        const next = new Set(Array.from(prev).filter((s) => stores.has(s)));
        return next;
      });

      setExpandedStores(new Set());
    } catch {
      setRawRows([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Query change should reset any selected item detail view.
    setSelectedItem(null);

    debounceRef.current = setTimeout(() => {
      runSearch(searchQuery).catch(() => undefined);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [runSearch, searchQuery]);

  const filterAction = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Filters"
      onPress={() => setFiltersOpen((v) => !v)}
      hitSlop={10}
      style={({ pressed }) => [styles.filterBtn, filtersOpen ? styles.filterBtnActive : null, pressed && styles.pressed]}
    >
      <Feather name="filter" size={ICON_SIZES.md} color={filtersOpen ? COLORS.common.white : colors.text} />
      {filterCount > 0 ? (
        <View style={[styles.filterBadge, filtersOpen ? styles.filterBadgeActive : null]}>
          <Text style={[styles.filterBadgeText, filtersOpen ? styles.filterBadgeTextActive : null]}>{filterCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  const clearSearch = () => {
    setSearchQuery('');
    setRawRows([]);
    setSelectedStores(new Set());
    setExpandedStores(new Set());
    setAccuracyFilter('all');
    setDateRangeId('all');
    setSelectedItem(null);
  };

  const renderPurchaseCard = ({ item }: { item: ReceiptItemPurchase }) => {
    const dateLabel = formatDate(item.date, 'short');
    const timeLabel = formatTimeMaybe(item.date);
    const pct = typeof item.ocrConfidencePct === 'number' ? Math.round(item.ocrConfidencePct) : null;
    const ocrIcon = getAccuracyIconForPct(item.ocrConfidencePct ?? null);

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View receipt for ${item.name}`}
        onPress={() => navigation.navigate('ReceiptDetail', { receiptId: item.receiptId })}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Card style={styles.purchaseCard}>
          <View style={styles.purchaseTopRow}>
            <Text style={styles.purchaseTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.purchasePrice}>{formatCurrency(item.price)}</Text>
          </View>

          <View style={styles.purchaseMetaRow}>
            <View style={styles.metaLeft}>
              <Feather name="check-circle" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>
                OCR: {pct === null ? '—' : `${pct}%`} {ocrIcon}
                {item.hasEditedOcr ? ' • Edited' : ''}
              </Text>
            </View>
          </View>

          <View style={styles.purchaseMetaRow}>
            <View style={styles.metaLeft}>
              <Feather name="shopping-bag" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText} numberOfLines={1}>
                {item.merchantName}
              </Text>
            </View>

            {item.quantity > 1 ? (
              <View style={styles.qtyPill}>
                <Text style={styles.qtyText}>Qty: {Number.isInteger(item.quantity) ? item.quantity : item.quantity.toFixed(2)}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.purchaseMetaRow}>
            <View style={styles.metaLeft}>
              <Feather name="calendar" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>{dateLabel}</Text>
            </View>

            {timeLabel ? (
              <View style={styles.metaLeft}>
                <Feather name="clock" size={14} color={colors.textSecondary} />
                <Text style={styles.metaText}>{timeLabel}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.viewReceiptRow}>
            <Text style={styles.viewReceiptText}>View Receipt →</Text>
          </View>
        </Card>
      </Pressable>
    );
  };

  const renderResultCard = ({ item }: { item: ItemSearchResult }) => {
    const best = item.storeComparison[0];
    const ocrPct = typeof item.accuracyPct === 'number' ? Math.round(item.accuracyPct) : null;
    const ocrIcon = getAccuracyIconForPct(item.accuracyPct);

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${item.itemName}`}
        onPress={() => {
          setSelectedItem(item);
          setExpandedStores(new Set());
        }}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Card style={styles.resultCard}>
          <View style={styles.resultTopRow}>
            <View style={styles.resultLeft}>
              <Text style={styles.resultTitle} numberOfLines={1}>
                {item.itemName}
              </Text>
              <Text style={styles.resultSub}>
                {item.purchases.length} purchase{item.purchases.length === 1 ? '' : 's'} • OCR:{' '}
                <Text style={styles.resultSubStrong}>
                  {ocrPct === null ? '—' : `${ocrPct}%`} {ocrIcon}
                </Text>
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </View>

          {item.lowAccuracyCount > 0 ? (
            <View style={styles.lowAccBanner}>
              <Text style={styles.lowAccText}>
                ⚠️ Low OCR accuracy on {item.lowAccuracyCount} receipt{item.lowAccuracyCount === 1 ? '' : 's'}. Prices may need verification.
              </Text>
            </View>
          ) : null}

          <View style={styles.resultStatsRow}>
            <View style={styles.resultStatCell}>
              <Text style={styles.resultStatLabel}>Range</Text>
              <Text style={styles.resultStatValue}>
                {formatCurrency(item.priceStats.min)} - {formatCurrency(item.priceStats.max)}
              </Text>
            </View>
            <View style={styles.resultStatCell}>
              <Text style={styles.resultStatLabel}>Avg</Text>
              <Text style={styles.resultStatValue}>{formatCurrency(item.priceStats.avg)}</Text>
            </View>
          </View>

          {best ? (
            <View style={styles.bestStoreRow}>
              <Text style={styles.bestStoreLabel}>🏆 Best avg</Text>
              <Text style={styles.bestStoreValue} numberOfLines={1}>
                {best.storeName} • {formatCurrency(best.avgPrice)} ({best.purchases}x)
              </Text>
            </View>
          ) : null}

          {item.storeComparison.length ? (
            <View style={styles.byStoreMiniWrap}>
              {item.storeComparison.slice(0, 3).map((s) => (
                <View key={s.storeName} style={styles.byStoreMiniRow}>
                  <Text style={styles.byStoreMiniName} numberOfLines={1}>
                    🏪 {s.storeName}
                  </Text>
                  <Text style={styles.byStoreMiniPrice}>{formatCurrency(s.minPrice)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      </Pressable>
    );
  };

  const ListHeader = (
    <View>
      <Header
        title={selectedItem ? selectedItem.itemName : 'Item Search'}
        showBackButton
        onBack={() => {
          if (selectedItem) setSelectedItem(null);
          else navigation.goBack();
        }}
      />

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

          <View style={styles.filterInlineWrap}>{filterAction}</View>
        </View>
      </View>

      {filtersOpen ? (
        <Card style={styles.filterCard}>
          <View style={styles.filterHeaderRow}>
            <Text style={styles.filterTitle}>Filters</Text>
            {filterCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear all filters"
                onPress={clearAllFilters}
                style={({ pressed }) => [styles.clearAllBtn, pressed && styles.pressed]}
              >
                <Text style={styles.clearAllText}>Clear all</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.filterSectionTitle}>OCR Accuracy</Text>
          <View style={styles.chipsWrap}>
            {([
              { id: 'all', label: 'All' },
              { id: 'high', label: 'High (85%+)' },
              { id: 'medium', label: 'Medium (70-84%)' },
              { id: 'low', label: 'Low (<70%)' },
            ] as const).map((opt) => {
              const active = accuracyFilter === opt.id;
              const bucketLabel = opt.id === 'all' ? '' : getAccuracyLabelForBucket(getAccuracyBucketFromPct(opt.id === 'high' ? 90 : opt.id === 'medium' ? 75 : 50));
              return (
                <Pressable
                  key={opt.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Accuracy ${bucketLabel || opt.label}`}
                  onPress={() => setAccuracyFilter(opt.id)}
                  style={({ pressed }) => [styles.chip, active ? styles.chipActive : null, pressed ? styles.pressed : null]}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.filterSectionTitle}>Date Range</Text>
          <View style={styles.chipsWrap}>
            {([
              { id: 'all', label: 'All Time' },
              { id: '30d', label: '30d' },
              { id: '90d', label: '90d' },
              { id: '1y', label: '1y' },
            ] as const).map((opt) => {
              const active = dateRangeId === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Date range ${opt.label}`}
                  onPress={() => setDateRangeId(opt.id)}
                  style={({ pressed }) => [styles.chip, active ? styles.chipActive : null, pressed ? styles.pressed : null]}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.filterSectionTitle}>Store</Text>

          <View style={styles.chipsWrap}>
            {storesForChips.length ? (
              storesForChips.map((store) => {
                const active = selectedStores.has(store);
                return (
                  <Pressable
                    key={store}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter by ${store}`}
                    onPress={() => toggleStoreFilter(store)}
                    style={({ pressed }) => [
                      styles.chip,
                      active ? styles.chipActive : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]} numberOfLines={1}>
                      {store}
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.filterHint}>Search to see available stores.</Text>
            )}
          </View>
        </Card>
      ) : null}

      <View style={styles.sortRow}>
        {(['date', 'price', 'store'] as const).map((field) => {
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

      {isSearching ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={primary} />
          <Text style={styles.loadingText}>Searching…</Text>
        </View>
      ) : null}

      {comparison ? (
        <Card style={styles.compareCard}>
          <View style={styles.compareHeader}>
            <View style={styles.compareTitleRow}>
              <Text style={styles.compareIcon}>📊</Text>
              <Text style={styles.compareTitle}>Price Comparison</Text>
            </View>
            <Text style={styles.compareSub}>
              {comparison.overall.totalPurchases} purchase{comparison.overall.totalPurchases === 1 ? '' : 's'} across{' '}
              {comparison.byStore.size} store{comparison.byStore.size === 1 ? '' : 's'}
              {selectedItem?.accuracyPct != null ? (
                <Text>
                  {' '}• OCR {Math.round(selectedItem.accuracyPct)}% {getAccuracyIconForPct(selectedItem.accuracyPct)}
                </Text>
              ) : null}
            </Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCell}>
              <Text style={[styles.statIcon, { color: '#16A34A' }]}>↓</Text>
              <Text style={styles.statValue}>{formatCurrency(comparison.overall.minPrice)}</Text>
              <Text style={styles.statLabel}>Lowest</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statIcon, { color: colors.textSecondary }]}>💰</Text>
              <Text style={styles.statValue}>{formatCurrency(comparison.overall.avgPrice)}</Text>
              <Text style={styles.statLabel}>Average</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statIcon, { color: '#DC2626' }]}>↑</Text>
              <Text style={styles.statValue}>{formatCurrency(comparison.overall.maxPrice)}</Text>
              <Text style={styles.statLabel}>Highest</Text>
            </View>
          </View>

          <View style={styles.byStoreHeaderRow}>
            <Text style={styles.byStoreTitle}>By Store</Text>
            <Text style={styles.byStoreHint}>▼</Text>
          </View>

          {storeRows.map((s) => {
            const expanded = expandedStores.has(s.store);
            const best = comparison.bestStoreName && s.store === comparison.bestStoreName;
            const purchases = s.purchases
              .slice()
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const shown = expanded ? purchases.slice(0, 3) : [];
            const remaining = purchases.length - shown.length;

            return (
              <View key={s.store} style={styles.storeBlock}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Toggle ${s.store}`}
                  onPress={() => toggleStoreExpanded(s.store)}
                  style={({ pressed }) => [styles.storeRow, pressed && styles.pressed]}
                >
                  <View style={styles.storeLeft}>
                    <Text style={styles.storeName} numberOfLines={1}>
                      🏪 {s.store}
                    </Text>
                    <Text style={styles.storeMeta}>
                      {s.count} purchase{s.count === 1 ? '' : 's'}
                    </Text>
                  </View>

                  <View style={styles.storeRight}>
                    <Text style={styles.storeAvg}>{formatCurrency(s.avgPrice)} avg</Text>
                    {best ? (
                      <View style={styles.bestBadge}>
                        <Text style={styles.bestBadgeText}>BEST PRICE</Text>
                      </View>
                    ) : null}
                    <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
                  </View>
                </Pressable>

                {expanded ? (
                  <View style={styles.storeExpanded}>
                    {shown.map((p) => {
                      const dateLabel = formatDate(p.date, 'short');
                      const timeLabel = formatTimeMaybe(p.date);
                      return (
                        <View key={p.id} style={styles.miniCard}>
                          <View style={styles.miniTop}>
                            <Text style={styles.miniPrice}>{formatCurrency(p.price)}</Text>
                            <Text style={styles.miniQty}>Qty: {Number.isInteger(p.quantity) ? p.quantity : p.quantity.toFixed(2)}</Text>
                          </View>
                          <View style={styles.miniMetaRow}>
                            <Feather name="calendar" size={14} color={colors.textSecondary} />
                            <Text style={styles.miniMetaText}>{dateLabel}</Text>
                            {timeLabel ? (
                              <>
                                <Text style={styles.miniMetaSep}>•</Text>
                                <Feather name="clock" size={14} color={colors.textSecondary} />
                                <Text style={styles.miniMetaText}>{timeLabel}</Text>
                              </>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}

                    {remaining > 0 ? (
                      <Text style={styles.moreText}>+{remaining} more purchase{remaining === 1 ? '' : 's'}</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      ) : null}

      {selectedItem && lowAccuracyPurchases.length ? (
        <Card style={styles.warnCard}>
          <Text style={styles.warnTitle}>⚠️ Low OCR accuracy detected</Text>
          <Text style={styles.warnBody}>
            {lowAccuracyPurchases.length} purchase{lowAccuracyPurchases.length === 1 ? '' : 's'} have OCR below 80%. Prices from these receipts may need verification.
          </Text>

          <View style={styles.warnList}>
            {lowAccuracyPurchases.slice(0, 2).map((p) => {
              const dateLabel = formatDate(p.date, 'short');
              const pct = typeof p.ocrConfidencePct === 'number' ? Math.round(p.ocrConfidencePct) : null;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open receipt from ${p.merchantName}`}
                  onPress={() => navigation.navigate('ReceiptDetail', { receiptId: p.receiptId })}
                  style={({ pressed }) => [styles.warnRow, pressed && styles.pressed]}
                >
                  <Text style={styles.warnRowLeft} numberOfLines={1}>
                    📄 {dateLabel} • {p.merchantName}
                  </Text>
                  <Text style={styles.warnRowRight}>
                    {pct === null ? '—' : `${pct}%`} {getAccuracyIconForPct(p.ocrConfidencePct ?? null)}
                  </Text>
                </Pressable>
              );
            })}

            {lowAccuracyPurchases.length > 2 ? (
              <Text style={styles.warnMore}>+{lowAccuracyPurchases.length - 2} more</Text>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Scanned Receipts"
            onPress={() => navigation.navigate('ScannedReceipts')}
            style={({ pressed }) => [styles.reviewBtn, pressed && styles.pressed]}
          >
            <Text style={styles.reviewBtnText}>Review in Scanned Receipts</Text>
          </Pressable>
        </Card>
      ) : null}

      {searchQuery.trim() && !isSearching && !selectedItem && groupedResults.length ? (
        <Text style={styles.sectionTitle}>Search Results ({groupedResults.length})</Text>
      ) : null}

      {searchQuery.trim() && !isSearching && selectedItem && selectedPurchases.length ? (
        <Text style={styles.sectionTitle}>Purchase History ({selectedPurchases.length})</Text>
      ) : null}

      {!searchQuery.trim() && !isSearching ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>Search for Items</Text>
          <Text style={styles.emptyBody}>
            {'Find items across all your receipts\nand compare prices between different stores'}
          </Text>
        </View>
      ) : null}

      {searchQuery.trim() && !isSearching && !selectedItem && !groupedResults.length ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>No items found</Text>
          <Text style={styles.emptyBody}>Try searching for a different item name</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {selectedItem ? (
        <FlatList
          data={selectedPurchases}
          keyExtractor={(item) => `${item.id}`}
          renderItem={renderPurchaseCard}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={ListHeader}
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        <FlatList
          data={groupedResults}
          keyExtractor={(item) => item.normalizedName}
          renderItem={renderResultCard}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={ListHeader}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  );
};

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
  const cardBg = colors.surface;
  const subtle = isDark ? `${colors.text}12` : '#EEF2FF';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    listContent: { paddingBottom: SPACING.xl },

    pressed: { opacity: 0.85 },

    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },

    filterBtn: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    filterBtnActive: {
      backgroundColor: primary,
      borderColor: primary,
    },
    filterInlineWrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    filterBadgeActive: {
      backgroundColor: COLORS.common.white,
    },
    filterBadgeText: {
      ...TYPOGRAPHY.caption,
      color: COLORS.common.white,
      fontWeight: '800',
      marginTop: -1,
    },
    filterBadgeTextActive: {
      color: primary,
    },

    searchWrap: { paddingHorizontal: SPACING.lg, marginTop: SPACING.sm },
    searchBar: {
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

    filterCard: {
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.md,
      padding: SPACING.md,
      backgroundColor: cardBg,
      borderRadius: RADIUS.lg,
    },
    filterHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    filterTitle: { ...TYPOGRAPHY.cardTitle, color: colors.text },
    filterHint: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },
    clearAllBtn: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: RADIUS.full,
      backgroundColor: subtle,
    },
    clearAllText: { ...TYPOGRAPHY.label, color: primary, fontWeight: '800' },

    filterSectionTitle: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      fontWeight: '800',
      marginTop: 12,
      marginBottom: 8,
    },

    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    chip: {
      maxWidth: '100%',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? `${colors.text}10` : '#F3F4F6',
      borderWidth: 1,
      borderColor: isDark ? `${colors.text}14` : '#E5E7EB',
    },
    chipActive: {
      backgroundColor: isDark ? `${primary}28` : `${primary}14`,
      borderColor: primary,
    },
    chipText: { ...TYPOGRAPHY.bodySmall, color: colors.text, fontWeight: '700' },
    chipTextActive: { color: primary },

    sortRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: SPACING.lg,
      marginTop: SPACING.md,
    },

    resultCard: {
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.md,
      padding: SPACING.lg,
      borderRadius: RADIUS.xl,
      backgroundColor: cardBg,
    },
    resultTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    resultLeft: { flex: 1 },
    resultTitle: { ...TYPOGRAPHY.cardTitle, color: colors.text, fontWeight: '900' },
    resultSub: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: 4 },
    resultSubStrong: { color: colors.text, fontWeight: '900' },

    lowAccBanner: {
      marginTop: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: RADIUS.lg,
      backgroundColor: isDark ? `${primary}1A` : '#FFFBEB',
      borderWidth: 1,
      borderColor: isDark ? `${primary}33` : '#FDE68A',
    },
    lowAccText: { ...TYPOGRAPHY.caption, color: isDark ? colors.textSecondary : '#92400E', fontWeight: '700' },

    resultStatsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    resultStatCell: { flex: 1 },
    resultStatLabel: { ...TYPOGRAPHY.caption, color: colors.textSecondary, fontWeight: '800' },
    resultStatValue: { ...TYPOGRAPHY.bodyNormal, color: colors.text, fontWeight: '900', marginTop: 4 },

    bestStoreRow: { marginTop: 12 },
    bestStoreLabel: { ...TYPOGRAPHY.caption, color: colors.textSecondary, fontWeight: '800' },
    bestStoreValue: { ...TYPOGRAPHY.bodySmall, color: colors.text, fontWeight: '900', marginTop: 4 },

    byStoreMiniWrap: { marginTop: 10, gap: 8 },
    byStoreMiniRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: RADIUS.lg,
      backgroundColor: isDark ? `${colors.text}08` : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.border,
    },
    byStoreMiniName: { ...TYPOGRAPHY.bodySmall, color: colors.text, fontWeight: '800', flex: 1, paddingRight: 10 },
    byStoreMiniPrice: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, fontWeight: '900' },
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

    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: SPACING.lg,
      marginTop: SPACING.md,
    },
    loadingText: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },

    compareCard: {
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.lg,
      padding: SPACING.lg,
      borderRadius: RADIUS.xl,
      backgroundColor: cardBg,
    },
    compareHeader: { marginBottom: SPACING.md },
    compareTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    compareIcon: { fontSize: 18 },
    compareTitle: { ...TYPOGRAPHY.sectionHeading, color: colors.text },
    compareSub: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: 4 },

    warnCard: {
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.md,
      padding: SPACING.lg,
      borderRadius: RADIUS.xl,
      backgroundColor: isDark ? `${colors.text}08` : '#FFFBEB',
      borderWidth: 1,
      borderColor: isDark ? `${colors.text}14` : '#FDE68A',
    },
    warnTitle: { ...TYPOGRAPHY.cardTitle, color: colors.text, fontWeight: '900' },
    warnBody: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: 8 },
    warnList: { marginTop: 12, gap: 8 },
    warnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: RADIUS.lg,
      backgroundColor: isDark ? `${colors.text}08` : '#FFFFFF',
      borderWidth: 1,
      borderColor: colors.border,
    },
    warnRowLeft: { ...TYPOGRAPHY.bodySmall, color: colors.text, fontWeight: '800', flex: 1 },
    warnRowRight: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, fontWeight: '900' },
    warnMore: { ...TYPOGRAPHY.caption, color: colors.textSecondary, fontWeight: '800' },

    statsGrid: {
      flexDirection: 'row',
      gap: 10,
      marginTop: SPACING.md,
    },
    statCell: {
      flex: 1,
      backgroundColor: isDark ? `${colors.text}08` : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingVertical: 12,
      paddingHorizontal: 10,
      alignItems: 'center',
    },
    statIcon: { fontSize: 16, marginBottom: 6 },
    statValue: { ...TYPOGRAPHY.bodyLarge, color: colors.text, fontWeight: '900' },
    statLabel: { ...TYPOGRAPHY.caption, color: colors.textSecondary, marginTop: 4 },

    byStoreHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.lg,
      marginBottom: SPACING.sm,
    },
    byStoreTitle: { ...TYPOGRAPHY.cardTitle, color: colors.text },
    byStoreHint: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },

    storeBlock: { marginTop: SPACING.sm },
    storeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? `${colors.text}08` : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    storeLeft: { flex: 1, paddingRight: 10 },
    storeName: { ...TYPOGRAPHY.bodyNormal, color: colors.text, fontWeight: '900' },
    storeMeta: { ...TYPOGRAPHY.caption, color: colors.textSecondary, marginTop: 2 },
    storeRight: { alignItems: 'flex-end', gap: 6 },
    storeAvg: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, fontWeight: '800' },
    bestBadge: {
      backgroundColor: '#16A34A',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: RADIUS.full,
    },
    bestBadgeText: { ...TYPOGRAPHY.caption, color: COLORS.common.white, fontWeight: '900' },

    storeExpanded: {
      paddingHorizontal: 6,
      paddingTop: 10,
    },
    miniCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: 12,
      marginBottom: 10,
    },
    miniTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    miniPrice: { ...TYPOGRAPHY.bodyLarge, color: colors.text, fontWeight: '900' },
    miniQty: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, fontWeight: '800' },
    miniMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    miniMetaText: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },
    miniMetaSep: { ...TYPOGRAPHY.bodySmall, color: colors.textTertiary },
    moreText: { ...TYPOGRAPHY.bodySmall, color: primary, fontWeight: '800', paddingHorizontal: 6 },

    sectionTitle: {
      ...TYPOGRAPHY.caption,
      color: colors.textTertiary,
      letterSpacing: 1,
      marginTop: SPACING.lg,
      marginBottom: 10,
      marginHorizontal: SPACING.lg,
    },

    purchaseCard: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
      padding: SPACING.lg,
      borderRadius: RADIUS.xl,
      backgroundColor: cardBg,
    },
    purchaseTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    purchaseTitle: { ...TYPOGRAPHY.cardTitle, color: colors.text, flex: 1 },
    purchasePrice: { ...TYPOGRAPHY.bodyLarge, color: colors.text, fontWeight: '900' },

    purchaseMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    metaLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    metaText: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },

    viewReceiptRow: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      alignItems: 'flex-end',
    },
    viewReceiptText: { ...TYPOGRAPHY.bodySmall, color: primary, fontWeight: '900' },

    qtyPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? `${primary}22` : `${primary}12`,
      borderWidth: 1,
      borderColor: isDark ? `${primary}66` : `${primary}55`,
    },
    qtyText: { ...TYPOGRAPHY.caption, color: primary, fontWeight: '900' },

    emptyState: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.xl,
      alignItems: 'center',
    },
    emptyIcon: { fontSize: 34, marginBottom: 12 },
    emptyTitle: { ...TYPOGRAPHY.sectionHeading, color: colors.text, textAlign: 'center' },
    emptyBody: { ...TYPOGRAPHY.bodyNormal, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },

    reviewBtn: {
      marginTop: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: RADIUS.lg,
      backgroundColor: isDark ? `${primary}22` : `${primary}12`,
      borderWidth: 1,
      borderColor: isDark ? `${primary}66` : `${primary}55`,
      alignItems: 'center',
    },
    reviewBtnText: { ...TYPOGRAPHY.bodySmall, color: primary, fontWeight: '900' },
  });
};

export default ItemSearchScreen;
