import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';

import { Badge, Button, Card, IconButton } from '@/components/common';
import { LoadingOverlay } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import {
  deleteReceipt as deleteReceiptSql,
  getLatestReceiptOcr,
  getReceiptImagesByReceiptId,
  getScannedReceiptSummaries,
  searchReceiptIdsByOcrText,
  searchReceiptIdsByItemName,
  type ScannedReceiptSummary,
} from '@/services/database';
import { deleteReceiptById as deleteReceiptAsync } from '@/utils/receiptStore';
import { formatCurrency } from '@/utils/format';

import {
  confidenceToPct,
  getAccuracyBucketFromPct,
  getAccuracyIconForBucket,
  getAccuracyLabelForBucket,
  getScanModeLabel,
  matchesAccuracyFilter,
  normalizeScanMode,
  type AccuracyLevelFilter,
  type ScanModeFilter,
} from '@/utils/scannedReceipts';

type Props = NativeStackScreenProps<MainStackParamList, 'ScannedReceipts'>;

const BOTTOM_MENU_HEIGHT = 78;

type StatusFilter = 'all' | 'processed' | 'review' | 'pending';
type SortId = 'dateDesc' | 'dateAsc' | 'accuracyDesc' | 'accuracyAsc' | 'amountDesc' | 'amountAsc' | 'merchantAsc';

type DateRangeId = 'all' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'thisYear';

