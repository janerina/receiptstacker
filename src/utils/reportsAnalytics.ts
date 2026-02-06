export type ReportsPeriod = 'Monthly' | 'Quarterly' | 'Yearly';

export interface CategoryData {
  name: string;
  amount: number;
  color: string;
  percentage?: number;
}

export interface MonthData {
  month: string;
  spending: number;
  receipts: number;
  categories: CategoryData[];
}

export interface ReportSummary {
  totalSpending: number;
  totalReceipts: number;
  avgSpending: number;
  topCategory: {
    name: string;
    percentage: number;
  };
  trend: {
    percentage: number;
    isPositive: boolean;
  };
  habits: {
    mostReceiptsLabel: string;
    mostReceiptsCount: number;
    highestSpendLabel: string;
    highestSpendAmount: number;
    peakDayLabel: string;
    peakDayAvg: number;
  };
}

export type ReceiptLike = {
  id?: string;
  merchant?: string;
  amount?: number;
  date?: Date | string;
  category?: string;
  categoryId?: string;
  categoryColor?: string;
};

const toDate = (value: Date | string | undefined): Date => {
  const d = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

const monthLabelShort = (d: Date) => {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d);
  } catch {
    return d.toLocaleDateString('en-US', { month: 'short' });
  }
};

const weekdayLabel = (weekday: number) => {
  const labels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return labels[clamp(weekday, 0, 6)];
};

export const getPeriodDescription = (period: ReportsPeriod): string => {
  switch (period) {
    case 'Monthly':
      return 'Last 7 months';
    case 'Quarterly':
      return 'Last 4 quarters';
    case 'Yearly':
      return 'Last 3 years';
    default:
      return 'Last 7 months';
  }
};

export const getPeriodUnit = (period: ReportsPeriod): string => {
  switch (period) {
    case 'Monthly':
      return 'month';
    case 'Quarterly':
      return 'quarter';
    case 'Yearly':
      return 'year';
    default:
      return 'month';
  }
};

export const calculateSummary = (data: MonthData[]): ReportSummary => {
  const totalSpending = data.reduce((sumSpend, item) => sumSpend + (Number.isFinite(item.spending) ? item.spending : 0), 0);
  const totalReceipts = data.reduce((sumReceipts, item) => sumReceipts + (Number.isFinite(item.receipts) ? item.receipts : 0), 0);
  const avgSpending = data.length > 0 ? totalSpending / data.length : 0;

  const lastValue = data[data.length - 1]?.spending ?? 0;
  const previousValue = data[data.length - 2]?.spending ?? 0;
  const trendRaw = previousValue ? ((lastValue - previousValue) / previousValue) * 100 : 0;

  const lastCategories = data[data.length - 1]?.categories ?? [];
  const top = lastCategories.reduce(
    (max, c) => (c.amount > max.amount ? c : max),
    lastCategories[0] ?? { name: 'N/A', amount: 0, color: '#3B82F6' },
  );
  const topPct = lastValue > 0 ? (top.amount / lastValue) * 100 : 0;

  // Habits: computed from the bucket labels + spending/receipts.
  const mostReceipts = data.reduce(
    (max, d) => (d.receipts > max.receipts ? d : max),
    data[0] ?? { month: 'N/A', receipts: 0, spending: 0, categories: [] },
  );
  const highestSpend = data.reduce(
    (max, d) => (d.spending > max.spending ? d : max),
    data[0] ?? { month: 'N/A', receipts: 0, spending: 0, categories: [] },
  );

  // Peak day is only meaningful with receipt-level data. We approximate using the last bucket’s category split.
  // This value is overwritten by buildReportDataFromReceipts when real receipts exist.
  const peakDayLabel = 'Fridays';
  const peakDayAvg = data.length > 0 ? totalSpending / (data.length * 4) : 0;

  return {
    totalSpending,
    totalReceipts,
    avgSpending,
    topCategory: {
      name: top.name,
      percentage: topPct,
    },
    trend: {
      percentage: Math.abs(trendRaw),
      isPositive: trendRaw > 0,
    },
    habits: {
      mostReceiptsLabel: mostReceipts.month,
      mostReceiptsCount: mostReceipts.receipts,
      highestSpendLabel: highestSpend.month,
      highestSpendAmount: highestSpend.spending,
      peakDayLabel,
      peakDayAvg,
    },
  };
};

const COLORS = {
  blue: '#3B82F6',
  green: '#22C55E',
  orange: '#F97316',
  purple: '#A855F7',
  pink: '#EC4899',
};

const bucketMonthly = (now: Date, months: number): Array<{ label: string; start: Date; end: Date }> => {
  const buckets: Array<{ label: string; start: Date; end: Date }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = endOfDay(i === 0 ? now : new Date(d.getFullYear(), d.getMonth() + 1, 0));
    buckets.push({ label: monthLabelShort(d), start, end });
  }
  return buckets;
};

