import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { deleteReceiptById, listReceipts, upsertReceipt } from '@/utils/receiptStore';
import { useAuth } from '@/contexts/AuthContext';

export interface Receipt {
  id: string;
  merchant: string;
  amount: number;
  date: Date | string;
  category: string;
  categoryId: string;
  categoryColor: string;
  tags?: string[];
  paymentMethod?: string;
  notes?: string;
  imageUri?: string;
}

export interface ReceiptsState {
  receipts: Receipt[];
  isLoading: boolean;
  error: string | null;
}

export interface ReceiptContextValue extends ReceiptsState {
  loadReceipts: () => Promise<void>;
  getReceiptById: (id: string) => Receipt | undefined;
  addReceipt: (receipt: Omit<Receipt, 'id'>) => Promise<void>;
  updateReceipt: (id: string, receipt: Partial<Receipt>) => Promise<void>;
  deleteReceipt: (id: string) => Promise<void>;
  getReceiptsByCategory: (categoryId: string) => Receipt[];
  getReceiptsByDateRange: (start: Date, end: Date) => Receipt[];
  clearError: () => void;
}

export const ReceiptContext = createContext<ReceiptContextValue | undefined>(undefined);

export interface ReceiptProviderProps {
  children: React.ReactNode;
}

const toDate = (value: Date | string): Date => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
};

const makeId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

export const ReceiptProvider = ({ children }: ReceiptProviderProps) => {
  const { user, isAuthenticated } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReceipts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listReceipts();
      // Ensure stable ordering (newest first).
      const sorted = [...data].sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
      setReceipts(sorted);
    } catch (e) {
      setReceipts([]);
      setError(e instanceof Error ? e.message : 'Failed to load receipts');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await loadReceipts();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [loadReceipts]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setReceipts([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    void loadReceipts();
  }, [isAuthenticated, loadReceipts, user?.id]);

  const getReceiptByIdLocal = useCallback(
    (id: string) => receipts.find((r) => r.id === id),
    [receipts],
  );

  const addReceipt = useCallback(async (receipt: Omit<Receipt, 'id'>) => {
    setError(null);

    const next: Receipt = { ...receipt, id: makeId() };
    const prev = receipts;

    // Optimistic UI update.
    setReceipts([next, ...prev]);
    try {
      await upsertReceipt(next as any);
    } catch (e) {
      setReceipts(prev);
      setError(e instanceof Error ? e.message : 'Failed to add receipt');
      throw e;
    }
  }, [receipts]);

  const updateReceipt = useCallback(async (id: string, patch: Partial<Receipt>) => {
    setError(null);
    const prev = receipts;
    const idx = prev.findIndex((r) => r.id === id);
    if (idx < 0) return;

    const updated: Receipt = { ...prev[idx], ...patch, id };
    const next = [...prev];
    next[idx] = updated;
    // Keep order by date.
    next.sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());

    setReceipts(next);
    try {
      await upsertReceipt(updated as any);
    } catch (e) {
      setReceipts(prev);
      setError(e instanceof Error ? e.message : 'Failed to update receipt');
      throw e;
    }
  }, [receipts]);

  const deleteReceipt = useCallback(async (id: string) => {
    setError(null);
    const prev = receipts;
    const next = prev.filter((r) => r.id !== id);
    setReceipts(next);
    try {
      await deleteReceiptById(id);
    } catch (e) {
      setReceipts(prev);
      setError(e instanceof Error ? e.message : 'Failed to delete receipt');
      throw e;
    }
  }, [receipts]);

  const getReceiptsByCategory = useCallback(
    (categoryId: string) => receipts.filter((r) => r.categoryId === categoryId),
    [receipts],
  );

  const getReceiptsByDateRange = useCallback(
    (start: Date, end: Date) => {
      const startMs = start.getTime();
      const endMs = end.getTime();
      return receipts.filter((r) => {
        const d = toDate(r.date).getTime();
        return d >= startMs && d <= endMs;
      });
    },
    [receipts],
  );

  const value = useMemo<ReceiptContextValue>(
    () => ({
      receipts,
      isLoading,
      error,
      loadReceipts,
      getReceiptById: getReceiptByIdLocal,
      addReceipt,
      updateReceipt,
      deleteReceipt,
      getReceiptsByCategory,
      getReceiptsByDateRange,
      clearError: () => setError(null),
    }),
    [
      receipts,
      isLoading,
      error,
      loadReceipts,
      getReceiptByIdLocal,
      addReceipt,
      updateReceipt,
      deleteReceipt,
      getReceiptsByCategory,
      getReceiptsByDateRange,
    ],
  );

  return <ReceiptContext.Provider value={value}>{children}</ReceiptContext.Provider>;
};

export const useReceipts = (): ReceiptContextValue => {
  const ctx = React.useContext(ReceiptContext);
  if (!ctx) throw new Error('useReceipts must be used within a ReceiptProvider');
  return ctx;
};
