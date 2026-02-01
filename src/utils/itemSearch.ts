import type { ItemSearchPurchaseRow } from '@/services/database';

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
    };
  });
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
