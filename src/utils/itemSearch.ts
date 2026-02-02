import type { ItemSearchPurchaseRow } from '@/services/database';
import {
  confidenceToPct,
  getAccuracyBucketFromPct,
  matchesAccuracyFilter,
  type AccuracyLevelFilter,
} from '@/utils/scannedReceipts';

export type SortField = 'date' | 'price' | 'store' | 'name';
export type SortOrder = 'asc' | 'desc';

export type SearchFilters = {
  selectedStores: Set<string>;
  sortField: SortField;
  sortOrder: SortOrder;
};

export type ReceiptItemPurchase = {
  id: string;
  receiptId: string;
  name: string;
  normalizedName: string;
  price: number;
  quantity: number;
  lineTotal: number;
  date: string;
  merchantName: string;
  categoryId?: string;
  imageUri?: string | null;
  ocrConfidencePct?: number | null;
  hasEditedOcr?: boolean;
};

export type ItemSearchResult = {
  itemName: string;
  normalizedName: string;
  purchases: ReceiptItemPurchase[];
  priceStats: {
    min: number;
    max: number;
    avg: number;
    count: number;
  };
  storeComparison: Array<{
    storeName: string;
    items: ReceiptItemPurchase[];
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    purchases: number;
    lastPurchase: ReceiptItemPurchase;
  }>;
  accuracyPct: number | null;
  lowAccuracyCount: number;
};

export type PriceComparison = {
  itemName: string;
  byStore: Map<
    string,
    {
      minPrice: number;
      maxPrice: number;
      avgPrice: number;
      lastPrice: number;
      count: number;
      purchases: ReceiptItemPurchase[];
    }
  >;
  overall: {
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    totalPurchases: number;
  };
  bestStoreName: string | null;
};

export const normalizeItemName = (value: string): string => {
  return (value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const levenshteinDistance = (a: string, b: string): number => {
  const s = a ?? '';
  const t = b ?? '';
  if (s === t) return 0;
  if (!s) return t.length;
  if (!t) return s.length;

  const m = s.length;
  const n = t.length;

  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) dp[j] = j;

  for (let i = 1; i <= m; i += 1) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prevDiag + cost);
      prevDiag = tmp;
    }
  }

  return dp[n];
};

export const toReceiptItemPurchases = (rows: ItemSearchPurchaseRow[]): ReceiptItemPurchase[] => {
  return rows.map((r) => {
    const quantity = typeof r.quantity === 'number' && Number.isFinite(r.quantity) && r.quantity > 0 ? r.quantity : 1;
    const unit = typeof r.unitPrice === 'number' && Number.isFinite(r.unitPrice) ? r.unitPrice : NaN;
    const total = typeof r.totalPrice === 'number' && Number.isFinite(r.totalPrice) ? r.totalPrice : 0;

    const price = Number.isFinite(unit) && unit > 0 ? unit : total / quantity;

    return {
      id: r.itemId,
      receiptId: r.receiptId,
      name: r.itemName,
      normalizedName: r.itemNameNormalized,
      price: Number.isFinite(price) ? price : 0,
      quantity,
      lineTotal: total,
      date: r.date,
      merchantName: r.merchant,
      categoryId: r.categoryId,
      imageUri: r.imageUri,
      ocrConfidencePct: confidenceToPct(r.ocrConfidence),
      hasEditedOcr: Boolean(r.hasEditedOcr),
    };
  });
};

export const filterPurchasesByAccuracy = (
  purchases: ReceiptItemPurchase[],
  filter: AccuracyLevelFilter,
): ReceiptItemPurchase[] => {
  if (filter === 'all') return purchases;
  return purchases.filter((p) => matchesAccuracyFilter(p.ocrConfidencePct ?? null, filter));
};

export const filterPurchasesByDateRange = (
  purchases: ReceiptItemPurchase[],
  range: { start?: Date; end?: Date } | null,
): ReceiptItemPurchase[] => {
  if (!range?.start && !range?.end) return purchases;

  const start = range?.start ? range.start.getTime() : null;
  const end = range?.end ? range.end.getTime() : null;

  return purchases.filter((p) => {
    const t = new Date(p.date).getTime();
    if (Number.isNaN(t)) return false;
    if (start !== null && t < start) return false;
    if (end !== null && t > end) return false;
    return true;
  });
};

const pickDisplayName = (purchases: ReceiptItemPurchase[]): string => {
  if (!purchases.length) return '';
  const counts = new Map<string, number>();
  for (const p of purchases) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
  return (
    Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? purchases[0]!.name
  );
};

