import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Receipt } from '@/screens/main/ReceiptDetailScreen';

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
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return { receipts: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return { receipts: Array.isArray(parsed.receipts) ? (parsed.receipts as StoredReceipt[]) : [] };
  } catch {
    return { receipts: [] };
  }
};

const writeState = async (state: StoredState): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
