/**
 * Tests for the unified item search service.
 *
 * Covers:
 *  - Multiple receipt types (manual + scanned via receipt_items, misc spend)
 *  - Mixed receipt types in a single search
 *  - Items with similar names
 *  - Case-insensitive matching
 *  - Empty / no-match scenarios
 */

import { searchItemsAcrossReceipts, type UnifiedSearchResult } from '@/services/itemSearchService';
import { searchReceiptItemPurchases, type ItemSearchPurchaseRow } from '@/services/database';
import { listMiscExpenses, type MiscExpense } from '@/utils/miscSpendStore';

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/services/database', () => ({
  searchReceiptItemPurchases: jest.fn(),
}));

jest.mock('@/utils/miscSpendStore', () => ({
  listMiscExpenses: jest.fn(),
}));

const mockDbSearch = searchReceiptItemPurchases as jest.MockedFunction<typeof searchReceiptItemPurchases>;
const mockListMisc = listMiscExpenses as jest.MockedFunction<typeof listMiscExpenses>;

// ── Helpers ────────────────────────────────────────────────────────────────

const makeRow = (overrides: Partial<ItemSearchPurchaseRow>): ItemSearchPurchaseRow => ({
  itemId: overrides.itemId ?? 'item-1',
  receiptId: overrides.receiptId ?? 'r-1',
  itemName: overrides.itemName ?? 'Banana',
  itemNameNormalized: overrides.itemNameNormalized ?? 'banana',
  totalPrice: overrides.totalPrice ?? 1.29,
  quantity: overrides.quantity ?? 1,
  unitPrice: overrides.unitPrice ?? 1.29,
  merchant: overrides.merchant ?? 'Walmart',
  date: overrides.date ?? '2026-01-15T14:30:00.000Z',
  categoryId: overrides.categoryId ?? 'cat-1',
  imageUri: overrides.imageUri,
  ocrEngine: overrides.ocrEngine,
  ocrConfidence: overrides.ocrConfidence,
  hasEditedOcr: overrides.hasEditedOcr ?? 0,
});

const makeMisc = (overrides: Partial<MiscExpense>): MiscExpense => ({
  id: overrides.id ?? 'misc-1',
  amount: overrides.amount ?? 5.0,
  description: overrides.description ?? 'Banana smoothie',
  categoryId: overrides.categoryId ?? 'food',
  categoryName: overrides.categoryName ?? 'Food & Drink',
  date: overrides.date ?? '2026-01-20T09:00:00.000Z',
});

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockDbSearch.mockReset();
  mockListMisc.mockReset();
  mockDbSearch.mockResolvedValue([]);
  mockListMisc.mockResolvedValue([]);
});