export const calculatePriceStats = (purchases: ReceiptItemPurchase[]) => {
  const prices = purchases.map((p) => p.price).filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (!prices.length) {
    return { min: 0, max: 0, avg: 0, count: purchases.length };
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  return { min, max, avg, count: purchases.length };
};

export const groupPurchasesByStore = (purchases: ReceiptItemPurchase[]) => {
  const byStore = new Map<string, ReceiptItemPurchase[]>();
  for (const p of purchases) {
    const store = p.merchantName || 'Unknown';
    const list = byStore.get(store);
    if (list) list.push(p);
    else byStore.set(store, [p]);
  }

  return Array.from(byStore.entries()).map(([storeName, items]) => {
    const prices = items.map((i) => i.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((sum, n) => sum + n, 0) / prices.length;
    const lastPurchase = items
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? items[0]!;

    return {
      storeName,
      items,
      minPrice,
      maxPrice,
      avgPrice,
      purchases: items.length,
      lastPurchase,
    };
  });
};

export const calculateAvgAccuracyPct = (purchases: ReceiptItemPurchase[]): number | null => {
  const values = purchases
    .map((p) => p.ocrConfidencePct)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  if (!values.length) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
};

export const countLowAccuracyPurchases = (purchases: ReceiptItemPurchase[], thresholdPct = 80): number => {
  return purchases.filter((p) => (p.ocrConfidencePct ?? 0) > 0 && (p.ocrConfidencePct ?? 0) < thresholdPct).length;
};

export const groupPurchasesToResults = (purchases: ReceiptItemPurchase[]): ItemSearchResult[] => {
  const byName = new Map<string, ReceiptItemPurchase[]>();

  for (const p of purchases) {
    const key = p.normalizedName || normalizeItemName(p.name);
    const list = byName.get(key);
    if (list) list.push(p);
    else byName.set(key, [p]);
  }

  const results: ItemSearchResult[] = [];

  for (const [normalizedName, items] of byName.entries()) {
    const itemName = pickDisplayName(items);
    const priceStats = calculatePriceStats(items);
    const storeComparison = groupPurchasesByStore(items).sort((a, b) => a.avgPrice - b.avgPrice || b.purchases - a.purchases);
    const accuracyPct = calculateAvgAccuracyPct(items);
    const lowAccuracyCount = countLowAccuracyPurchases(items, 80);

    results.push({
      itemName,
      normalizedName,
      purchases: items,
      priceStats,
      storeComparison,
      accuracyPct,
      lowAccuracyCount,
    });
  }

  // Default ordering: most purchases, then best (lowest) price.
  results.sort((a, b) => b.purchases.length - a.purchases.length || a.priceStats.min - b.priceStats.min);
  return results;
};

export const getAccuracyIconForPct = (pct: number | null): string => {
  const bucket = getAccuracyBucketFromPct(pct);
  if (bucket === 'high') return '✅';
  if (bucket === 'medium') return '⚠️';
  if (bucket === 'low') return '❌';
  return '—';
};

export const rankAndFilterPurchases = (
  purchases: ReceiptItemPurchase[],
  query: string,
): ReceiptItemPurchase[] => {
  const q = normalizeItemName(query);
  if (!q) return [];

  const scored = purchases
    .map((p) => {
      const nameNorm = p.normalizedName || normalizeItemName(p.name);

      const starts = nameNorm.startsWith(q);
      const includes = nameNorm.includes(q);
      const dist = q.length >= 3 ? levenshteinDistance(nameNorm.slice(0, Math.min(32, nameNorm.length)), q) : 99;

      // Smaller is better.
      const score = (starts ? 0 : includes ? 10 : 25) + Math.min(dist, 20);
      return { p, score };
    })
    .filter(({ p }) => {
      const nameNorm = p.normalizedName || normalizeItemName(p.name);
      if (nameNorm.includes(q)) return true;
      if (q.length >= 4) return levenshteinDistance(nameNorm, q) <= 2;
      return false;
    })
    .sort((a, b) => a.score - b.score);

  return scored.map((s) => s.p);
};

export const applyFiltersAndSort = (purchases: ReceiptItemPurchase[], filters: SearchFilters): ReceiptItemPurchase[] => {
  const filtered = filters.selectedStores.size
    ? purchases.filter((p) => filters.selectedStores.has(p.merchantName))
    : purchases;

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;

    switch (filters.sortField) {
      case 'date':
        cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
        break;
      case 'price':
        cmp = a.price - b.price;
        break;
      case 'store':
        cmp = a.merchantName.localeCompare(b.merchantName, undefined, { sensitivity: 'base' });
        break;
      case 'name':
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        break;
    }

    return filters.sortOrder === 'asc' ? cmp : -cmp;
  });

  // Default to newest-first if date sort is selected but order isn't explicitly set.
  return sorted;
};

export const calculatePriceComparison = (
  purchases: ReceiptItemPurchase[],
  itemName: string,
): PriceComparison | null => {
  if (!purchases.length) return null;

  const byStore = new Map<
    string,
    {
      minPrice: number;
      maxPrice: number;
      avgPrice: number;
      lastPrice: number;
      count: number;
      purchases: ReceiptItemPurchase[];
    }
  >();

  const allPrices: number[] = [];

  for (const p of purchases) {
    allPrices.push(p.price);

    const key = p.merchantName || 'Unknown';
    const existing = byStore.get(key);
    if (!existing) {
      byStore.set(key, {
        minPrice: p.price,
        maxPrice: p.price,
        avgPrice: p.price,
        lastPrice: p.price,
        count: 1,
        purchases: [p],
      });
    } else {
      existing.minPrice = Math.min(existing.minPrice, p.price);
      existing.maxPrice = Math.max(existing.maxPrice, p.price);
      existing.count += 1;
      existing.purchases.push(p);
      existing.avgPrice = existing.purchases.reduce((sum, x) => sum + x.price, 0) / existing.count;

      // lastPrice = most recent.
      const mostRecent = existing.purchases
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      existing.lastPrice = mostRecent?.price ?? existing.lastPrice;
    }
  }

  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const avgPrice = allPrices.reduce((sum, x) => sum + x, 0) / allPrices.length;

  // Best store = lowest avg price.
  let bestStoreName: string | null = null;
  let bestAvg = Number.POSITIVE_INFINITY;
  for (const [store, s] of byStore.entries()) {
    if (s.avgPrice < bestAvg) {
      bestAvg = s.avgPrice;
      bestStoreName = store;
    }
  }

  return {
    itemName,
    byStore,
    overall: {
      minPrice,
      maxPrice,
      avgPrice,
      totalPurchases: purchases.length,
    },
    bestStoreName,
  };
};

export const getTopStores = (purchases: ReceiptItemPurchase[], max = 8): string[] => {
  const counts = new Map<string, number>();
  for (const p of purchases) {
    const key = p.merchantName || 'Unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([name]) => name);
};