const bucketQuarterly = (now: Date, quarters: number): Array<{ label: string; start: Date; end: Date }> => {
  const buckets: Array<{ label: string; start: Date; end: Date }> = [];
  const currentQuarter = Math.floor(now.getMonth() / 3);

  for (let i = quarters - 1; i >= 0; i--) {
    const qOffset = currentQuarter - i;
    const year = now.getFullYear() + Math.floor(qOffset / 4);
    const q = ((qOffset % 4) + 4) % 4;
    const start = new Date(year, q * 3, 1);
    const end = endOfDay(i === 0 ? now : new Date(year, q * 3 + 3, 0));
    buckets.push({ label: `Q${q + 1} ${year}`, start, end });
  }

  return buckets;
};

const bucketYearly = (now: Date, years: number): Array<{ label: string; start: Date; end: Date }> => {
  const buckets: Array<{ label: string; start: Date; end: Date }> = [];
  for (let i = years - 1; i >= 0; i--) {
    const year = now.getFullYear() - i;
    const start = new Date(year, 0, 1);
    const end = endOfDay(i === 0 ? now : new Date(year, 11, 31));
    buckets.push({ label: `${year}`, start, end });
  }
  return buckets;
};

const inRange = (r: ReceiptLike, start: Date, end: Date) => {
  const t = toDate(r.date).getTime();
  return t >= start.getTime() && t <= end.getTime();
};

const normalizeAmount = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0);

const categoryKey = (r: ReceiptLike) => (r.categoryId || r.category || 'Misc').trim() || 'Misc';

const categoryName = (r: ReceiptLike) => (r.category || r.categoryId || 'Misc').trim() || 'Misc';

const categoryColor = (r: ReceiptLike) => {
  const explicit = (r.categoryColor ?? '').trim();
  if (explicit) return explicit;
  const id = (r.categoryId ?? '').toLowerCase();
  if (id.includes('grocer')) return COLORS.blue;
  if (id.includes('trans')) return COLORS.green;
  if (id.includes('dining') || id.includes('food')) return COLORS.orange;
  if (id.includes('shop')) return COLORS.purple;
  if (id.includes('entertain')) return COLORS.pink;
  return COLORS.blue;
};

const buildCategoriesForBucket = (bucketReceipts: ReceiptLike[], bucketSpend: number): CategoryData[] => {
  const by = new Map<string, { name: string; amount: number; color: string }>();
  bucketReceipts.forEach(r => {
    const key = categoryKey(r);
    const existing = by.get(key);
    const amount = normalizeAmount(r.amount);
    const next = {
      name: categoryName(r),
      amount: (existing?.amount ?? 0) + amount,
      color: existing?.color ?? categoryColor(r),
    };
    by.set(key, next);
  });

  const list = Array.from(by.values()).sort((a, b) => b.amount - a.amount);
  return list.map(c => ({ ...c, percentage: bucketSpend > 0 ? (c.amount / bucketSpend) * 100 : 0 }));
};

export const buildReportDataFromReceipts = (period: ReportsPeriod, receipts: ReceiptLike[], now: Date): MonthData[] => {
  const buckets =
    period === 'Monthly'
      ? bucketMonthly(now, 7)
      : period === 'Quarterly'
        ? bucketQuarterly(now, 4)
        : bucketYearly(now, 3);

  const rows: MonthData[] = buckets.map(b => {
    const bucketReceipts = receipts.filter(r => inRange(r, b.start, b.end));
    const spending = bucketReceipts.reduce((s, r) => s + normalizeAmount(r.amount), 0);
    const receiptCount = bucketReceipts.length;

    return {
      month: b.label,
      spending,
      receipts: receiptCount,
      categories: [],
    };
  });

  // Attach categories to the latest bucket so the UI has the "Category Breakdown".
  const lastIdx = rows.length - 1;
  if (lastIdx >= 0) {
    const b = buckets[lastIdx];
    const bucketReceipts = receipts.filter(r => inRange(r, b.start, b.end));
    rows[lastIdx] = {
      ...rows[lastIdx],
      categories: buildCategoriesForBucket(bucketReceipts, rows[lastIdx].spending).slice(0, 8),
    };
  }

  // Patch habits: compute peak spending day from the full receipt list in range.
  const allInWindow = receipts.filter(r => {
    const first = buckets[0];
    const last = buckets[buckets.length - 1];
    return inRange(r, first.start, last.end);
  });

  const byDay = new Map<number, number[]>();
  allInWindow.forEach(r => {
    const d = toDate(r.date);
    const day = d.getDay();
    const arr = byDay.get(day) ?? [];
    arr.push(normalizeAmount(r.amount));
    byDay.set(day, arr);
  });

  const dayAverages = Array.from(byDay.entries()).map(([day, amounts]) => ({ day, avg: sum(amounts) / Math.max(1, amounts.length) }));
  const peak = dayAverages.reduce((max, x) => (x.avg > max.avg ? x : max), dayAverages[0] ?? { day: 5, avg: 0 });

  const summary = calculateSummary(rows);
  summary.habits.peakDayLabel = `${weekdayLabel(peak.day)}s`;
  summary.habits.peakDayAvg = peak.avg;

  // Ensure category percentages exist for insight bullets.
  const lastCats = rows[lastIdx]?.categories ?? [];
  const lastSpend = rows[lastIdx]?.spending ?? 0;
  rows[lastIdx] = {
    ...rows[lastIdx],
    categories: lastCats.map(c => ({ ...c, percentage: lastSpend > 0 ? (c.amount / lastSpend) * 100 : 0 })),
  };

  return rows;
};