describe('searchItemsAcrossReceipts', () => {
  test('returns empty array for empty search term', async () => {
    const results = await searchItemsAcrossReceipts('');
    expect(results).toEqual([]);
    expect(mockDbSearch).not.toHaveBeenCalled();
  });

  test('returns empty array for whitespace-only search term', async () => {
    const results = await searchItemsAcrossReceipts('   ');
    expect(results).toEqual([]);
  });

  test('returns manual receipt items (scan_mode null → no ocrEngine)', async () => {
    mockDbSearch.mockResolvedValue([
      makeRow({
        itemId: 'mi-1',
        receiptId: 'r-manual-1',
        itemName: 'Banana',
        merchant: 'Corner Shop',
        unitPrice: 0.89,
        totalPrice: 0.89,
        ocrEngine: null,
      }),
    ]);

    const results = await searchItemsAcrossReceipts('banana');

    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe('manual');
    expect(results[0]!.storeName).toBe('Corner Shop');
    expect(results[0]!.itemPrice).toBeCloseTo(0.89);
    expect(results[0]!.receiptId).toBe('r-manual-1');
  });

  test('returns scanned receipt items (ocrEngine present)', async () => {
    mockDbSearch.mockResolvedValue([
      makeRow({
        itemId: 'si-1',
        receiptId: 'r-scanned-1',
        itemName: 'Organic Bananas',
        merchant: 'Walmart',
        unitPrice: 2.49,
        totalPrice: 2.49,
        ocrEngine: 'mlkit',
        ocrConfidence: 0.92,
      }),
    ]);

    const results = await searchItemsAcrossReceipts('banana');

    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe('scanned');
    expect(results[0]!.itemName).toBe('Organic Bananas');
    expect(results[0]!.receiptId).toBe('r-scanned-1');
  });

  test('returns misc spend entries matching partial term', async () => {
    mockListMisc.mockResolvedValue([
      makeMisc({
        id: 'misc-ban',
        description: 'Banana smoothie at gym',
        amount: 6.5,
        categoryName: 'Snacks',
      }),
      makeMisc({
        id: 'misc-coffee',
        description: 'Morning coffee',
        amount: 4.0,
      }),
    ]);

    const results = await searchItemsAcrossReceipts('banana');

    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe('misc');
    expect(results[0]!.storeName).toBe('Snacks');
    expect(results[0]!.itemPrice).toBeCloseTo(6.5);
    expect(results[0]!.receiptId).toBeUndefined();
  });

  test('aggregates results from all three sources', async () => {
    mockDbSearch.mockResolvedValue([
      makeRow({
        itemId: 'ri-1',
        receiptId: 'r1',
        itemName: 'Banana',
        merchant: 'Walmart',
        unitPrice: 1.29,
        ocrEngine: 'mlkit',
        date: '2026-01-10T10:00:00.000Z',
      }),
      makeRow({
        itemId: 'ri-2',
        receiptId: 'r2',
        itemName: 'Banana Bread',
        merchant: 'Bakery',
        unitPrice: 3.99,
        ocrEngine: null,
        date: '2026-01-12T14:00:00.000Z',
      }),
    ]);
    mockListMisc.mockResolvedValue([
      makeMisc({
        id: 'm1',
        description: 'Banana cake',
        amount: 12.0,
        date: '2026-01-20T09:00:00.000Z',
      }),
    ]);

    const results = await searchItemsAcrossReceipts('banana');

    expect(results).toHaveLength(3);
    // Default sort is newest first.
    expect(results[0]!.id).toBe('m1');       // Jan 20
    expect(results[1]!.id).toBe('ri-2');     // Jan 12
    expect(results[2]!.id).toBe('ri-1');     // Jan 10

    const sources = results.map((r) => r.source).sort();
    expect(sources).toEqual(['manual', 'misc', 'scanned']);
  });

  test('is case-insensitive ("ban" matches "BANANA")', async () => {
    mockDbSearch.mockResolvedValue([
      makeRow({ itemId: 'a', itemName: 'BANANA', itemNameNormalized: 'banana' }),
    ]);
    mockListMisc.mockResolvedValue([
      makeMisc({ id: 'b', description: 'BaNaNa Chips' }),
    ]);

    const results = await searchItemsAcrossReceipts('BAN');

    expect(results.length).toBeGreaterThanOrEqual(1);
    // DB mock returned one row; misc "banana chips" also matches.
    expect(results).toHaveLength(2);
  });

  test('handles items with similar names across sources', async () => {
    mockDbSearch.mockResolvedValue([
      makeRow({ itemId: '1', itemName: 'Whole Milk', unitPrice: 3.49 }),
      makeRow({ itemId: '2', itemName: 'Whole Milk 2%', unitPrice: 3.29 }),
      makeRow({ itemId: '3', itemName: 'Skim Milk', unitPrice: 2.99 }),
    ]);
    mockListMisc.mockResolvedValue([
      makeMisc({ id: 'misc-milk', description: 'Milk delivery', amount: 8.0 }),
    ]);

    const results = await searchItemsAcrossReceipts('milk');

    // All four should appear.
    expect(results).toHaveLength(4);
  });

  test('items with different casing are all returned', async () => {
    mockDbSearch.mockResolvedValue([
      makeRow({ itemId: '1', itemName: 'banana', itemNameNormalized: 'banana' }),
      makeRow({ itemId: '2', itemName: 'BANANA', itemNameNormalized: 'banana' }),
      makeRow({ itemId: '3', itemName: 'Banana', itemNameNormalized: 'banana' }),
    ]);

    const results = await searchItemsAcrossReceipts('banana');
    expect(results).toHaveLength(3);
  });

  test('each result row has required columns', async () => {
    mockDbSearch.mockResolvedValue([
      makeRow({
        itemId: 'check-1',
        receiptId: 'r-check',
        itemName: 'Test Item',
        merchant: 'Test Store',
        unitPrice: 9.99,
        date: '2026-02-01T12:00:00.000Z',
      }),
    ]);

    const results = await searchItemsAcrossReceipts('test');
    const row = results[0]!;

    // All required columns per spec.
    expect(row).toHaveProperty('timestamp');
    expect(row).toHaveProperty('storeName');
    expect(row).toHaveProperty('itemName');
    expect(row).toHaveProperty('itemPrice');
    expect(typeof row.timestamp).toBe('string');
    expect(typeof row.storeName).toBe('string');
    expect(typeof row.itemName).toBe('string');
    expect(typeof row.itemPrice).toBe('number');
  });

  test('no results returns empty array (not undefined/null)', async () => {
    mockDbSearch.mockResolvedValue([]);
    mockListMisc.mockResolvedValue([]);

    const results = await searchItemsAcrossReceipts('zzzznonexistent');
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  test('does not break when misc spend list returns empty', async () => {
    mockDbSearch.mockResolvedValue([
      makeRow({ itemId: 'x', itemName: 'Apple' }),
    ]);
    mockListMisc.mockResolvedValue([]);

    const results = await searchItemsAcrossReceipts('apple');
    expect(results).toHaveLength(1);
    expect(results[0]!.source).not.toBe('misc');
  });

  test('does not break when DB returns empty', async () => {
    mockDbSearch.mockResolvedValue([]);
    mockListMisc.mockResolvedValue([
      makeMisc({ id: 'misc-a', description: 'Apple pie' }),
    ]);

    const results = await searchItemsAcrossReceipts('apple');
    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe('misc');
  });

  test('misc spend with missing categoryName uses "Misc" as storeName', async () => {
    mockListMisc.mockResolvedValue([
      { id: 'bare', amount: 1, description: 'banana', categoryId: 'x', categoryName: '', date: '2026-01-01T00:00:00.000Z' },
    ]);

    const results = await searchItemsAcrossReceipts('banana');
    expect(results[0]!.storeName).toBe('Misc');
  });
});
