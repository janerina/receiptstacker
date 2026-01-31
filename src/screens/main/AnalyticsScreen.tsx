import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';

import { Button, Card } from '@/components/common';
import { GuidedTourModal, type GuidedTourStep } from '@/components/tour';
import { LoadingOverlay } from '@/components/compositions';
import { DatePickerModal } from '@/components/modals/DatePickerModal';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { BottomTabParamList, MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { clearTourStage, getTourStage, isTourCompleted, saveTourCompleted, setTourStage } from '@/services/storage';
import { abbreviateNumber, formatCurrency } from '@/utils/format';
import { listReceipts } from '@/utils/receiptStore';

type Props = CompositeScreenProps<
  BottomTabScreenProps<BottomTabParamList, 'Analytics'>,
  NativeStackScreenProps<MainStackParamList, 'BottomTabs'>
>;

type Period = 'week' | 'month' | 'quarter' | 'year' | 'custom';

type InsightsView = 'monthly' | 'weekly' | 'custom';
type MonthlyPreset = 'this' | 'last';

type ActiveCustomField = 'start' | 'end' | null;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

interface Receipt {
  id: string;
  merchant: string;
  amount: number;
  date: Date | string;
  category: string;
  categoryColor: string;
}

interface CategoryBreakdown {
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

interface Merchant {
  name: string;
  amount: number;
}

type AnalyticsState = {
  total: number;
  previousTotal: number;
  change: number;
  lineChartData: { labels: string[]; datasets: Array<{ data: number[] }> };
  pieChartData: Array<{
    name: string;
    population: number;
    color: string;
    legendFontColor: string;
    legendFontSize: number;
  }>;
  categoryBreakdown: CategoryBreakdown[];
  topMerchants: Merchant[];
};

const screenWidth = Dimensions.get('window').width;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const toDate = (value: Date | string): Date => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const ensureFileUri = (pathOrUri: string) => (pathOrUri.startsWith('file://') ? pathOrUri : `file://${pathOrUri}`);

const escapeCsv = (value: unknown) => {
  const raw = value == null ? '' : String(value);
  const needsQuotes = /[\n\r,\"]/.test(raw);
  const escaped = raw.replaceAll('"', '""');
  return needsQuotes ? `"${escaped}"` : escaped;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

const endOfMonth = (d: Date) => endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));

const addMonths = (d: Date, months: number) => new Date(d.getFullYear(), d.getMonth() + months, d.getDate());

const startOfWeekMonday = (d: Date) => {
  const day = d.getDay();
  // JS: 0=Sun,1=Mon,...6=Sat
  const delta = day === 0 ? -6 : 1 - day;
  return startOfDay(addDays(d, delta));
};

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

const sameDayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}`;

const monthLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });

const dayLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const getPeriodRange = (period: Period, custom: { start: Date; end: Date } | null) => {
  const now = new Date();
  const end = period === 'custom' && custom ? custom.end : now;

  let start: Date;

  switch (period) {
    case 'week':
      start = addDays(now, -6);
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1);
      break;
    }
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'custom':
    default:
      start = custom ? custom.start : new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  return { start: startOfDay(start), end: endOfDay(end) };
};

const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const filterByRange = (all: Receipt[], range: { start: Date; end: Date }) => {
  const s = range.start.getTime();
  const e = range.end.getTime();
  return all.filter(r => {
    const t = toDate(r.date).getTime();
    return t >= s && t <= e;
  });
};

const shiftRangeBack = (range: { start: Date; end: Date }) => {
  const lenDays = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  const prevEnd = addDays(range.start, -1);
  const prevStart = addDays(prevEnd, -(lenDays - 1));
  return { start: startOfDay(prevStart), end: endOfDay(prevEnd) };
};

const getInsightsRange = (
  view: InsightsView,
  monthlyPreset: MonthlyPreset,
  custom: { start: Date; end: Date } | null,
  anchorDate: Date,
) => {
  const now = new Date();
  const anchor = anchorDate;

  if (view === 'weekly') {
    const start = startOfWeekMonday(anchor);
    const end = addDays(start, 6);
    return { start: startOfDay(start), end: endOfDay(end) };
  }

  if (view === 'custom') {
    const start = custom?.start ?? addDays(now, -29);
    const end = custom?.end ?? now;
    return { start: startOfDay(start), end: endOfDay(end) };
  }

  // Monthly
  if (monthlyPreset === 'last') {
    const lastMonth = addMonths(anchor, -1);
    const start = startOfMonth(lastMonth);
    const end = endOfMonth(lastMonth);
    return { start: startOfDay(start), end };
  }

  const start = startOfMonth(anchor);
  const isCurrentMonth = anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth();
  const end = isCurrentMonth ? endOfDay(now) : endOfMonth(anchor);
  return { start: startOfDay(start), end };
};

const getPreviousInsightsRange = (
  view: InsightsView,
  monthlyPreset: MonthlyPreset,
  currentRange: { start: Date; end: Date },
  anchorDate: Date,
) => {
  const now = new Date();
  const anchor = anchorDate;

  if (view === 'monthly' && monthlyPreset === 'this') {
    const isCurrentMonth = anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth();
    const prevMonth = addMonths(anchor, -1);

    if (isCurrentMonth) {
      // Month-to-date vs same day-of-month in previous month.
      const prevStart = startOfMonth(prevMonth);
      const dayOfMonth = now.getDate();

      // If previous month is shorter (e.g. Mar 31 -> Feb), clamp to end-of-month.
      const prevEndCandidate = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), dayOfMonth);
      const prevEnd =
        prevEndCandidate.getMonth() === prevMonth.getMonth()
          ? prevEndCandidate
          : new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0);

      return { start: startOfDay(prevStart), end: endOfDay(prevEnd) };
    }

    // Past month selected: compare full month vs previous full month.
    const start = startOfMonth(prevMonth);
    const end = endOfMonth(prevMonth);
    return { start: startOfDay(start), end };
  }

  if (view === 'monthly' && monthlyPreset === 'last') {
    // Full previous month vs the month before it.
    const monthBefore = addMonths(currentRange.start, -1);
    const start = startOfMonth(monthBefore);
    const end = endOfMonth(monthBefore);
    return { start: startOfDay(start), end };
  }

  if (view === 'weekly') {
    // Compare full week against previous full week.
    const prevEnd = addDays(currentRange.start, -1);
    const prevStart = addDays(prevEnd, -6);
    return { start: startOfDay(prevStart), end: endOfDay(prevEnd) };
  }

  // Custom: shift back by same number of days.
  return shiftRangeBack(currentRange);
};

const generateLineChartData = (receipts: Receipt[], period: Period, range: { start: Date; end: Date }) => {
  const days = Math.round((range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  // For shorter ranges: daily. For longer: monthly buckets.
  const useDaily = period === 'week' || period === 'month' || (period === 'custom' && days <= 45);

  const map = new Map<string, number>();

  if (useDaily) {
    for (let i = 0; i < days; i += 1) {
      const d = addDays(range.start, i);
      map.set(sameDayKey(d), 0);
    }

    receipts.forEach(r => {
      const d = startOfDay(toDate(r.date));
      const key = sameDayKey(d);
      map.set(key, (map.get(key) ?? 0) + r.amount);
    });

    const entries = Array.from(map.entries())
      .map(([key, value]) => ({
        key,
        value,
        date: new Date(key.replace(/-(\d+)$/, '-$1')),
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const labels = entries.map(e => dayLabel(e.date));
    const data = entries.map(e => Number.isFinite(e.value) ? e.value : 0);

    // Downsample labels for readability.
    const maxLabels = 7;
    const step = Math.ceil(labels.length / maxLabels);
    const compactLabels = labels.map((l, idx) => (idx % step === 0 ? l : ''));

    return { labels: compactLabels, datasets: [{ data }] };
  }

  // Monthly buckets
  const monthMap = new Map<string, { date: Date; total: number }>();

  const startMonth = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  const endMonth = new Date(range.end.getFullYear(), range.end.getMonth(), 1);

  let cursor = startMonth;
  while (cursor.getTime() <= endMonth.getTime()) {
    monthMap.set(monthKey(cursor), { date: cursor, total: 0 });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  receipts.forEach(r => {
    const d = toDate(r.date);
    const k = monthKey(d);
    const prev = monthMap.get(k);
    if (prev) prev.total += r.amount;
  });

  const entries = Array.from(monthMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  return {
    labels: entries.map(e => monthLabel(e.date)),
    datasets: [{ data: entries.map(e => e.total) }],
  };
};

const defaultMockReceipts = (): Receipt[] => {
  const now = new Date();
  const merchants = ['Starbucks', 'Amazon', 'Shell Gas', 'Walmart', 'Target', 'Uber', 'Whole Foods'] as const;
  const categories = [
    { name: 'Food & Dining', color: COLORS.semantic.success },
    { name: 'Shopping', color: COLORS.brand.primary },
    { name: 'Transportation', color: COLORS.semantic.warning },
    { name: 'Health', color: COLORS.semantic.error },
  ] as const;

  const list: Receipt[] = [];
  for (let i = 0; i < 60; i += 1) {
    const day = addDays(now, -i);
    const merchant = merchants[i % merchants.length];
    const cat = categories[i % categories.length];
    list.push({
      id: `${i + 1}`,
      merchant,
      amount: Math.round((10 + (i % 9) * 7 + (i % 3) * 2.25) * 100) / 100,
      date: day,
      category: cat.name,
      categoryColor: cat.color,
    });
  }
  return list;
};

export const AnalyticsScreen = ({ navigation }: Props) => {
  const { colors, toggleTheme, isDark } = useTheme();
  const primary = COLORS.brand.primary;

  // --- Guided tour (staged flow) ---
  const [tourVisible, setTourVisible] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const tourSteps: GuidedTourStep[] = useMemo(
    () => [
      {
        key: 'analytics',
        title: 'Analytics & Insights',
        body: 'See spending trends, category breakdowns, and top merchants. Use this tab to spot patterns over time.',
      },
    ],
    [],
  );

  const cancelTour = useCallback(async () => {
    setTourVisible(false);
    setTourStep(0);
    try {
      await saveTourCompleted(true);
      await clearTourStage();
    } catch {
      // non-fatal
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const run = async () => {
        const [completed, stage] = await Promise.all([isTourCompleted(), getTourStage()]);
        if (!active) return;
        if (!completed && stage === 'analytics') {
          setTourStep(0);
          setTourVisible(true);
        }
      };
      run().catch(() => undefined);
      return () => {
        active = false;
      };
    }, []),
  );

  const handleTourNext = useCallback(() => {
    setTourVisible(false);
    setTourStep(0);
    setTourStage('calendar')
      .catch(() => undefined)
      .finally(() => {
        (navigation as any)?.navigate?.('Calendar');
      });
  }, [navigation]);

  const [view, setView] = useState<InsightsView>('monthly');
  const [monthlyPreset, setMonthlyPreset] = useState<MonthlyPreset>('this');
  const [customDateRange, setCustomDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);

  const [exportInfoVisible, setExportInfoVisible] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [customTempStart, setCustomTempStart] = useState<Date | null>(null);
  const [customTempEnd, setCustomTempEnd] = useState<Date | null>(null);
  const [activeCustomField, setActiveCustomField] = useState<ActiveCustomField>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [monthPanelOpen, setMonthPanelOpen] = useState(false);
  const [draftMonthIndex, setDraftMonthIndex] = useState<number>(() => new Date().getMonth());
  const [draftYear, setDraftYear] = useState<number>(() => new Date().getFullYear());
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);

  const [analytics, setAnalytics] = useState<AnalyticsState>({
    total: 0,
    previousTotal: 0,
    change: 0,
    lineChartData: { labels: [], datasets: [{ data: [] }] },
    pieChartData: [],
    categoryBreakdown: [],
    topMerchants: [],
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => createStyles({ colors, primary, isDark }), [colors, isDark, primary]);

  const anchorForRange = useMemo(() => {
    if (view === 'monthly') return selectedMonth;
    // Weekly should always reflect the current week.
    if (view === 'weekly') return new Date();
    return new Date();
  }, [selectedMonth, view]);

  const calculateAnalytics = useCallback(
    (filtered: Receipt[], previous: Receipt[], range: { start: Date; end: Date }, periodForChart: Period) => {
      const total = filtered.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0), 0);
      const prevTotal = previous.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0), 0);

      const change = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : total > 0 ? 100 : 0;

      const lineChartData = generateLineChartData(filtered, periodForChart, range);

      const categoryTotals = new Map<string, { total: number; color: string }>();
      filtered.forEach(r => {
        const existing = categoryTotals.get(r.category);
        if (!existing) {
          categoryTotals.set(r.category, { total: r.amount, color: r.categoryColor || primary });
        } else {
          existing.total += r.amount;
        }
      });

      const chartColors = COLORS.chart;
      const fallbackLegend = colors.textSecondary;

      const pieChartData = Array.from(categoryTotals.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, data], idx) => ({
          name,
          population: data.total,
          color: data.color || chartColors[idx % chartColors.length],
          legendFontColor: fallbackLegend,
          legendFontSize: 12,
        }));

      const categoryBreakdown: CategoryBreakdown[] = Array.from(categoryTotals.entries())
        .map(([name, data], idx) => ({
          name,
          amount: data.total,
          percentage: total > 0 ? Math.round((data.total / total) * 100) : 0,
          color: data.color || chartColors[idx % chartColors.length],
        }))
        .sort((a, b) => b.amount - a.amount);

      const merchantTotals = new Map<string, number>();
      filtered.forEach(r => {
        merchantTotals.set(r.merchant, (merchantTotals.get(r.merchant) ?? 0) + r.amount);
      });

      const topMerchants: Merchant[] = Array.from(merchantTotals.entries())
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      setAnalytics({
        total,
        previousTotal: prevTotal,
        change,
        lineChartData,
        pieChartData,
        categoryBreakdown,
        topMerchants,
      });
    },
    [colors.textSecondary, primary],
  );

  const loadReceipts = useCallback(async () => {
    try {
      setLoading(true);

      const stored = await listReceipts();
      const all: Receipt[] = stored.length
        ? stored.map(r => ({
            id: r.id,
            merchant: r.merchant,
            amount: r.amount,
            date: r.date,
            category: r.category,
            categoryColor: r.categoryColor,
          }))
        : defaultMockReceipts();

      const range = getInsightsRange(view, monthlyPreset, customDateRange, anchorForRange);
      const filtered = filterByRange(all, range);

      const prevRange = getPreviousInsightsRange(view, monthlyPreset, range, anchorForRange);
      const prevFiltered = filterByRange(all, prevRange);

      const periodForChart: Period = view === 'weekly' ? 'week' : view === 'custom' ? 'custom' : 'month';

      setReceipts(filtered);
      calculateAnalytics(filtered, prevFiltered, range, periodForChart);

      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    } catch (e) {
      console.error('Error loading receipts:', e);
      setReceipts([]);
      setAnalytics({
        total: 0,
        previousTotal: 0,
        change: 0,
        lineChartData: { labels: [], datasets: [{ data: [] }] },
        pieChartData: [],
        categoryBreakdown: [],
        topMerchants: [],
      });
    } finally {
      setLoading(false);
    }
  }, [anchorForRange, calculateAnalytics, customDateRange, fadeAnim, monthlyPreset, view]);

  useEffect(() => {
    loadReceipts().catch(() => undefined);
  }, [loadReceipts]);

  const formatInputDate = useCallback((d: Date | null) => {
    if (!d) return 'mm/dd/yyyy';
    return d.toLocaleDateString('en-US');
  }, []);

  const selectionKey: 'thisMonth' | 'lastMonth' | 'weekly' | 'custom' =
    view === 'weekly'
      ? 'weekly'
      : view === 'custom'
        ? 'custom'
        : monthlyPreset === 'last'
          ? 'lastMonth'
          : 'thisMonth';

  const applySelection = (key: typeof selectionKey) => {
    if (key === 'weekly') {
      setView('weekly');
      return;
    }
    if (key === 'custom') {
      setView('custom');
      // Keep the prior custom range if one exists; otherwise show placeholders until user picks.
      setCustomTempStart(customDateRange?.start ?? null);
      setCustomTempEnd(customDateRange?.end ?? null);
      return;
    }
    setView('monthly');
    setMonthlyPreset(key === 'lastMonth' ? 'last' : 'this');
  };

  const rangeForLabels = useMemo(() => {
    return getInsightsRange(view, monthlyPreset, customDateRange, anchorForRange);
  }, [anchorForRange, customDateRange, monthlyPreset, view]);

  const exportAnalyticsCsv = useCallback(async () => {
    try {
      if (!receipts.length) {
        Alert.alert('Export', 'No analytics data to export for this period.');
        return;
      }

      setLoading(true);

      const header = ['rangeStart', 'rangeEnd', 'date', 'merchant', 'category', 'amount'];
      const rows = receipts
        .slice()
        .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime())
        .map(r => [
          rangeForLabels.start.toISOString(),
          rangeForLabels.end.toISOString(),
          toDate(r.date).toISOString(),
          r.merchant,
          r.category,
          r.amount,
        ]);

      const csv = [header.join(','), ...rows.map(cols => cols.map(escapeCsv).join(','))].join('\n');

      const exportDir = Platform.OS === 'android' ? RNFS.DownloadDirectoryPath : RNFS.DocumentDirectoryPath;
      const outPath = `${exportDir}/analytics-${Date.now()}.csv`;
      await RNFS.writeFile(outPath, csv, 'utf8');

      const url = ensureFileUri(outPath);
      await Share.open({
        title: 'ReceiptStacker Analytics (CSV)',
        url,
        type: 'text/csv',
      });
    } catch (e) {
      console.error('Analytics export failed:', e);
      Alert.alert('Export', 'Failed to export analytics CSV.');
    } finally {
      setLoading(false);
      setExportInfoVisible(false);
    }
  }, [rangeForLabels.end, rangeForLabels.start, receipts]);

  const rangeDayCount = useMemo(() => {
    const days = Math.max(
      1,
      Math.round((rangeForLabels.end.getTime() - rangeForLabels.start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
    );
    return days;
  }, [rangeForLabels.end, rangeForLabels.start]);

  const avgPerDay = analytics.total / rangeDayCount;

  const compareLabel = useMemo(() => {
    if (view === 'weekly') return 'vs Last Week';
    if (view === 'custom') return 'vs Previous Period';
    return monthlyPreset === 'last' ? 'vs Prior Month' : 'vs Last Month';
  }, [monthlyPreset, view]);

  const deltaAmount = analytics.previousTotal - analytics.total;
  const deltaText = useMemo(() => {
    if (!Number.isFinite(analytics.previousTotal) || analytics.previousTotal <= 0) return 'No prior period data';
    if (deltaAmount > 0) return `You saved ${formatCurrency(deltaAmount)}`;
    if (deltaAmount < 0) return `You spent ${formatCurrency(Math.abs(deltaAmount))} more`;
    return 'No change';
  }, [analytics.previousTotal, deltaAmount]);

  const periodLabel = useMemo(() => {
    if (view === 'monthly') {
      const anchor = monthlyPreset === 'last' ? addMonths(selectedMonth, -1) : selectedMonth;
      return anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    const start = rangeForLabels.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end = rangeForLabels.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${start} - ${end}`;
  }, [monthlyPreset, rangeForLabels.end, rangeForLabels.start, selectedMonth, view]);

  const trendTitleLabel = useMemo(() => {
    if (view === 'monthly') {
      const anchor = monthlyPreset === 'last' ? addMonths(selectedMonth, -1) : selectedMonth;
      return anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    // Weekly/custom: use the current range's month/year.
    return rangeForLabels.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [monthlyPreset, selectedMonth, view]);

  useEffect(() => {
    // Keep month panel draft in sync with the selected month.
    setDraftMonthIndex(selectedMonth.getMonth());
    setDraftYear(selectedMonth.getFullYear());
  }, [selectedMonth]);

  const trendBuckets = useMemo(() => {
    type Bucket = {
      key: string;
      label: string;
      total: number;
      segments: Array<{ value: number; color: string; label: string; showLabel: boolean }>;
    };

    const dollarLabel = (n: number) => {
      if (!Number.isFinite(n) || n <= 0) return '';
      return `$${Math.round(n)}`;
    };

    const categoryTotals = new Map<string, { total: number; color: string }>();
    receipts.forEach(r => {
      const existing = categoryTotals.get(r.category);
      if (!existing) categoryTotals.set(r.category, { total: r.amount, color: r.categoryColor || primary });
      else existing.total += r.amount;
    });

    const topCategories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 4)
      .map(([name, data]) => ({ name, color: data.color }));

    const otherColor = colors.textTertiary;

    const buildSegments = (filtered: Receipt[], total: number) => {
      const perCat = new Map<string, number>();
      let other = 0;

      filtered.forEach(r => {
        const inTop = topCategories.find(c => c.name === r.category);
        if (inTop) perCat.set(r.category, (perCat.get(r.category) ?? 0) + r.amount);
        else other += r.amount;
      });

      const segmentsRaw = topCategories
        .map(c => ({ value: perCat.get(c.name) ?? 0, color: c.color }))
        .filter(s => s.value > 0);

      if (other > 0) segmentsRaw.push({ value: other, color: otherColor });

      // Ensure a visible bar even when empty.
      if (!segmentsRaw.length) segmentsRaw.push({ value: 1, color: colors.disabled });

      return segmentsRaw.map(s => {
        const pct = total > 0 ? s.value / total : 0;
        return {
          ...s,
          label: dollarLabel(s.value),
          showLabel: pct >= 0.09,
        };
      });
    };

    if (view === 'monthly') {
      // Match screen 2: Week 1..4.
      const bucketDefs = [
        { key: 'w1', startDay: 1, endDay: 7, label: 'Week 1' },
        { key: 'w2', startDay: 8, endDay: 14, label: 'Week 2' },
        { key: 'w3', startDay: 15, endDay: 21, label: 'Week 3' },
        { key: 'w4', startDay: 22, endDay: 31, label: 'Week 4' },
      ];

      return bucketDefs.map(b => {
        const subset = receipts.filter(r => {
          const d = toDate(r.date);
          const day = d.getDate();
          return day >= b.startDay && day <= b.endDay;
        });
        const total = subset.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        return {
          key: b.key,
          label: b.label,
          total,
          segments: buildSegments(subset, total),
        } satisfies Bucket;
      });
    }

    if (view === 'weekly') {
      // Match screen 3: Mon..Sun.
      const weekStart = startOfWeekMonday(anchorForRange);
      const buckets: Bucket[] = [];
      for (let i = 0; i < 7; i += 1) {
        const day = addDays(weekStart, i);
        const subset = receipts.filter(r => sameDayKey(startOfDay(toDate(r.date))) === sameDayKey(day));
        const total = subset.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        buckets.push({
          key: `d${i}`,
          label: WEEKDAY_SHORT[i] ?? '',
          total,
          segments: buildSegments(subset, total),
        });
      }
      return buckets;
    }

    return [] as Bucket[];
  }, [anchorForRange, colors.disabled, colors.textTertiary, primary, receipts, view]);

  const changeIsUp = analytics.change >= 0;
  const changeColor = changeIsUp ? COLORS.semantic.success : COLORS.semantic.error;

  const chartConfig = useMemo(
    () => ({
      backgroundGradientFrom: colors.surface,
      backgroundGradientTo: colors.surface,
      color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
      labelColor: (opacity = 1) => {
        const hex = colors.textSecondary;
        // fall back to rgba with opacity if not hex.
        if (/^#([0-9a-fA-F]{6})$/.test(hex)) {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }
        return hex;
      },
      strokeWidth: 3,
      propsForDots: {
        r: '4',
        strokeWidth: '2',
        stroke: primary,
      },
      decimalPlaces: 0,
    }),
    [colors.surface, colors.textSecondary, primary],
  );

  const hasData = receipts.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerWrap}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.headerBackBtn, pressed ? styles.pressed : null]}
          >
            <Feather name="arrow-left" size={ICON_SIZES.md} color={colors.text} />
          </Pressable>

          <View style={styles.headerRight}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Toggle theme"
              onPress={toggleTheme}
              style={({ pressed }) => [styles.headerIconBtn, styles.headerIconBtnElevated, pressed ? styles.pressed : null]}
            >
              <Feather name={isDark ? 'sun' : 'moon'} size={ICON_SIZES.md} color={colors.text} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export"
              onPress={() => setExportInfoVisible(true)}
              style={({ pressed }) => [styles.headerIconBtnPlain, pressed ? styles.pressed : null]}
            >
              <Feather name="download" size={ICON_SIZES.md} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <Text style={styles.headerTitle}>Analytics</Text>
        <Text style={styles.headerSubtitle}>Your spending insights</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.topControlsWrap}>
          <View style={styles.segmentWrap}>
            {(
              [
                { key: 'thisMonth', label: 'This Month' },
                { key: 'lastMonth', label: 'Last Month' },
                { key: 'weekly', label: 'Weekly' },
                { key: 'custom', label: 'Custom' },
              ] as const
            ).map(item => {
              const selected = selectionKey === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${item.label}`}
                  onPress={() => applySelection(item.key)}
                  style={({ pressed }) => [
                    styles.segmentBtn,
                    selected ? styles.segmentBtnActive : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.segmentText, selected ? styles.segmentTextActive : null]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selectionKey === 'custom' ? (
            <View style={styles.customRangeRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select start date"
                onPress={() => {
                  setActiveCustomField('start');
                  setShowStartPicker(true);
                }}
                style={({ pressed }) => [
                  styles.customDateField,
                  styles.customDateFieldOutlined,
                  activeCustomField === 'start' ? styles.customDateFieldActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={[styles.customDateText, !customTempStart ? styles.customDatePlaceholder : null]}
                >
                  {formatInputDate(customTempStart)}
                </Text>
              </Pressable>

              <Text style={styles.customToText}>to</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select end date"
                onPress={() => {
                  setActiveCustomField('end');
                  setShowEndPicker(true);
                }}
                style={({ pressed }) => [
                  styles.customDateField,
                  styles.customDateFieldFilled,
                  activeCustomField === 'end' ? styles.customDateFieldActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={[styles.customDateText, !customTempEnd ? styles.customDatePlaceholder : null]}
                >
                  {formatInputDate(customTempEnd)}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Apply custom date range"
                disabled={!customTempStart || !customTempEnd}
                onPress={() => {
                  if (!customTempStart || !customTempEnd) return;
                  const start = startOfDay(customTempStart);
                  const end = endOfDay(customTempEnd);
                  if (start.getTime() > end.getTime()) setCustomDateRange({ start: end, end: start });
                  else setCustomDateRange({ start, end });
                }}
                style={({ pressed }) => [
                  styles.customApplyBtn,
                  !customTempStart || !customTempEnd ? styles.customApplyBtnDisabled : null,
                  pressed && customTempStart && customTempEnd ? styles.customApplyBtnPressed : null,
                ]}
              >
                <Text numberOfLines={1} style={styles.customApplyText}>
                  Apply
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.topControlsDivider} />
        </View>

        <View style={styles.metricsRow}>
          <Card variant="default" style={styles.metricCard}>
            <View style={styles.metricTopRow}>
              <View style={styles.metricIconCircleSuccess}>
                <Feather name={changeIsUp ? 'trending-up' : 'trending-down'} size={ICON_SIZES.md} color={COLORS.semantic.success} />
              </View>
              <Text numberOfLines={1} style={styles.metricLabel}>
                {compareLabel}
              </Text>
            </View>
            <Text style={styles.metricValue}>{`${analytics.change.toFixed(0)}%`}</Text>
            <Text style={styles.metricSubtext}>{deltaText}</Text>
          </Card>

          <Card variant="default" style={styles.metricCard}>
            <View style={styles.metricTopRow}>
              <View style={styles.metricIconCirclePrimary}>
                <Feather name="calendar" size={ICON_SIZES.md} color={primary} />
              </View>
              <Text numberOfLines={1} style={styles.metricLabel}>
                Avg/Day
              </Text>
            </View>
            <Text style={styles.metricValue}>{formatCurrency(avgPerDay)}</Text>
            <Text style={styles.metricSubtext}>Daily spending</Text>
          </Card>
        </View>

        <View style={styles.totalBigCard}>
          <Text style={styles.totalBigLabel}>Total Spending</Text>
          <Text style={styles.totalBigAmount}>{formatCurrency(analytics.total)}</Text>
          <Text style={styles.totalBigPeriod}>{periodLabel}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.trendSectionTitle}>{`Spending Trend for ${trendTitleLabel}`}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select Month"
              onPress={() => {
                setMonthPanelOpen(v => !v);
                setMonthDropdownOpen(false);
                setYearDropdownOpen(false);
              }}
              style={({ pressed }) => [styles.selectMonthBtn, pressed ? styles.pressed : null]}
            >
              <Feather name="calendar" size={ICON_SIZES.sm} color={primary} />
              <Text style={styles.selectMonthText}>Select Month</Text>
            </Pressable>
          </View>

          <Card variant="default" style={styles.trendCard}>
            {monthPanelOpen ? (
              <View style={styles.monthPanel}>
                <View style={styles.monthPanelGrid}>
                  <View style={styles.monthFieldCol}>
                    <Text style={styles.monthFieldLabel}>Month</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Choose month"
                      onPress={() => {
                        setMonthDropdownOpen(v => !v);
                        setYearDropdownOpen(false);
                      }}
                      style={({ pressed }) => [styles.monthField, pressed ? styles.pressed : null]}
                    >
                      <Text style={styles.monthFieldValue}>{MONTH_NAMES[draftMonthIndex] ?? 'January'}</Text>
                      <Feather name="chevron-down" size={ICON_SIZES.md} color={colors.textSecondary} />
                    </Pressable>

                    {monthDropdownOpen ? (
                      <View style={styles.monthDropdownPanel}>
                        <ScrollView showsVerticalScrollIndicator={false} style={styles.monthDropdownScroll}>
                          {MONTH_NAMES.map((m, idx) => {
                            const selected = idx === draftMonthIndex;
                            return (
                              <Pressable
                                key={m}
                                accessibilityRole="button"
                                accessibilityLabel={`Select ${m}`}
                                onPress={() => {
                                  setDraftMonthIndex(idx);
                                  setMonthDropdownOpen(false);
                                }}
                                style={({ pressed }) => [
                                  styles.monthDropdownRow,
                                  selected ? styles.monthDropdownRowSelected : null,
                                  pressed ? styles.pressed : null,
                                ]}
                              >
                                <Text style={[styles.monthDropdownText, selected ? styles.monthDropdownTextSelected : null]}>
                                  {m}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.monthFieldCol}>
                    <Text style={styles.monthFieldLabel}>Year</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Choose year"
                      onPress={() => {
                        setYearDropdownOpen(v => !v);
                        setMonthDropdownOpen(false);
                      }}
                      style={({ pressed }) => [styles.monthField, pressed ? styles.pressed : null]}
                    >
                      <Text style={styles.monthFieldValue}>{String(draftYear)}</Text>
                      <Feather name="chevron-down" size={ICON_SIZES.md} color={colors.textSecondary} />
                    </Pressable>

                    {yearDropdownOpen ? (
                      <View style={styles.monthDropdownPanel}>
                        <ScrollView showsVerticalScrollIndicator={false} style={styles.monthDropdownScroll}>
                          {Array.from({ length: 11 }).map((_, i) => {
                            const y = new Date().getFullYear() - 5 + i;
                            const selected = y === draftYear;
                            return (
                              <Pressable
                                key={String(y)}
                                accessibilityRole="button"
                                accessibilityLabel={`Select ${y}`}
                                onPress={() => {
                                  setDraftYear(y);
                                  setYearDropdownOpen(false);
                                }}
                                style={({ pressed }) => [
                                  styles.monthDropdownRow,
                                  selected ? styles.monthDropdownRowSelected : null,
                                  pressed ? styles.pressed : null,
                                ]}
                              >
                                <Text style={[styles.monthDropdownText, selected ? styles.monthDropdownTextSelected : null]}>
                                  {String(y)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.monthPanelActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Apply month selection"
                    onPress={() => {
                      setSelectedMonth(new Date(draftYear, draftMonthIndex, 1));
                      setMonthPanelOpen(false);
                      setMonthDropdownOpen(false);
                      setYearDropdownOpen(false);
                      if (view === 'monthly') setMonthlyPreset('this');
                    }}
                    style={({ pressed }) => [styles.monthApplyBtn, pressed ? styles.monthApplyPressed : null]}
                  >
                    <Text style={styles.monthApplyText}>Apply</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancel month selection"
                    onPress={() => {
                      setMonthPanelOpen(false);
                      setMonthDropdownOpen(false);
                      setYearDropdownOpen(false);
                      setDraftMonthIndex(selectedMonth.getMonth());
                      setDraftYear(selectedMonth.getFullYear());
                    }}
                    style={({ pressed }) => [styles.monthCancelBtn, pressed ? styles.monthCancelPressed : null]}
                  >
                    <Text style={styles.monthCancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.trendCanvas}>
                {(view === 'monthly' || view === 'weekly') && (hasData || view === 'weekly') ? (
                  <View style={styles.trendBarsRow}>
                    {trendBuckets.map(b => (
                      <View key={b.key} style={styles.trendBarCol}>
                        <Text style={styles.trendTotalText}>{b.total > 0 ? `$${abbreviateNumber(b.total)}` : ''}</Text>
                        <View style={styles.trendBar}>
                          {b.segments.map((s, idx) => (
                            <View
                              key={`${b.key}-${idx}`}
                              style={[styles.trendSegment, { flex: Math.max(1, s.value), backgroundColor: s.color }]}
                            >
                              {s.showLabel && s.label ? <Text style={styles.trendSegmentText}>{s.label}</Text> : null}
                            </View>
                          ))}
                        </View>
                        <Text style={styles.trendBucketLabel}>{b.label}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyTrend}>
                    <Text style={styles.emptyText}>Trend chart is available for monthly and weekly views</Text>
                  </View>
                )}
              </View>
            )}
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spending by Category</Text>

          <Card variant="default" style={styles.categoryCard}>
            {analytics.categoryBreakdown.length ? (
              analytics.categoryBreakdown.slice(0, 3).map((c, idx, arr) => (
                <View key={`${c.name}-${idx}`} style={styles.categoryRowWrap}>
                  <View style={styles.categoryTopRow}>
                    <View style={[styles.categoryDot, { backgroundColor: c.color }]} />
                    <Text style={styles.categoryName} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <View style={styles.categoryRight}>
                      <Text style={styles.categoryAmount}>{formatCurrency(c.amount)}</Text>
                      <Text style={styles.categoryPct}>{`${c.percentage}%`}</Text>
                    </View>
                  </View>

                  <View style={styles.categoryTrack}>
                    <View
                      style={[
                        styles.categoryFill,
                        { width: `${clamp(c.percentage, 0, 100)}%`, backgroundColor: c.color },
                      ]}
                    />
                  </View>

                  {idx < arr.length - 1 ? <View style={styles.categoryDivider} /> : null}
                </View>
              ))
            ) : (
              <View style={styles.emptyCategory}>
                <Text style={styles.emptyText}>No category data for this period</Text>
              </View>
            )}
          </Card>
        </View>
      </ScrollView>

      <LoadingOverlay visible={loading} />

      <Modal
        isVisible={exportInfoVisible}
        onBackdropPress={() => setExportInfoVisible(false)}
        onBackButtonPress={() => setExportInfoVisible(false)}
        backdropOpacity={0.5}
        useNativeDriver
      >
        <Card variant="default" style={styles.customModalCard}>
          <Text style={styles.customModalTitle}>Export</Text>
          <Text style={styles.emptyText}>Export the receipts backing this Analytics view as a CSV file.</Text>
          <View style={styles.customActions}>
            <Button title="Export CSV" onPress={() => exportAnalyticsCsv()} variant="primary" fullWidth />
            <View style={{ height: 10 }} />
            <Button title="Close" onPress={() => setExportInfoVisible(false)} variant="secondary" fullWidth />
          </View>
        </Card>
      </Modal>

      <DatePickerModal
        visible={showStartPicker}
        initialDate={customTempStart ?? addDays(new Date(), -29)}
        onConfirm={(d: Date) => {
          setCustomTempStart(d);
          setActiveCustomField(null);
          setShowStartPicker(false);
        }}
        onClose={() => {
          setActiveCustomField(null);
          setShowStartPicker(false);
        }}
      />

      <DatePickerModal
        visible={showEndPicker}
        initialDate={customTempEnd ?? new Date()}
        onConfirm={(d: Date) => {
          setCustomTempEnd(d);
          setActiveCustomField(null);
          setShowEndPicker(false);
        }}
        onClose={() => {
          setActiveCustomField(null);
          setShowEndPicker(false);
        }}
      />

      <GuidedTourModal
        visible={tourVisible}
        stepIndex={tourStep}
        steps={tourSteps}
        onClose={() => {
          void cancelTour();
        }}
        onSkip={() => {
          void cancelTour();
        }}
        onNext={handleTourNext}
      />
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
  primary,
  isDark,
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
  primary: string;
  isDark: boolean;
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingBottom: SPACING.xl,
      paddingTop: SPACING.md,
    },

    headerWrap: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      backgroundColor: colors.background,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    headerBackBtn: {
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderRadius: 12,
    } satisfies ViewStyle,
    headerIconBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    } satisfies ViewStyle,
    headerIconBtnPlain: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    } satisfies ViewStyle,
    headerIconBtnElevated: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 6,
    } satisfies ViewStyle,
    headerTitle: {
      fontFamily: TYPOGRAPHY.pageTitle.fontFamily,
      fontSize: 26,
      lineHeight: 32,
      fontWeight: '700',
      color: colors.text,
      marginTop: SPACING.md,
    } satisfies TextStyle,
    headerSubtitle: {
      fontFamily: TYPOGRAPHY.bodySmall.fontFamily,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      marginTop: SPACING.xs,
      fontWeight: '400',
    } satisfies TextStyle,

    topControlsWrap: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
    } satisfies ViewStyle,
    topControlsDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: SPACING.lg,
    } satisfies ViewStyle,

    segmentWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderRadius: RADIUS.full,
      paddingVertical: 0,
      paddingHorizontal: 0,
      marginTop: SPACING.lg,
      borderWidth: 0,
      borderColor: 'transparent',
      gap: 10,
    },
    segmentBtn: {
      flex: 1,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? colors.surface : '#EEF2F7',
      borderWidth: 0,
      borderColor: 'transparent',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0 : 0.10,
      shadowRadius: 10,
      elevation: isDark ? 0 : 4,
    } satisfies ViewStyle,
    segmentBtnActive: {
      backgroundColor: primary,
      borderWidth: 2,
      borderColor: '#0f172a',
    } satisfies ViewStyle,
    segmentText: {
      fontFamily: TYPOGRAPHY.bodySmall.fontFamily,
      fontSize: 12,
      lineHeight: 18,
      color: colors.textSecondary,
      fontWeight: '600',
    } satisfies TextStyle,
    segmentTextActive: {
      color: COLORS.common.white,
    } satisfies TextStyle,

    customRangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginTop: SPACING.md,
    } satisfies ViewStyle,
    customDateField: {
      flex: 1,
      height: 44,
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
    } satisfies ViewStyle,
    customDateFieldOutlined: {
      backgroundColor: COLORS.common.white,
      borderColor: primary,
    } satisfies ViewStyle,
    customDateFieldFilled: {
      backgroundColor: isDark ? colors.surface : '#EEF2F7',
      borderColor: 'transparent',
    } satisfies ViewStyle,
    customDateFieldActive: {
      borderColor: primary,
    } satisfies ViewStyle,
    customDateText: {
      fontFamily: TYPOGRAPHY.bodyNormal.fontFamily,
      fontSize: 13,
      lineHeight: 20,
      color: colors.text,
      fontWeight: '600',
      textAlign: 'center',
    } satisfies TextStyle,
    customDatePlaceholder: {
      color: colors.textSecondary,
      fontWeight: '500',
    } satisfies TextStyle,
    customToText: {
      fontFamily: TYPOGRAPHY.bodySmall.fontFamily,
      fontSize: 12,
      lineHeight: 18,
      color: colors.textSecondary,
      fontWeight: '600',
    } satisfies TextStyle,
    customApplyBtn: {
      height: 44,
      width: 92,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 6,
    } satisfies ViewStyle,
    customApplyBtnDisabled: {
      backgroundColor: '#9BB6F5',
      shadowOpacity: 0,
      elevation: 0,
    } satisfies ViewStyle,
    customApplyBtnPressed: {
      opacity: 0.92,
    } satisfies ViewStyle,
    customApplyText: {
      fontFamily: TYPOGRAPHY.bodySmall.fontFamily,
      fontSize: 12,
      lineHeight: 18,
      color: COLORS.common.white,
      fontWeight: '700',
    } satisfies TextStyle,

    pressed: {
      opacity: 0.88,
    } satisfies ViewStyle,

    metricsRow: {
      paddingHorizontal: SPACING.lg,
      flexDirection: 'row',
      gap: SPACING.md,
      marginBottom: SPACING.lg,
    },
    metricCard: {
      flex: 1,
      padding: SPACING.md,
      borderRadius: RADIUS.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      minHeight: 0,
    } satisfies ViewStyle,
    metricTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.md,
      gap: SPACING.sm,
    },
    metricIconCircleSuccess: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(34, 197, 94, 0.16)',
    } satisfies ViewStyle,
    metricIconCirclePrimary: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(37, 99, 235, 0.14)',
    } satisfies ViewStyle,
    metricLabel: {
      fontFamily: TYPOGRAPHY.bodySmall.fontFamily,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
      fontWeight: '600',
    } satisfies TextStyle,
    metricValue: {
      fontSize: 28,
      fontWeight: '400',
      color: colors.text,
    } satisfies TextStyle,
    metricSubtext: {
      fontFamily: TYPOGRAPHY.bodySmall.fontFamily,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
      marginTop: SPACING.xs,
      fontWeight: '400',
    } satisfies TextStyle,

    totalBigCard: {
      marginHorizontal: SPACING.lg,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      backgroundColor: primary,
      marginBottom: SPACING.xl,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 16,
      elevation: 10,
    } satisfies ViewStyle,
    totalBigLabel: {
      fontFamily: TYPOGRAPHY.label.fontFamily,
      fontSize: 13,
      lineHeight: 18,
      color: 'rgba(255,255,255,0.86)',
      fontWeight: '600',
    } satisfies TextStyle,
    totalBigAmount: {
      fontSize: 38,
      fontWeight: '300',
      color: COLORS.common.white,
      marginTop: SPACING.md,
    } satisfies TextStyle,
    totalBigPeriod: {
      fontFamily: TYPOGRAPHY.bodyNormal.fontFamily,
      fontSize: 14,
      lineHeight: 20,
      color: 'rgba(255,255,255,0.86)',
      marginTop: SPACING.sm,
      fontWeight: '500',
    } satisfies TextStyle,

    section: {
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    sectionTitle: {
      fontFamily: TYPOGRAPHY.sectionHeading.fontFamily,
      fontSize: 18,
      lineHeight: 24,
      color: colors.text,
      fontWeight: '700',
    },

    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPACING.md,
      marginBottom: SPACING.md,
    },

    trendSectionTitle: {
      fontFamily: TYPOGRAPHY.sectionHeading.fontFamily,
      fontSize: 18,
      lineHeight: 24,
      color: colors.text,
      fontWeight: '700',
      flex: 1,
      flexShrink: 1,
      paddingRight: SPACING.sm,
    } satisfies TextStyle,

    selectMonthBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: RADIUS.lg,
      backgroundColor: isDark ? colors.surface : '#EAF2FF',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignSelf: 'flex-start',
      maxWidth: 160,
    } satisfies ViewStyle,
    selectMonthText: {
      fontFamily: TYPOGRAPHY.bodySmall.fontFamily,
      fontSize: 12,
      lineHeight: 16,
      color: primary,
      fontWeight: '600',
    } satisfies TextStyle,

    trendCard: {
      padding: SPACING.md,
      borderRadius: RADIUS.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      minHeight: 0,
    } satisfies ViewStyle,

    monthPanel: {
      borderRadius: RADIUS.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? colors.border : '#DDE8FF',
      backgroundColor: isDark ? colors.surface : '#F7FAFF',
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    } satisfies ViewStyle,
    monthPanelGrid: {
      flexDirection: 'row',
      gap: SPACING.md,
    } satisfies ViewStyle,
    monthFieldCol: {
      flex: 1,
    } satisfies ViewStyle,
    monthFieldLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      fontWeight: '700',
      marginBottom: SPACING.sm,
    } satisfies TextStyle,
    monthField: {
      height: 48,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: SPACING.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    } satisfies ViewStyle,
    monthFieldValue: {
      fontFamily: TYPOGRAPHY.bodyLarge.fontFamily,
      fontSize: 15,
      lineHeight: 20,
      color: colors.text,
      fontWeight: '600',
    } satisfies TextStyle,
    monthDropdownPanel: {
      marginTop: SPACING.sm,
      borderRadius: RADIUS.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    } satisfies ViewStyle,
    monthDropdownScroll: {
      maxHeight: 220,
    } satisfies ViewStyle,
    monthDropdownRow: {
      paddingVertical: 10,
      paddingHorizontal: SPACING.lg,
    } satisfies ViewStyle,
    monthDropdownRowSelected: {
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.18)' : '#EAF2FF',
    } satisfies ViewStyle,
    monthDropdownText: {
      fontFamily: TYPOGRAPHY.bodyNormal.fontFamily,
      fontSize: 13,
      lineHeight: 18,
      color: colors.text,
      fontWeight: '500',
    } satisfies TextStyle,
    monthDropdownTextSelected: {
      color: primary,
      fontWeight: '700',
    } satisfies TextStyle,
    monthPanelActions: {
      flexDirection: 'row',
      gap: SPACING.md,
      marginTop: SPACING.lg,
    } satisfies ViewStyle,
    monthApplyBtn: {
      flex: 1,
      height: 48,
      borderRadius: RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: primary,
    } satisfies ViewStyle,
    monthApplyPressed: {
      opacity: 0.9,
    } satisfies ViewStyle,
    monthApplyText: {
      fontFamily: TYPOGRAPHY.buttonText.fontFamily,
      fontSize: 13,
      lineHeight: 18,
      color: COLORS.common.white,
      fontWeight: '600',
    } satisfies TextStyle,
    monthCancelBtn: {
      flex: 1,
      height: 48,
      borderRadius: RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.surface : '#EEF2F7',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    } satisfies ViewStyle,
    monthCancelPressed: {
      opacity: 0.9,
    } satisfies ViewStyle,
    monthCancelText: {
      fontFamily: TYPOGRAPHY.buttonText.fontFamily,
      fontSize: 13,
      lineHeight: 18,
      color: colors.text,
      fontWeight: '600',
    } satisfies TextStyle,

    trendCanvas: {
      borderRadius: RADIUS.xl,
      backgroundColor: isDark ? colors.surface : '#F7FAFF',
      padding: SPACING.lg,
    } satisfies ViewStyle,
    trendBarsRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: SPACING.md,
      paddingTop: SPACING.md,
    } satisfies ViewStyle,
    trendBarCol: {
      flex: 1,
      alignItems: 'center',
    } satisfies ViewStyle,
    trendTotalText: {
      fontFamily: TYPOGRAPHY.bodySmall.fontFamily,
      fontSize: 11,
      lineHeight: 14,
      color: colors.text,
      fontWeight: '700',
      marginBottom: SPACING.xs,
      height: 18,
    } satisfies TextStyle,
    trendBar: {
      height: 170,
      width: '100%',
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      overflow: 'hidden',
      backgroundColor: isDark ? colors.disabled : '#EAF2FF',
      justifyContent: 'flex-end',
    } satisfies ViewStyle,
    trendSegment: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    } satisfies ViewStyle,
    trendSegmentText: {
      fontFamily: TYPOGRAPHY.bodySmall.fontFamily,
      fontSize: 11,
      lineHeight: 14,
      color: COLORS.common.white,
      fontWeight: '700',
    } satisfies TextStyle,
    trendBucketLabel: {
      fontFamily: TYPOGRAPHY.bodySmall.fontFamily,
      fontSize: 11,
      lineHeight: 14,
      color: colors.textSecondary,
      fontWeight: '600',
      marginTop: SPACING.sm,
    } satisfies TextStyle,
    emptyTrend: {
      height: 180,
      alignItems: 'center',
      justifyContent: 'center',
    },

    emptyText: {
      fontFamily: TYPOGRAPHY.bodySmall.fontFamily,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
      textAlign: 'center',
    },

    customModalCard: {
      padding: SPACING.lg,
    },
    customModalTitle: {
      fontFamily: TYPOGRAPHY.cardTitle.fontFamily,
      fontSize: 16,
      lineHeight: 20,
      color: colors.text,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },
    customActions: {
      flexDirection: 'row',
      marginTop: SPACING.md,
    },

    categoryCard: {
      marginTop: SPACING.md,
      padding: SPACING.md,
      borderRadius: RADIUS.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      minHeight: 0,
    } satisfies ViewStyle,
    categoryRowWrap: {
      paddingVertical: SPACING.sm,
    } satisfies ViewStyle,
    categoryTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    } satisfies ViewStyle,
    categoryDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
    } satisfies ViewStyle,
    categoryName: {
      flex: 1,
      fontFamily: TYPOGRAPHY.bodyNormal.fontFamily,
      fontSize: 13,
      lineHeight: 18,
      color: colors.text,
      fontWeight: '600',
    } satisfies TextStyle,
    categoryRight: {
      alignItems: 'flex-end',
      justifyContent: 'center',
      minWidth: 90,
    } satisfies ViewStyle,
    categoryAmount: {
      fontFamily: TYPOGRAPHY.bodyNormal.fontFamily,
      fontSize: 13,
      lineHeight: 18,
      color: colors.text,
      fontWeight: '700',
    } satisfies TextStyle,
    categoryPct: {
      fontFamily: TYPOGRAPHY.bodySmall.fontFamily,
      fontSize: 11,
      lineHeight: 14,
      color: colors.textSecondary,
      fontWeight: '600',
      marginTop: 2,
    } satisfies TextStyle,
    categoryTrack: {
      height: 10,
      borderRadius: 999,
      backgroundColor: colors.disabled,
      overflow: 'hidden',
      marginTop: SPACING.sm,
    } satisfies ViewStyle,
    categoryFill: {
      height: '100%',
      borderRadius: 999,
    } satisfies ViewStyle,
    categoryDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: SPACING.md,
    } satisfies ViewStyle,
    emptyCategory: {
      paddingVertical: SPACING.lg,
      alignItems: 'center',
      justifyContent: 'center',
    } satisfies ViewStyle,
  });

export default AnalyticsScreen;
