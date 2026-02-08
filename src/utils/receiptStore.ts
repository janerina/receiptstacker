import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Receipt } from '@/screens/main/ReceiptDetailScreen';
import { getUserScopedKeyForActiveUser } from '@/utils/userScopedStorage';

const STORAGE_KEY = 'receiptstacker.receipts' as const;

type StoredReceipt = Omit<Receipt, 'date'> & { date: string };

type StoredState = {
  receipts: StoredReceipt[];
};

const toStored = (r: Receipt): StoredReceipt => ({
  ...r,
  date: r.date instanceof Date ? r.date.toISOString() : new Date(r.date).toISOString(),
});

const fromStored = (r: StoredReceipt): Receipt => ({
  ...r,
  date: r.date,
});

const readState = async (): Promise<StoredState> => {
  const scopedKey = await getUserScopedKeyForActiveUser(STORAGE_KEY);
  if (!scopedKey) return { receipts: [] };

  const raw = await AsyncStorage.getItem(scopedKey);
  if (!raw) return { receipts: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    const receipts = Array.isArray(parsed.receipts) ? (parsed.receipts as StoredReceipt[]) : [];

    // Legacy cleanup: a previous ReceiptDetail fallback inserted a hard-coded mock receipt.
    // Remove only the exact signature to avoid deleting real user data.
    const cleaned = receipts.filter((r) => {
      if (!r) return false;
      const merchant = String((r as any).merchant ?? '');
      const amount = Number((r as any).amount);
      const notes = String((r as any).notes ?? '');
      const categoryId = String((r as any).categoryId ?? '');

      const isKnownMock =
        merchant === 'Starbucks Coffee' &&
        amount === 15.5 &&
        notes === 'Morning coffee meeting with client' &&
        categoryId === 'food';

      return !isKnownMock;
    });

    if (cleaned.length !== receipts.length) {
      // Best-effort: persist cleanup.
      await writeState({ receipts: cleaned });
    }

    return { receipts: cleaned };
  } catch {
    return { receipts: [] };
  }
};

const writeState = async (state: StoredState): Promise<void> => {
  const scopedKey = await getUserScopedKeyForActiveUser(STORAGE_KEY);
  if (!scopedKey) return;
  await AsyncStorage.setItem(scopedKey, JSON.stringify(state));
};

export const getReceiptById = async (id: string): Promise<Receipt | null> => {
  const state = await readState();
  const found = state.receipts.find(r => r.id === id);
  return found ? fromStored(found) : null;
};

export const upsertReceipt = async (receipt: Receipt): Promise<void> => {
  const state = await readState();
  const stored = toStored(receipt);

  const idx = state.receipts.findIndex(r => r.id === receipt.id);
  if (idx >= 0) {
    state.receipts[idx] = stored;
  } else {
    state.receipts.unshift(stored);
  }

  await writeState(state);
};

export const deleteReceiptById = async (id: string): Promise<void> => {
  const state = await readState();
  const next = state.receipts.filter(r => r.id !== id);
  await writeState({ receipts: next });
};

export const listReceipts = async (): Promise<Receipt[]> => {
  const state = await readState();
  return state.receipts.map(fromStored);
};
