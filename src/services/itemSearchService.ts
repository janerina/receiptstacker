import { searchReceiptItemPurchases } from '@/services/database';
import { listMiscExpenses } from '@/utils/miscSpendStore';
import { normalizeItemName } from '@/utils/itemSearch';

export type UnifiedSearchSource = 'manual' | 'scanned' | 'misc';

export type UnifiedSearchResult = {
	id: string;
	source: UnifiedSearchSource;
	timestamp: string; // ISO
	storeName: string;
	itemName: string;
	itemPrice: number;
	receiptId?: string;
};

const safeTime = (iso: string): number => {
	const t = new Date(iso).getTime();
	return Number.isNaN(t) ? 0 : t;
};

const priceFromRow = (row: { unitPrice: number; totalPrice: number; quantity: number }): number => {
	const qty = typeof row.quantity === 'number' && Number.isFinite(row.quantity) && row.quantity > 0 ? row.quantity : 1;
	const unit = typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice) ? row.unitPrice : NaN;
	const total = typeof row.totalPrice === 'number' && Number.isFinite(row.totalPrice) ? row.totalPrice : 0;
	const price = Number.isFinite(unit) && unit > 0 ? unit : total / qty;
	return Number.isFinite(price) ? price : 0;
};

/**
 * Global item-level search across:
 * - Manual receipts (receipt_items rows with no OCR engine)
 * - Scanned receipts (receipt_items rows with OCR engine)
 * - Misc spend entries (AsyncStorage)
 */
export const searchItemsAcrossReceipts = async (searchTerm: string, limit = 250): Promise<UnifiedSearchResult[]> => {
	const q = (searchTerm ?? '').trim();
	if (!q) return [];

	const qNorm = normalizeItemName(q);
	if (!qNorm) return [];

	const [dbRows, misc] = await Promise.all([
		(async () => {
			try {
				return await searchReceiptItemPurchases(q, limit);
			} catch {
				return [];
			}
		})(),
		(async () => {
			try {
				return await listMiscExpenses();
			} catch {
				return [];
			}
		})(),
	]);

	const fromReceipts: UnifiedSearchResult[] = dbRows.map((r) => {
		const source: UnifiedSearchSource = r.ocrEngine ? 'scanned' : 'manual';
		return {
			id: r.itemId,
			source,
			timestamp: r.date,
			storeName: r.merchant || 'Unknown',
			itemName: r.itemName || '',
			itemPrice: priceFromRow({ unitPrice: r.unitPrice, totalPrice: r.totalPrice, quantity: r.quantity }),
			receiptId: r.receiptId,
		};
	});

	const fromMisc: UnifiedSearchResult[] = (misc ?? [])
		.filter((e) => {
			const descNorm = normalizeItemName(e.description ?? '');
			return descNorm.includes(qNorm);
		})
		.map((e) => {
			const amount = typeof e.amount === 'number' && Number.isFinite(e.amount) ? e.amount : 0;
			return {
				id: e.id,
				source: 'misc',
				timestamp: e.date,
				storeName: (e.categoryName || 'Misc').trim() || 'Misc',
				itemName: e.description || '',
				itemPrice: amount,
			};
		});

	const merged = [...fromReceipts, ...fromMisc];
	merged.sort((a, b) => safeTime(b.timestamp) - safeTime(a.timestamp));
	return merged;
};