const DATE_RANGES: Array<{ id: DateRangeId; label: string }> = [
  { id: 'all', label: 'All Time' },
  { id: '7d', label: 'Last 7 Days' },
  { id: '30d', label: 'Last 30 Days' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
  { id: 'thisYear', label: 'This Year' },
];

type AmountPresetId = 'none' | 'lt10' | '10to50' | '50to100' | '100plus';

const AMOUNT_PRESETS: Array<{ id: AmountPresetId; label: string; min?: number; max?: number }> = [
  { id: 'lt10', label: '< $10', min: 0, max: 10 },
  { id: '10to50', label: '$10-50', min: 10, max: 50 },
  { id: '50to100', label: '$50-100', min: 50, max: 100 },
  { id: '100plus', label: '$100+', min: 100 },
];

const toSafeDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const formatShortDate = (iso: string) =>
  toSafeDate(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const parseAmountText = (v: string) => {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

const hasOcrSignals = (r: ScannedReceiptSummary) => {
  if (typeof r.ocrWordCount === 'number' && Number.isFinite(r.ocrWordCount) && r.ocrWordCount > 0) return true;
  if (typeof r.ocrEngine === 'string' && r.ocrEngine.trim().length) return true;
  return false;
};

const estimateAccuracyPct = (r: ScannedReceiptSummary): number | null => {
  // ML Kit wrappers sometimes don't expose confidence. This provides a consistent
  // user-facing metric so the UI can still show a percentage.
  const hasOcr = hasOcrSignals(r);
  if (!hasOcr) return null;

  const wc = typeof r.ocrWordCount === 'number' && Number.isFinite(r.ocrWordCount) ? r.ocrWordCount : 0;
  const items = typeof r.itemCount === 'number' && Number.isFinite(r.itemCount) ? r.itemCount : 0;
  const edited = Boolean(r.hasEditedOcr);

  let score = wc >= 200 ? 78 : wc >= 80 ? 72 : wc >= 30 ? 66 : wc >= 10 ? 58 : 52;
  if (items >= 10) score += 12;
  else if (items >= 3) score += 8;
  else if (items >= 1) score += 5;
  if (edited) score += 6;

  score = Math.max(35, Math.min(95, Math.round(score)));
  return score;
};

const getAccuracyForDisplay = (r: ScannedReceiptSummary): { pct: number | null; estimated: boolean; hasOcr: boolean } => {
  const hasOcr = hasOcrSignals(r);
  const pctRaw = confidenceToPct(r.ocrConfidence);
  const pctEst = pctRaw == null ? estimateAccuracyPct(r) : null;
  const pct = pctRaw ?? pctEst;
  return { pct, estimated: pctRaw == null && pctEst != null, hasOcr };
};

const getProcessedState = (r: ScannedReceiptSummary) => {
  // Best-effort given current schema:
  // - Pending: no OCR yet
  // - Review: OCR exists but not yet confirmed/processed
  // - Processed: user edited OCR OR any line items saved
  const processed = Boolean(r.hasEditedOcr) || (typeof r.itemCount === 'number' && r.itemCount > 0);
  const hasOcr = hasOcrSignals(r);
  const review = hasOcr && !processed;
  const pending = !hasOcr;
  return { processed, review, pending, hasOcr };
};

export const ScannedReceiptsScreen = ({ navigation }: Props) => {
  const { colors, isDark, toggleTheme } = useTheme();
  const primary = COLORS.brand.primary;

  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<ScannedReceiptSummary[]>([]);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [itemSearchIds, setItemSearchIds] = useState<Set<string> | null>(null);
  const [ocrSearchIds, setOcrSearchIds] = useState<Set<string> | null>(null);

  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [accuracyLevel, setAccuracyLevel] = useState<AccuracyLevelFilter>('all');
  const [scanModeFilter, setScanModeFilter] = useState<ScanModeFilter>('all');
  const [sortId, setSortId] = useState<SortId>('dateDesc');

  const [categoryId, setCategoryId] = useState<string>('all');
  const [storeFilter, setStoreFilter] = useState('');
  const [dateRangeId, setDateRangeId] = useState<DateRangeId>('all');
  const [amountPreset, setAmountPreset] = useState<AmountPresetId>('none');
  const [minAmountText, setMinAmountText] = useState('');
  const [maxAmountText, setMaxAmountText] = useState('');

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const styles = useMemo(() => createStyles({ colors, primary, isDark }), [colors, primary, isDark]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await getScannedReceiptSummaries(1000);
      setReceipts(rows);
    } catch {
      Alert.alert('Error', 'Failed to load scanned receipts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const q = debouncedQuery.trim();
      if (q.length < 2) {
        setItemSearchIds(null);
        return;
      }

      try {
        const ids = await searchReceiptIdsByItemName(q, 250);
        if (cancelled) return;
        setItemSearchIds(new Set(ids));
      } catch {
        if (cancelled) return;
        setItemSearchIds(null);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const q = debouncedQuery.trim();
      if (q.length < 2) {
        setOcrSearchIds(null);
        return;
      }

      try {
        const ids = await searchReceiptIdsByOcrText(q, 250);
        if (cancelled) return;
        setOcrSearchIds(new Set(ids));
      } catch {
        if (cancelled) return;
        setOcrSearchIds(null);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const filterCount = useMemo(() => {
    let c = 0;
    if (categoryId !== 'all') c += 1;
    if (statusFilter !== 'all') c += 1;
    if (storeFilter.trim().length) c += 1;
    if (dateRangeId !== 'all') c += 1;
    if (amountPreset !== 'none' || minAmountText.trim().length || maxAmountText.trim().length) c += 1;
    if (accuracyLevel !== 'all') c += 1;
    if (scanModeFilter !== 'all') c += 1;
    if (sortId !== 'dateDesc') c += 1;
    return c;
  }, [accuracyLevel, amountPreset, categoryId, dateRangeId, maxAmountText, minAmountText, scanModeFilter, sortId, statusFilter, storeFilter]);

  const dateRange = useMemo(() => {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

    switch (dateRangeId) {
      case '7d': {
        const end = new Date(now);
        const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { start: startOfDay(start), end };
      }
      case '30d': {
        const end = new Date(now);
        const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { start: startOfDay(start), end };
      }
      case 'thisMonth': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now);
        return { start, end };
      }
      case 'lastMonth': {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return { start, end };
      }
      case 'thisYear': {
        const start = new Date(now.getFullYear(), 0, 1);
        const end = new Date(now);
        return { start, end };
      }
      case 'all':
      default:
        return null;
    }
  }, [dateRangeId]);

  const visibleReceipts = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const storeQ = storeFilter.trim().toLowerCase();

    const minText = minAmountText.trim();
    const maxText = maxAmountText.trim();

    const preset = AMOUNT_PRESETS.find(p => p.id === amountPreset) ?? null;
    const presetMin = preset?.min;
    const presetMax = preset?.max;

    const minManual = minText ? parseAmountText(minText) : NaN;
    const maxManual = maxText ? parseAmountText(maxText) : NaN;
    const minAmount = Number.isFinite(minManual) ? minManual : typeof presetMin === 'number' ? presetMin : NaN;
    const maxAmount = Number.isFinite(maxManual) ? maxManual : typeof presetMax === 'number' ? presetMax : NaN;
    const hasMin = Number.isFinite(minAmount);
    const hasMax = Number.isFinite(maxAmount);

    const filtered = receipts.filter((r) => {
      const { processed, review, pending } = getProcessedState(r);
      const pct = confidenceToPct(r.ocrConfidence);

      if (categoryId !== 'all' && r.categoryId !== categoryId) return false;
      if (statusFilter === 'processed' && !processed) return false;
      if (statusFilter === 'review' && !review) return false;
      if (statusFilter === 'pending' && !pending) return false;

      if (!matchesAccuracyFilter(pct, accuracyLevel)) return false;

      if (scanModeFilter !== 'all') {
        const mode = normalizeScanMode(r.scanMode, r.partCount);
        if (mode !== scanModeFilter) return false;
      }

      if (dateRange) {
        const t = toSafeDate(r.date).getTime();
        if (t < dateRange.start.getTime() || t > dateRange.end.getTime()) return false;
      }

      if (storeQ) {
        const m = (r.merchant ?? '').toLowerCase();
        if (!m.includes(storeQ)) return false;
      }

      if (hasMin && !(r.amount >= minAmount)) return false;
      if (hasMax && !(r.amount <= maxAmount)) return false;

      if (q) {
        const hay = [r.merchant, r.id, r.categoryName ?? '', r.categoryId, r.tagsCsv ?? '', r.date]
          .join(' ')
          .toLowerCase();
        const merchantHit = hay.includes(q);
        const itemHit = itemSearchIds ? itemSearchIds.has(r.id) : false;
        const ocrHit = ocrSearchIds ? ocrSearchIds.has(r.id) : false;
        if (!merchantHit && !itemHit && !ocrHit) return false;
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortId) {
        case 'dateAsc':
          return toSafeDate(a.date).getTime() - toSafeDate(b.date).getTime();
        case 'accuracyDesc': {
          const ap = confidenceToPct(a.ocrConfidence) ?? -1;
          const bp = confidenceToPct(b.ocrConfidence) ?? -1;
          return bp - ap;
        }
        case 'accuracyAsc': {
          const ap = confidenceToPct(a.ocrConfidence) ?? -1;
          const bp = confidenceToPct(b.ocrConfidence) ?? -1;
          return ap - bp;
        }
        case 'amountDesc':
          return b.amount - a.amount;
        case 'amountAsc':
          return a.amount - b.amount;
        case 'merchantAsc':
          return (a.merchant ?? '').localeCompare(b.merchant ?? '', undefined, { sensitivity: 'base' });
        case 'dateDesc':
        default:
          return toSafeDate(b.date).getTime() - toSafeDate(a.date).getTime();
      }
    });

    return sorted;
  }, [accuracyLevel, amountPreset, categoryId, dateRange, debouncedQuery, itemSearchIds, maxAmountText, minAmountText, ocrSearchIds, receipts, scanModeFilter, sortId, statusFilter, storeFilter]);

  const subtitle = useMemo(() => {
    const count = visibleReceipts.length;
    const pcts = visibleReceipts
      .map((r) => getAccuracyForDisplay(r).pct)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
    return `${count} receipt${count === 1 ? '' : 's'} • ${avg}% avg accuracy`;
  }, [visibleReceipts]);

  const categories = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of receipts) {
      const id = r.categoryId || 'unknown';
      const name = (r.categoryName ?? '').trim() || 'Uncategorized';
      if (!m.has(id)) m.set(id, name);
    }
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [receipts]);

  const stats = useMemo(() => {
    const totalAmount = visibleReceipts.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0);
    const processedCount = visibleReceipts.reduce((s, r) => s + (getProcessedState(r).processed ? 1 : 0), 0);
    const pcts = visibleReceipts
      .map((r) => getAccuracyForDisplay(r).pct)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    const avgAccuracy = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
    const highAccuracy = visibleReceipts.filter((r) => (confidenceToPct(r.ocrConfidence) ?? -1) >= 85).length;
    const mediumAccuracy = visibleReceipts.filter((r) => {
      const pct = confidenceToPct(r.ocrConfidence);
      return typeof pct === 'number' && pct >= 70 && pct < 85;
    }).length;
    const lowAccuracy = visibleReceipts.filter((r) => {
      const pct = confidenceToPct(r.ocrConfidence);
      return typeof pct === 'number' && pct < 70;
    }).length;
    const longReceipts = visibleReceipts.filter((r) => normalizeScanMode(r.scanMode, r.partCount) === 'long').length;
    const needsReview = visibleReceipts.filter((r) => {
      const pct = confidenceToPct(r.ocrConfidence);
      return typeof pct === 'number' ? pct < 85 : false;
    }).length;
    return {
      scanned: visibleReceipts.length,
      totalAmount,
      processed: processedCount,
      avgAccuracy,
      highAccuracy,
      mediumAccuracy,
      lowAccuracy,
      longReceipts,
      needsReview,
    };
  }, [visibleReceipts]);

  const confirmDeleteOne = useCallback(
    (id: string) => {
      Alert.alert('Delete receipt?', 'This action cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await Promise.allSettled([deleteReceiptSql(id), deleteReceiptAsync(id)]);
              await load();
            } finally {
              setLoading(false);
            }
          },
        },
      ]);
    },
    [load],
  );

  const openOcrEditor = useCallback(
    async (summary: ScannedReceiptSummary) => {
      try {
        setLoading(true);

        const [ocr, images] = await Promise.all([
          getLatestReceiptOcr(summary.id),
          getReceiptImagesByReceiptId(summary.id),
        ]);

        if (!ocr) {
          Alert.alert('No OCR found', 'This receipt does not have OCR text saved yet.');
          return;
        }

        const original = images.find((i) => i.imageType === 'original')?.filePath;
        const parts = images
          .filter((i) => i.imageType === 'part')
          .sort((a, b) => (a.partNumber ?? 0) - (b.partNumber ?? 0))
          .map((i) => i.filePath);

        const mode = normalizeScanMode(summary.scanMode, summary.partCount) ?? 'single';
        const primaryImageUri = original || parts[0] || summary.imageUri || '';
        const partImageUris = parts.length ? parts : primaryImageUri ? [primaryImageUri] : [];

        if (!primaryImageUri) {
          Alert.alert('Missing image', 'No receipt image is available to review OCR.');
          return;
        }

        navigation.navigate('ReceiptTextEditor', {
          source: mode,
          receiptId: summary.id,
          primaryImageUri,
          partImageUris,
          ocrTextOriginal: ocr.originalText ?? '',
          ocrTextInitial:
            (ocr.editedText && String(ocr.editedText).trim().length ? String(ocr.editedText) : ocr.originalText) ?? '',
          ocrRawJson: ocr.rawResultJson ?? undefined,
          ocrConfidence: typeof ocr.confidence === 'number' ? ocr.confidence : undefined,
          extracted: {},
        });
      } catch {
        Alert.alert('Error', 'Could not open the OCR editor.');
      } finally {
        setLoading(false);
      }
    },
    [navigation],
  );

  const goToScan = useCallback(() => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'BottomTabs', params: { screen: 'Scan' } } as any],
      }),
    );
  }, [navigation]);

  const goToTab = useCallback(
    (screen: 'Home' | 'Analytics' | 'Scan' | 'Calendar' | 'Profile') => {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'BottomTabs', params: { screen } } as any],
        }),
      );
    },
    [navigation],
  );

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const confirmDeleteSelected = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;

    Alert.alert(
      'Delete receipts?',
      `This will delete ${ids.length} receipt${ids.length === 1 ? '' : 's'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              for (const id of ids) {
                // Keep both stores in sync.
                await Promise.allSettled([deleteReceiptSql(id), deleteReceiptAsync(id)]);
              }
              exitSelectionMode();
              await load();
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }, [exitSelectionMode, load, selectedIds]);

  const clearFilters = useCallback(() => {
    setCategoryId('all');
    setStatusFilter('all');
    setStoreFilter('');
    setDateRangeId('all');
    setAmountPreset('none');
    setMinAmountText('');
    setMaxAmountText('');
    setAccuracyLevel('all');
    setScanModeFilter('all');
    setSortId('dateDesc');
  }, []);

  const renderReceiptCard = useCallback(
    (r: ScannedReceiptSummary, compact: boolean) => {
      const { processed, review, pending, hasOcr } = getProcessedState(r);
      const acc = getAccuracyForDisplay(r);
      const pct = acc.pct;
      const bucket = getAccuracyBucketFromPct(pct);

      const statusBg = processed
        ? COLORS.semantic.success
        : review
          ? COLORS.semantic.warning
          : isDark
            ? `${colors.text}22`
            : '#E5E7EB';
      const statusLabel = processed ? 'Processed' : review ? 'Review' : pending ? 'Pending' : 'Pending';

      const selected = selectedIds.has(r.id);

      const modeLabel = getScanModeLabel(r.scanMode, r.partCount);
      const isLong = normalizeScanMode(r.scanMode, r.partCount) === 'long';
      const lowAccuracy = typeof pct === 'number' ? pct < 70 : false;
      const showReviewBtn = hasOcr;

      const thumbUri = r.imageUri ? String(r.imageUri) : '';
      const barPct = typeof pct === 'number' ? pct : 0;
      const barColor =
        bucket === 'high'
          ? '#10b981'
          : bucket === 'medium'
            ? '#f59e0b'
            : bucket === 'low'
              ? '#ef4444'
              : colors.border;

      return (
        <Pressable
          key={r.id}
          onLongPress={() => {
            setSelectionMode(true);
            setSelectedIds((prev) => new Set(prev).add(r.id));
          }}
          onPress={() => {
            if (selectionMode) {
              toggleSelected(r.id);
              return;
            }
            navigation.navigate('ReceiptDetail', { receiptId: r.id });
          }}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Card style={[styles.receiptCard, compact && styles.receiptCardCompact]}>
            <View style={styles.receiptTopRow}>
              <View style={styles.thumbWrap}>
                {thumbUri ? (
                  <Image source={{ uri: thumbUri }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <Feather name={isLong ? 'link' : 'image'} size={16} color={colors.textSecondary} />
                  </View>
                )}
              </View>

              <View style={styles.receiptLeft}>
                <Text style={styles.receiptMerchant} numberOfLines={1}>
                  {r.merchant || 'Receipt'}
                </Text>
                <Text style={styles.receiptMeta} numberOfLines={1}>
                  {formatShortDate(r.date)}
                  {r.categoryName ? ` • ${r.categoryName}` : ''}
                  {typeof r.itemCount === 'number' && r.itemCount > 0
                    ? ` • ${r.itemCount} item${r.itemCount === 1 ? '' : 's'}`
                    : ''}
                </Text>

                <View style={styles.accuracyRow}>
                  <Text style={styles.accuracyLabel}>OCR</Text>
                  <Text style={styles.accuracyValue}>
                    {pct != null ? `${acc.estimated ? 'Est. ' : ''}${pct.toFixed(0)}%` : hasOcr ? 'Done' : '—'}
                  </Text>
                </View>
                <View style={styles.accuracyBarTrack}>
                  <View style={[styles.accuracyBarFill, { width: `${barPct}%`, backgroundColor: barColor }]} />
                </View>
                <Text style={styles.accuracyHint} numberOfLines={1}>
                  {hasOcr ? (acc.estimated ? 'Estimated accuracy' : `${getAccuracyIconForBucket(bucket)} ${getAccuracyLabelForBucket(bucket)}`) : 'No OCR yet'}
                </Text>

                <Text style={styles.scanModeText} numberOfLines={1}>
                  {isLong ? '🔗 ' : '📄 '}{modeLabel}
                </Text>
              </View>

              <View style={styles.receiptRight}>
                <Text style={styles.receiptAmount} numberOfLines={1}>
                  {formatCurrency(r.amount)}
                </Text>
                <View style={styles.receiptPillsRow}>
                  <View style={[styles.statusPill, { backgroundColor: statusBg }]} accessibilityLabel={statusLabel}>
                    <Text style={styles.statusPillText}>{statusLabel}</Text>
                  </View>

                  {selectionMode ? (
                    <View style={[styles.selectPill, selected && styles.selectPillSelected]}>
                      <Feather name={selected ? 'check-circle' : 'circle'} size={14} color={selected ? primary : colors.textSecondary} />
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {!selectionMode ? (
              <View style={styles.actionsRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="View receipt"
                  onPress={() => navigation.navigate('ReceiptDetail', { receiptId: r.id })}
                  style={({ pressed }) => [styles.actionBtnPrimary, pressed && styles.pressed]}
                >
                  <Text style={styles.actionBtnPrimaryText}>View</Text>
                </Pressable>

                {showReviewBtn ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Review & edit OCR"
                    onPress={() => void openOcrEditor(r)}
                    style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.actionBtnText}>{lowAccuracy ? 'Review OCR' : 'Review'}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit receipt"
                    onPress={() => navigation.navigate('ReceiptDetail', { receiptId: r.id })}
                    style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.actionBtnText}>Edit</Text>
                  </Pressable>
                )}

                {lowAccuracy ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Rescan receipt"
                    onPress={goToScan}
                    style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.actionBtnText}>Rescan</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete receipt"
                  onPress={() => confirmDeleteOne(r.id)}
                  style={({ pressed }) => [styles.actionBtnDanger, pressed && styles.pressed]}
                >
                  <Feather name="trash-2" size={14} color={COLORS.common.white} />
                </Pressable>
              </View>
            ) : null}
          </Card>
        </Pressable>
      );
    },
    [colors.border, colors.text, colors.textSecondary, confirmDeleteOne, goToScan, isDark, navigation, openOcrEditor, primary, selectedIds, selectionMode, styles, toggleSelected],
  );

  const listRenderItem: ListRenderItem<ScannedReceiptSummary> = useCallback(
    ({ item }) => renderReceiptCard(item, false),
    [renderReceiptCard],
  );

  const dateRangeLabel = useMemo(
    () => DATE_RANGES.find(d => d.id === dateRangeId)?.label ?? 'All Time',
    [dateRangeId],
  );

  const categoryLabel = useMemo(() => {
    if (categoryId === 'all') return 'All Categories';
    return categories.find(c => c.id === categoryId)?.name ?? 'All Categories';
  }, [categories, categoryId]);

  const sortLabel = useMemo(() => {
    switch (sortId) {
      case 'dateAsc':
        return 'Date (Oldest First)';
      case 'accuracyDesc':
        return 'Accuracy (High to Low)';
      case 'accuracyAsc':
        return 'Accuracy (Low to High)';
      case 'amountDesc':
        return 'Amount (High to Low)';
      case 'amountAsc':
        return 'Amount (Low to High)';
      case 'merchantAsc':
        return 'Merchant (A–Z)';
      case 'dateDesc':
      default:
        return 'Date (Newest First)';
    }
  }, [sortId]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LoadingOverlay visible={loading} message="Loading scanned receipts…" />

      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Feather name="arrow-left" size={ICON_SIZES.md} color={colors.text} />
        </Pressable>

        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Scanned Receipts</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>

        <View style={styles.headerActions}>
          <IconButton
            variant="ghost"
            size="md"
            accessibilityLabel="Toggle theme"
            onPress={toggleTheme}
            icon={<Feather name={isDark ? 'moon' : 'sun'} size={ICON_SIZES.md} color={colors.text} />}
          />

          <IconButton
            variant="ghost"
            size="md"
            accessibilityLabel="Scan a new receipt"
            onPress={goToScan}
            icon={<Feather name="plus" size={ICON_SIZES.md} color={colors.text} />}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.searchAndFilterRow}>
          <View style={styles.searchBox}>
            <Feather name="search" size={ICON_SIZES.md} color={colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search receipts, stores, or tags..."
              placeholderTextColor={colors.textSecondary}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.trim().length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setQuery('')}
                hitSlop={10}
                style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
              >
                <Feather name="x" size={ICON_SIZES.sm} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.filterBtnWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showFilters ? 'Hide filters' : 'Show filters'}
              onPress={() => setShowFilters(v => !v)}
              hitSlop={10}
              style={({ pressed }) => [styles.filterBtn, pressed && styles.pressed]}
            >
              <Feather name="filter" size={ICON_SIZES.md} color={COLORS.common.white} />
            </Pressable>
            {filterCount > 0 ? <Badge text={`${filterCount}`} variant="error" style={styles.filterBadgeInline} /> : null}
          </View>
        </View>

        {showFilters ? (
          <View style={styles.filtersPanel}>
            <Text style={styles.filtersLabelInline}>OCR Accuracy</Text>
            <View style={styles.segmentRow}>
              {([
                { id: 'all', label: 'All' },
                { id: 'high', label: 'High ≥85%' },
                { id: 'medium', label: 'Med ≥70%' },
                { id: 'low', label: 'Low <70%' },
              ] as const).map((o) => {
                const active = accuracyLevel === o.id;
                return (
                  <Pressable
                    key={o.id}
                    accessibilityRole="button"
                    accessibilityLabel={o.label}
                    onPress={() => setAccuracyLevel(o.id)}
                    style={({ pressed }) => [styles.segmentBtn, active && styles.segmentBtnActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.filtersLabelInline}>Scan Mode</Text>
            <View style={styles.segmentRow}>
              {([
                { id: 'all', label: 'All' },
                { id: 'single', label: 'Single' },
                { id: 'multi', label: 'Multi' },
                { id: 'long', label: 'Long' },
              ] as const).map((o) => {
                const active = scanModeFilter === o.id;
                return (
                  <Pressable
                    key={o.id}
                    accessibilityRole="button"
                    accessibilityLabel={o.label}
                    onPress={() => setScanModeFilter(o.id)}
                    style={({ pressed }) => [styles.segmentBtn, active && styles.segmentBtnActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.filtersLabelInline}>Category</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Category"
              onPress={() => {
                // Simple cycling fallback if user doesn't want a modal.
                // Keeping it deterministic and fast.
                const all = ['all', ...categories.map(c => c.id)];
                const idx = all.indexOf(categoryId);
                const next = all[(idx + 1) % all.length] ?? 'all';
                setCategoryId(next);
              }}
              style={({ pressed }) => [styles.dropdown, pressed && styles.pressed]}
            >
              <Text style={styles.dropdownText}>{categoryLabel}</Text>
              <Feather name="chevron-down" size={ICON_SIZES.sm} color={colors.textSecondary} />
            </Pressable>

            <Text style={styles.filtersLabelInline}>Status</Text>
            <View style={styles.segmentRow}>
              {([
                { id: 'all', label: 'All' },
                { id: 'processed', label: 'Processed' },
                { id: 'review', label: 'Review' },
                { id: 'pending', label: 'Pending' },
              ] as const).map((o) => {
                const active = statusFilter === o.id;
                return (
                  <Pressable
                    key={o.id}
                    accessibilityRole="button"
                    accessibilityLabel={o.label}
                    onPress={() => setStatusFilter(o.id)}
                    style={({ pressed }) => [styles.segmentBtn, active && styles.segmentBtnActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.filtersLabelInline}>Store / Merchant</Text>
            <View style={styles.textField}>
              <TextInput
                value={storeFilter}
                onChangeText={setStoreFilter}
                placeholder="Search by store name..."
                placeholderTextColor={colors.textSecondary}
                style={styles.textFieldInput}
                autoCorrect={false}
              />
            </View>

            <Text style={styles.filtersLabelInline}>Date Range</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Date Range"
              onPress={() => {
                const ids = DATE_RANGES.map(d => d.id);
                const idx = ids.indexOf(dateRangeId);
                const next = ids[(idx + 1) % ids.length] ?? 'all';
                setDateRangeId(next);
              }}
              style={({ pressed }) => [styles.dropdown, pressed && styles.pressed]}
            >
              <Text style={styles.dropdownText}>{dateRangeLabel}</Text>
              <Feather name="chevron-down" size={ICON_SIZES.sm} color={colors.textSecondary} />
            </Pressable>

            <Text style={styles.filtersLabelInline}>Amount Range</Text>
            <View style={styles.amountPresetRow}>
              {AMOUNT_PRESETS.map(p => {
                const active = amountPreset === p.id;
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    accessibilityLabel={p.label}
                    onPress={() => {
                      setAmountPreset(active ? 'none' : p.id);
                      setMinAmountText('');
                      setMaxAmountText('');
                    }}
                    style={({ pressed }) => [styles.amountChip, active && styles.amountChipActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.amountChipText, active && styles.amountChipTextActive]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.amountRow}>
              <View style={styles.amountCell}>
                <TextInput
                  value={minAmountText}
                  onChangeText={(t) => {
                    setAmountPreset('none');
                    setMinAmountText(t);
                  }}
                  placeholder="Min ($)"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  style={styles.amountInput}
                />
              </View>
              <View style={styles.amountCell}>
                <TextInput
                  value={maxAmountText}
                  onChangeText={(t) => {
                    setAmountPreset('none');
                    setMaxAmountText(t);
                  }}
                  placeholder="Max ($)"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  style={styles.amountInput}
                />
              </View>
            </View>

            <Text style={styles.filtersLabelInline}>Sort By</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sort By"
              onPress={() => {
                const ids: SortId[] = ['dateDesc', 'dateAsc', 'accuracyDesc', 'accuracyAsc', 'amountDesc', 'amountAsc', 'merchantAsc'];
                const idx = ids.indexOf(sortId);
                const next = ids[(idx + 1) % ids.length] ?? 'dateDesc';
                setSortId(next);
              }}
              style={({ pressed }) => [styles.dropdown, pressed && styles.pressed]}
            >
              <Text style={styles.dropdownText}>{sortLabel}</Text>
              <Feather name="chevron-down" size={ICON_SIZES.sm} color={colors.textSecondary} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear All Filters"
              onPress={clearFilters}
              style={({ pressed }) => [styles.clearAllBtn, pressed && styles.pressed]}
            >
              <Text style={styles.clearAllText}>Clear All Filters</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.statsHeaderRow}>
          <Text style={styles.statsHeaderTitle}>OCR Accuracy</Text>
          <Text style={styles.statsHeaderMeta}>
            {Math.round(stats.avgAccuracy)}% avg • {stats.needsReview} need review
          </Text>
        </View>

        <View style={styles.statsTilesRow}>
          <Card style={styles.tileCard}>
            <View style={[styles.tileIconCircle, { backgroundColor: isDark ? '#16A34A22' : '#E9FFF2' }]}>
              <Feather name="check-circle" size={22} color={COLORS.semantic.success} />
            </View>
            <Text style={styles.tileValue}>{stats.highAccuracy}</Text>
            <Text style={styles.tileLabel}>High</Text>
          </Card>

          <Card style={styles.tileCard}>
            <View style={[styles.tileIconCircle, { backgroundColor: isDark ? '#F59E0B22' : '#FFF7E6' }]}>
              <Feather name="alert-triangle" size={22} color={'#F59E0B'} />
            </View>
            <Text style={styles.tileValue}>{stats.mediumAccuracy}</Text>
            <Text style={styles.tileLabel}>Medium</Text>
          </Card>

          <Card style={styles.tileCard}>
            <View style={[styles.tileIconCircle, { backgroundColor: isDark ? '#EF444422' : '#FEECEC' }]}>
              <Feather name="x-circle" size={22} color={COLORS.semantic.error} />
            </View>
            <Text style={styles.tileValue}>{stats.lowAccuracy}</Text>
            <Text style={styles.tileLabel}>Low</Text>
          </Card>

          <Card style={styles.tileCard}>
            <View style={[styles.tileIconCircle, { backgroundColor: isDark ? '#6366F122' : '#EEF2FF' }]}>
              <Feather name="layers" size={22} color={'#6366F1'} />
            </View>
            <Text style={styles.tileValue}>{stats.longReceipts}</Text>
            <Text style={styles.tileLabel}>Long</Text>
          </Card>
        </View>

        <View style={{ height: SPACING.md }} />

        {visibleReceipts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No scanned receipts</Text>
            <Text style={styles.emptyBody}>Scan a receipt to see it here, then use filters to find it fast.</Text>
            <View style={{ height: SPACING.lg }} />
            <Button title="Refresh" onPress={load} variant="primary" />
          </View>
        ) : (
          <View style={styles.listWrap}>
            <FlatList
              data={visibleReceipts}
              keyExtractor={(item) => item.id}
              renderItem={listRenderItem}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: SPACING.md }} />}
            />
          </View>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      {selectionMode ? (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkText}>{selectedIds.size} selected</Text>
          <View style={styles.bulkActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete selected"
              onPress={confirmDeleteSelected}
              style={({ pressed }) => [styles.bulkBtnDanger, pressed && styles.pressed]}
            >
              <Feather name="trash-2" size={ICON_SIZES.sm} color={COLORS.common.white} />
              <Text style={styles.bulkBtnText}>Delete</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear selection"
              onPress={exitSelectionMode}
              style={({ pressed }) => [styles.bulkBtn, pressed && styles.pressed]}
            >
              <Text style={styles.bulkBtnTextSecondary}>Clear</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Bottom menu (tab-like navigation) */}
      <View style={styles.footer}>
        <View style={styles.bottomMenu}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Home"
            onPress={() => goToTab('Home')}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Feather name="home" size={18} color={colors.textSecondary} />
            <Text style={styles.menuLabel}>Home</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Analytics"
            onPress={() => goToTab('Analytics')}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Feather name="bar-chart-2" size={18} color={colors.textSecondary} />
            <Text style={styles.menuLabel}>Analytics</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan"
            onPress={() => goToTab('Scan')}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Feather name="camera" size={18} color={primary} />
            <Text style={[styles.menuLabel, { color: primary }]}>Scan</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Calendar"
            onPress={() => goToTab('Calendar')}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Feather name="calendar" size={18} color={colors.textSecondary} />
            <Text style={styles.menuLabel}>Calendar</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => goToTab('Profile')}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Feather name="settings" size={18} color={colors.textSecondary} />
            <Text style={styles.menuLabel}>Settings</Text>
          </Pressable>
        </View>
      </View>

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
    surfaceAlt?: string;
    text: string;
    textSecondary: string;
    border: string;
  };
  primary: string;
  isDark: boolean;
}) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
    },
    backBtn: {
      width: 42,
      height: 42,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    headerTitles: { flex: 1, paddingHorizontal: SPACING.md },
    headerTitle: { ...TYPOGRAPHY.pageTitle, color: colors.text },
    headerSubtitle: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: 2 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    filterBadgeInline: { position: 'absolute', top: -6, right: -6 },

    content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl + BOTTOM_MENU_HEIGHT },

    searchAndFilterRow: { marginTop: SPACING.sm, flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
    searchBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.xl,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      gap: SPACING.sm,
    },
    searchInput: {
      flex: 1,
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      paddingVertical: 0,
    },
    clearBtn: {
      width: 28,
      height: 28,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? `${colors.text}14` : '#F3F4F6',
    },

    filterBtnWrap: { position: 'relative' },
    filterBtn: {
      width: 46,
      height: 46,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: primary,
    },

    filtersPanel: {
      marginTop: SPACING.md,
      padding: SPACING.md,
      borderRadius: RADIUS.xl,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    filtersLabelInline: { ...TYPOGRAPHY.label, color: colors.textSecondary, marginTop: SPACING.sm, marginBottom: SPACING.xs },
    dropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      height: 52,
      borderRadius: RADIUS.xl,
      backgroundColor: isDark ? `${colors.text}10` : '#F3F4F6',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    dropdownText: { ...TYPOGRAPHY.bodyNormal, color: colors.text },

    segmentRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xs },
    segmentBtn: {
      flex: 1,
      height: 48,
      borderRadius: RADIUS.xl,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? `${colors.text}10` : '#F3F4F6',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    segmentBtnActive: {
      backgroundColor: primary,
      borderColor: primary,
    },
    segmentText: { ...TYPOGRAPHY.bodyLarge, color: colors.text, fontWeight: '700' },
    segmentTextActive: { color: COLORS.common.white },

    textField: {
      height: 52,
      borderRadius: RADIUS.xl,
      backgroundColor: isDark ? `${colors.text}10` : '#F3F4F6',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: SPACING.md,
      justifyContent: 'center',
    },
    textFieldInput: { ...TYPOGRAPHY.bodyNormal, color: colors.text, paddingVertical: 0 },

    amountPresetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
    amountChip: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? `${colors.text}10` : '#F3F4F6',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    amountChipActive: { backgroundColor: primary, borderColor: primary },
    amountChipText: { ...TYPOGRAPHY.label, color: colors.text, fontWeight: '700' },
    amountChipTextActive: { color: COLORS.common.white },

    amountRow: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md },
    amountCell: { flex: 1 },
    amountInput: {
      height: 52,
      borderRadius: RADIUS.xl,
      backgroundColor: isDark ? `${colors.text}10` : '#F3F4F6',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: SPACING.md,
      color: colors.text,
      ...TYPOGRAPHY.bodyNormal,
    },

    clearAllBtn: {
      height: 54,
      borderRadius: RADIUS.xl,
      backgroundColor: isDark ? `${colors.text}10` : '#F3F4F6',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING.lg,
    },
    clearAllText: { ...TYPOGRAPHY.bodyLarge, color: colors.text, fontWeight: '700' },

    statsHeaderRow: { marginTop: SPACING.lg, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    statsHeaderTitle: { ...TYPOGRAPHY.sectionHeading, color: colors.text },
    statsHeaderMeta: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },

    statsTilesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginTop: SPACING.md },
    tileCard: { flexGrow: 1, flexBasis: '48%', padding: SPACING.md, borderRadius: RADIUS.xl, alignItems: 'center' },
    tileIconCircle: { width: 54, height: 54, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
    tileValue: { ...TYPOGRAPHY.sectionHeading, color: colors.text, marginTop: SPACING.md, textAlign: 'center' },
    tileLabel: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },

    listWrap: { marginTop: SPACING.sm },

    receiptCard: {
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
    },
    receiptCardCompact: {
      padding: SPACING.sm,
    },
    receiptTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
    receiptLeft: { flex: 1 },
    receiptMerchant: { ...TYPOGRAPHY.cardTitle, color: colors.text },
    receiptMeta: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: 4 },
    receiptRight: { alignItems: 'flex-end' },
    receiptAmount: { ...TYPOGRAPHY.cardTitle, color: colors.text, fontWeight: '900' },
    receiptPillsRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 6 },

    thumbWrap: {
      width: 64,
      height: 64,
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
      backgroundColor: isDark ? `${colors.text}10` : '#F3F4F6',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    thumb: { width: '100%', height: '100%' },
    thumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    accuracyRow: { marginTop: SPACING.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    accuracyLabel: { ...TYPOGRAPHY.caption, color: colors.textSecondary, fontWeight: '800' },
    accuracyValue: { ...TYPOGRAPHY.caption, color: colors.text, fontWeight: '900' },
    accuracyBarTrack: {
      marginTop: 6,
      height: 8,
      borderRadius: RADIUS.full,
      overflow: 'hidden',
      backgroundColor: isDark ? `${colors.text}14` : '#E5E7EB',
    },
    accuracyBarFill: { height: '100%', borderRadius: RADIUS.full },
    accuracyHint: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: 6 },
    scanModeText: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: 2 },

    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
    actionBtnPrimary: {
      paddingHorizontal: SPACING.md,
      paddingVertical: 10,
      borderRadius: RADIUS.full,
      backgroundColor: primary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: primary,
    },
    actionBtnPrimaryText: { ...TYPOGRAPHY.label, color: COLORS.common.white, fontWeight: '900' },
    actionBtn: {
      paddingHorizontal: SPACING.md,
      paddingVertical: 10,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? `${colors.text}10` : '#F3F4F6',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    actionBtnText: { ...TYPOGRAPHY.label, color: colors.text, fontWeight: '900' },
    actionBtnDanger: {
      paddingHorizontal: SPACING.md,
      paddingVertical: 10,
      borderRadius: RADIUS.full,
      backgroundColor: COLORS.semantic.error,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.semantic.error,
    },
    actionBtnDangerText: { ...TYPOGRAPHY.label, color: COLORS.common.white, fontWeight: '900' },

    statusPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: RADIUS.full,
    },
    statusPillText: { ...TYPOGRAPHY.caption, color: COLORS.common.white, fontWeight: '800' },

    confidencePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? `${colors.text}14` : '#F3F4F6',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    confidenceText: { ...TYPOGRAPHY.caption, color: colors.textSecondary, fontWeight: '700' },

    selectPill: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? `${colors.text}14` : '#F3F4F6',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    selectPillSelected: {
      backgroundColor: `${primary}14`,
      borderColor: primary,
    },

    empty: { paddingVertical: SPACING.xl, paddingHorizontal: SPACING.md, alignItems: 'center' },
    emptyTitle: { ...TYPOGRAPHY.sectionHeading, color: colors.text, textAlign: 'center' },
    emptyBody: { ...TYPOGRAPHY.bodyNormal, color: colors.textSecondary, textAlign: 'center', marginTop: SPACING.sm },

    bulkBar: {
      position: 'absolute',
      left: SPACING.lg,
      right: SPACING.lg,
      bottom: SPACING.lg + BOTTOM_MENU_HEIGHT,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    footer: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    bottomMenu: {
      height: BOTTOM_MENU_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: RADIUS.xl,
      paddingHorizontal: SPACING.md,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    menuItem: {
      width: 62,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: RADIUS.lg,
    },
    menuItemPressed: {
      backgroundColor: `${primary}14`,
    },
    menuLabel: {
      marginTop: 4,
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      fontWeight: '700',
    },
    bulkText: { ...TYPOGRAPHY.bodyLarge, color: colors.text, fontWeight: '800' },
    bulkActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    bulkBtnDanger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      backgroundColor: COLORS.semantic.error,
      paddingHorizontal: SPACING.md,
      height: 38,
      borderRadius: RADIUS.full,
    },
    bulkBtn: {
      backgroundColor: isDark ? `${colors.text}14` : '#F3F4F6',
      paddingHorizontal: SPACING.md,
      height: 38,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    bulkBtnText: { ...TYPOGRAPHY.label, color: COLORS.common.white, fontWeight: '800' },
    bulkBtnTextSecondary: { ...TYPOGRAPHY.label, color: colors.text, fontWeight: '800' },

    pressed: { opacity: 0.85 },
  });

export default ScannedReceiptsScreen;
