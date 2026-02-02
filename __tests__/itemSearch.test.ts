import {
  applyFiltersAndSort,
  calculatePriceComparison,
  getTopStores,
  groupPurchasesToResults,
  levenshteinDistance,
  normalizeItemName,
  rankAndFilterPurchases,
  type ReceiptItemPurchase,
} from '@/utils/itemSearch';

const makePurchase = (overrides: Partial<ReceiptItemPurchase>): ReceiptItemPurchase => {
  return {
    id: overrides.id ?? 'id',
    receiptId: overrides.receiptId ?? 'r1',
    name: overrides.name ?? 'Item',
    normalizedName: overrides.normalizedName ?? normalizeItemName(overrides.name ?? 'Item'),
    price: overrides.price ?? 1,
    quantity: overrides.quantity ?? 1,
    lineTotal: overrides.lineTotal ?? (overrides.price ?? 1) * (overrides.quantity ?? 1),
    date: overrides.date ?? '2026-01-15T14:30:00.000Z',
    merchantName: overrides.merchantName ?? 'Walmart',
    categoryId: overrides.categoryId,
    imageUri: overrides.imageUri,
    ocrConfidencePct: overrides.ocrConfidencePct,
    hasEditedOcr: overrides.hasEditedOcr,
  };
};

describe('itemSearch utils', () => {
  test('normalizeItemName lowercases, strips punctuation, and collapses spaces', () => {
    expect(normalizeItemName('  Organic-Bananas!!  ')).toBe('organic bananas');
    expect(normalizeItemName('MILK (2%)')).toBe('milk 2');
  });

  test('levenshteinDistance matches known example', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  test('rankAndFilterPurchases filters to relevant matches', () => {
    const purchases: ReceiptItemPurchase[] = [
      makePurchase({ id: '1', name: 'Organic Bananas', merchantName: 'Walmart' }),
      makePurchase({ id: '2', name: 'Bananas', merchantName: 'Target' }),
      makePurchase({ id: '3', name: 'Whole Milk', merchantName: 'Walmart' }),
    ];

    const ranked = rankAndFilterPurchases(purchases, 'banana');
    expect(ranked.map((p) => p.id)).toEqual(['2', '1']);
  });

  test('applyFiltersAndSort filters by store and sorts by price asc', () => {
    const purchases: ReceiptItemPurchase[] = [
      makePurchase({ id: '1', name: 'Bananas', merchantName: 'Walmart', price: 2.79, date: '2026-01-10T10:15:00.000Z' }),
      makePurchase({ id: '2', name: 'Bananas', merchantName: 'Target', price: 2.49, date: '2026-01-12T16:45:00.000Z' }),
      makePurchase({ id: '3', name: 'Bananas', merchantName: 'Walmart', price: 3.29, date: '2026-01-15T14:30:00.000Z' }),
    ];

    const out = applyFiltersAndSort(purchases, {
      selectedStores: new Set(['Walmart']),
      sortField: 'price',
      sortOrder: 'asc',
    });

    expect(out.map((p) => p.id)).toEqual(['1', '3']);
  });

  test('calculatePriceComparison computes overall stats and bestStoreName', () => {
    const purchases: ReceiptItemPurchase[] = [
      makePurchase({ id: '1', name: 'Bananas', merchantName: 'Walmart', price: 2.49, date: '2026-01-15T14:30:00.000Z' }),
      makePurchase({ id: '2', name: 'Bananas', merchantName: 'Walmart', price: 2.79, date: '2026-01-10T10:15:00.000Z' }),
      makePurchase({ id: '3', name: 'Bananas', merchantName: 'Target', price: 2.89, date: '2026-01-12T16:45:00.000Z' }),
    ];

    const comparison = calculatePriceComparison(purchases, 'Bananas');
    expect(comparison).not.toBeNull();
    expect(comparison!.overall.totalPurchases).toBe(3);
    expect(comparison!.overall.minPrice).toBeCloseTo(2.49);
    expect(comparison!.overall.maxPrice).toBeCloseTo(2.89);
    expect(comparison!.bestStoreName).toBe('Walmart');

    const walmart = comparison!.byStore.get('Walmart');
    expect(walmart).toBeTruthy();
    expect(walmart!.count).toBe(2);
    expect(walmart!.lastPrice).toBeCloseTo(2.49);
  });

  test('getTopStores returns stores ordered by purchase count', () => {
    const purchases: ReceiptItemPurchase[] = [
      makePurchase({ id: '1', merchantName: 'Walmart' }),
      makePurchase({ id: '2', merchantName: 'Target' }),
      makePurchase({ id: '3', merchantName: 'Walmart' }),
    ];

    expect(getTopStores(purchases, 2)).toEqual(['Walmart', 'Target']);
  });

  test('groupPurchasesToResults groups by normalized name and computes stats', () => {
    const purchases: ReceiptItemPurchase[] = [
      makePurchase({ id: '1', name: 'Whole Milk', normalizedName: 'whole milk', merchantName: 'Store A', price: 3, ocrConfidencePct: 92 }),
      makePurchase({ id: '2', name: 'Whole Milk', normalizedName: 'whole milk', merchantName: 'Store A', price: 4, ocrConfidencePct: 88 }),
      makePurchase({ id: '3', name: 'Whole Milk', normalizedName: 'whole milk', merchantName: 'Store B', price: 2.5, ocrConfidencePct: 60 }),
    ];

    const results = groupPurchasesToResults(purchases);
    expect(results).toHaveLength(1);
    expect(results[0]!.priceStats.min).toBeCloseTo(2.5);
    expect(results[0]!.priceStats.max).toBeCloseTo(4);
    expect(results[0]!.priceStats.count).toBe(3);
    expect(results[0]!.accuracyPct).toBeCloseTo((92 + 88 + 60) / 3);
    expect(results[0]!.lowAccuracyCount).toBe(1);
    expect(results[0]!.storeComparison.length).toBe(2);
  });
});
