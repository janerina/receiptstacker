import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { generatePDF } from 'react-native-html-to-pdf';

import { LoadingOverlay } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrency } from '@/utils/format';
import { listReceipts } from '@/utils/receiptStore';
import {
  buildReportDataFromReceipts,
  calculateSummary,
  getPeriodDescription,
  getPeriodUnit,
  type CategoryData,
  type MonthData,
  type ReportsPeriod,
  type ReceiptLike,
} from '@/utils/reportsAnalytics';

type Props = NativeStackScreenProps<MainStackParamList, 'Reports'>;

const ensureFileUri = (pathOrUri: string) => (pathOrUri.startsWith('file://') ? pathOrUri : `file://${pathOrUri}`);
const escapeCsv = (value: unknown) => {
  const raw = value == null ? '' : String(value);
  const needsQuotes = /[\n\r,"]/.test(raw);
  const escaped = raw.replaceAll('"', '""');
  return needsQuotes ? `"${escaped}"` : escaped;
};

const buildCsv = (period: ReportsPeriod, data: MonthData[]) => {
  const summary = calculateSummary(data);
  const lines = [
    `ReceiptStacker ${period} Report`,
    `Generated,${escapeCsv(new Date().toLocaleString())}`,
    '',
    'Summary',
    `Total Spending,${escapeCsv(formatCurrency(summary.totalSpending))}`,
    `Total Receipts,${summary.totalReceipts}`,
    `Average,${escapeCsv(formatCurrency(summary.avgSpending))} per ${getPeriodUnit(period)}`,
    `Top Category,${escapeCsv(summary.topCategory.name)} (${summary.topCategory.percentage.toFixed(0)}%)`,
    `Trend,${summary.trend.isPositive ? 'Increase' : 'Decrease'} ${summary.trend.percentage.toFixed(1)}%`,
    '',
    'Period,Spending,Receipts',
    ...data.map(row => `${escapeCsv(row.month)},${row.spending.toFixed(2)},${row.receipts}`),
  ];
  return lines.join('\n');
};

const buildPdfHtml = (period: ReportsPeriod, data: MonthData[]) => {
  const summary = calculateSummary(data);

  const rows = data
    .map(
      r => `
      <tr>
        <td>${escapeCsv(r.month)}</td>
        <td style="text-align:right; font-weight:700;">${formatCurrency(r.spending)}</td>
        <td style="text-align:right;">${r.receipts}</td>
      </tr>`,
    )
    .join('');

  return `
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body { font-family: -apple-system, Roboto, Arial, sans-serif; padding: 24px; color: #111827; }
        h1 { color: #3b82f6; margin: 0 0 6px; }
        .muted { color: #6b7280; font-size: 12px; margin-bottom: 18px; }
        .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
        .kpi { font-size: 28px; font-weight: 900; margin-top: 6px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; }
        td { padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
      </style>
    </head>
    <body>
      <h1>ReceiptStacker ${period} Report</h1>
      <div class="muted">Generated ${new Date().toLocaleString()}</div>
      <div class="card">
        <div style="font-size:12px; color:#6b7280; text-transform:uppercase; letter-spacing:0.06em;">Summary</div>
        <div class="kpi">${formatCurrency(summary.totalSpending)}</div>
        <div style="margin-top:10px; color:#374151; font-size:14px;">
          Total receipts: <b>${summary.totalReceipts}</b><br />
          Average: <b>${formatCurrency(summary.avgSpending)}</b> per ${getPeriodUnit(period)}<br />
          Top category: <b>${summary.topCategory.name}</b> (${summary.topCategory.percentage.toFixed(0)}%)
        </div>
      </div>
      <div class="card">
        <div style="font-size:14px; font-weight:800; margin-bottom:10px;">Spending Trend</div>
        <table>
          <thead>
            <tr><th>Period</th><th style="text-align:right;">Spending</th><th style="text-align:right;">Receipts</th></tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </body>
  </html>
  `.trim();
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const toDate = (value: Date | string | undefined): Date => {
  const d = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const weekdayLabel = (weekday: number) => {
  const labels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return labels[clamp(weekday, 0, 6)];
};

const rangeForPeriod = (period: ReportsPeriod, now: Date): { start: Date; end: Date } => {
  const end = now;
  if (period === 'Monthly') {
    const start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    return { start, end };
  }
  if (period === 'Quarterly') {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), (q - 3) * 3, 1);
    return { start, end };
  }
  const start = new Date(now.getFullYear() - 2, 0, 1);
  return { start, end };
};

const calculatePeakDay = (period: ReportsPeriod, receipts: ReceiptLike[], now: Date) => {
  const range = rangeForPeriod(period, now);
  const dayTotals = new Map<number, { total: number; count: number }>();

  receipts.forEach(r => {
    const d = toDate(r.date);
    if (d.getTime() < range.start.getTime() || d.getTime() > range.end.getTime()) return;
    const amount = Number.isFinite(Number(r.amount)) ? Number(r.amount) : 0;
    const day = d.getDay();
    const prev = dayTotals.get(day) ?? { total: 0, count: 0 };
    dayTotals.set(day, { total: prev.total + amount, count: prev.count + 1 });
  });

  const entries = Array.from(dayTotals.entries()).map(([day, v]) => ({ day, avg: v.count > 0 ? v.total / v.count : 0 }));
  const peak = entries.reduce((max, x) => (x.avg > max.avg ? x : max), entries[0] ?? { day: 5, avg: 0 });
  return { peakDayLabel: `${weekdayLabel(peak.day)}s`, peakDayAvg: peak.avg };
};

export const ReportsScreen = ({ navigation }: Props) => {
  const { colors, isDark, toggleTheme } = useTheme();
  const primary = COLORS.brand.primary;

  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<ReportsPeriod>('Monthly');
  const [receipts, setReceipts] = useState<ReceiptLike[]>([]);

  const styles = useMemo(() => createStyles({ colors, isDark, primary }), [colors, isDark, primary]);

  const hydrate = useCallback(async () => {
    try {
      setLoading(true);
      const stored = (await listReceipts()) as unknown as ReceiptLike[];
      setReceipts(stored ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const now = useMemo(() => new Date(), []);

  const reportData = useMemo(() => {
    return buildReportDataFromReceipts(period, receipts, now);
  }, [now, period, receipts]);

  const summary = useMemo(() => {
    const s = calculateSummary(reportData);
    if (receipts.length) {
      const peak = calculatePeakDay(period, receipts, now);
      return {
        ...s,
        habits: {
          ...s.habits,
          ...peak,
        },
      };
    }
    return s;
  }, [now, period, receipts, reportData]);

  const maxSpending = useMemo(() => Math.max(1, ...reportData.map(d => d.spending)), [reportData]);
  const latestCategories: CategoryData[] = useMemo(() => {
    const last = reportData[reportData.length - 1];
    return (last?.categories ?? []).slice().sort((a, b) => b.amount - a.amount);
  }, [reportData]);

  const exportToPDF = useCallback(async () => {
    try {
      const html = buildPdfHtml(period, reportData);
      const nameSafe = `ReceiptStacker_${period}_Report_${new Date().toISOString().slice(0, 10)}`;
      const pdf = await generatePDF({ html, fileName: nameSafe, base64: false });
      const filePath = pdf.filePath ? (pdf.filePath.startsWith('file://') ? pdf.filePath : `file://${pdf.filePath}`) : '';
      if (!filePath) {
        Alert.alert('Error', 'Failed to generate PDF');
        return;
      }
      await Share.open({ url: filePath, type: 'application/pdf' });
    } catch {
      Alert.alert('Error', 'Failed to export PDF');
    }
  }, [period, reportData]);

  const exportToCSV = useCallback(async () => {
    try {
      const csv = buildCsv(period, reportData);
      const exportDir = Platform.OS === 'android' ? RNFS.DownloadDirectoryPath : RNFS.DocumentDirectoryPath;
      const outPath = `${exportDir}/ReceiptStacker_${period}_Report_${new Date().toISOString().slice(0, 10)}.csv`;
      await RNFS.writeFile(outPath, csv, 'utf8');
      await Share.open({ url: ensureFileUri(outPath), type: 'text/csv' });
    } catch {
      Alert.alert('Error', 'Failed to export CSV');
    }
  }, [period, reportData]);

  const onPressDownload = useCallback(() => {
    Alert.alert('Export Report', 'Choose a format to export', [
      { text: 'PDF', onPress: exportToPDF },
      { text: 'CSV', onPress: exportToCSV },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [exportToCSV, exportToPDF]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.8 }]}
            >
              <Feather name="arrow-left" size={ICON_SIZES.md} color={colors.text} />
            </Pressable>

            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>Reports</Text>
              <Text style={styles.headerSubtitle}>Financial insights and analytics</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Toggle theme"
              onPress={toggleTheme}
              style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.8 }]}
            >
              <Feather
                name={isDark ? 'sun' : 'moon'}
                size={ICON_SIZES.md}
                color={isDark ? '#fbbf24' : colors.textSecondary}
              />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Download report"
              onPress={onPressDownload}
              style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.8 }]}
            >
              <Feather name="download" size={ICON_SIZES.md} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.segmented}>
            {(['Monthly', 'Quarterly', 'Yearly'] as const).map(p => {
              const active = period === p;
              return (
                <Pressable
                  key={p}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${p}`}
                  onPress={() => setPeriod(p)}
                  style={({ pressed }) => [
                    styles.segment,
                    active && styles.segmentActive,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text style={[styles.segmentText, active ? styles.segmentTextActive : undefined]}>{p}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.cardsGrid}>
            <View style={styles.summaryCard}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconSquare, styles.iconSquareBlue]}>
                  <Feather name="dollar-sign" size={16} color={styles._iconBlue.color as string} />
                </View>
                <Text style={styles.cardLabel}>Total Spending</Text>
              </View>
              <Text style={styles.cardValue}>{formatCurrency(summary.totalSpending)}</Text>
              <View style={styles.trendRow}>
                <Feather
                  name={summary.trend.isPositive ? 'trending-up' : 'trending-down'}
                  size={14}
                  color={summary.trend.isPositive ? colors.error : colors.success}
                />
                <Text
                  style={[
                    styles.trendText,
                    { color: summary.trend.isPositive ? colors.error : colors.success },
                  ]}
                >
                  {summary.trend.percentage.toFixed(1)}%
                </Text>
              </View>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconSquare, styles.iconSquareGreen]}>
                  <Feather name="file-text" size={16} color={styles._iconGreen.color as string} />
                </View>
                <Text style={styles.cardLabel}>Total Receipts</Text>
              </View>
              <Text style={styles.cardValue}>{summary.totalReceipts}</Text>
              <Text style={styles.cardSubtle}>{getPeriodDescription(period)}</Text>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconSquare, styles.iconSquarePurple]}>
                  <Feather name="bar-chart-2" size={16} color={styles._iconPurple.color as string} />
                </View>
                <Text style={styles.cardLabel}>Average</Text>
              </View>
              <Text style={styles.cardValue}>{formatCurrency(summary.avgSpending)}</Text>
              <Text style={styles.cardSubtle}>Per {getPeriodUnit(period)}</Text>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconSquare, styles.iconSquareOrange]}>
                  <Feather name="shopping-bag" size={16} color={styles._iconOrange.color as string} />
                </View>
                <Text style={styles.cardLabel}>Top Category</Text>
              </View>
              <Text style={styles.cardValue} numberOfLines={1}>
                {summary.topCategory.name}
              </Text>
              <Text style={styles.cardSubtle}>{summary.topCategory.percentage.toFixed(0)}% of spending</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Spending Trend</Text>
              <Feather name="bar-chart" size={18} color={colors.textSecondary} />
            </View>

            <View style={styles.trendList}>
              {reportData.map(item => {
                const pct = clamp((item.spending / maxSpending) * 100, 0, 100);
                return (
                  <View key={item.month} style={styles.trendItem}>
                    <View style={styles.trendItemTop}>
                      <Text style={styles.trendMonth}>{item.month}</Text>
                      <View style={styles.trendMetaRight}>
                        <Text style={styles.trendReceipts}>{item.receipts} receipts</Text>
                        <Text style={styles.trendAmount}>{formatCurrency(item.spending)}</Text>
                      </View>
                    </View>
                    <View style={styles.trendBarBg}>
                      <View style={[styles.trendBarFill, { width: `${pct}%` }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Category Breakdown</Text>
            {latestCategories.length ? (
              latestCategories.map(cat => (
                <View key={cat.name} style={styles.categoryRow}>
                  <View style={styles.categoryLeft}>
                    <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                    <Text style={styles.categoryName}>{cat.name}</Text>
                  </View>
                  <Text style={styles.categoryAmount}>{formatCurrency(cat.amount)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.sectionEmpty}>No category data for this period.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Key Insights</Text>

            <View style={styles.insightRow}>
              <View style={[styles.insightIcon, styles.insightIconBlue]}>
                <Feather name="trending-up" size={16} color={styles._iconBlue.color as string} />
              </View>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Spending Pattern</Text>
                <Text style={styles.insightText}>
                  Your spending is {summary.trend.isPositive ? 'increasing' : 'decreasing'} by{' '}
                  {summary.trend.percentage.toFixed(1)}% compared to last period
                </Text>
              </View>
            </View>

            <View style={styles.insightRow}>
              <View style={[styles.insightIcon, styles.insightIconGreen]}>
                <Feather name="bar-chart" size={16} color={styles._iconGreen.color as string} />
              </View>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Top Categories</Text>
                {latestCategories.slice(0, 3).map(c => (
                  <Text key={c.name} style={styles.insightBullet}>
                    • {c.name}: {c.percentage?.toFixed(0) ?? '0'}% of total spending
                  </Text>
                ))}
              </View>
            </View>

            <View style={styles.insightRow}>
              <View style={[styles.insightIcon, styles.insightIconPurple]}>
                <Feather name="calendar" size={16} color={styles._iconPurple.color as string} />
              </View>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Spending Habits</Text>
                <Text style={styles.insightBullet}>
                  • Most receipts in {summary.habits.mostReceiptsLabel} ({summary.habits.mostReceiptsCount})
                </Text>
                <Text style={styles.insightBullet}>
                  • Highest spending in {summary.habits.highestSpendLabel} ({formatCurrency(summary.habits.highestSpendAmount)})
                </Text>
                <Text style={styles.insightBullet}>
                  • Peak spending day: {summary.habits.peakDayLabel} ({formatCurrency(summary.habits.peakDayAvg)} avg)
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.exportRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export PDF"
              onPress={exportToPDF}
              style={({ pressed }) => [styles.exportBtn, pressed && { opacity: 0.9 }]}
            >
              <View style={[styles.exportIcon, styles.iconSquareBlue]}>
                <Feather name="download" size={18} color={styles._iconBlue.color as string} />
              </View>
              <Text style={styles.exportText}>Export PDF</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export CSV"
              onPress={exportToCSV}
              style={({ pressed }) => [styles.exportBtn, pressed && { opacity: 0.9 }]}
            >
              <View style={[styles.exportIcon, styles.iconSquareGreen]}>
                <Feather name="download" size={18} color={styles._iconGreen.color as string} />
              </View>
              <Text style={styles.exportText}>Export CSV</Text>
            </Pressable>
          </View>
        </ScrollView>

        <LoadingOverlay visible={loading} message="Loading…" />
      </View>
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
  isDark,
}: {
  colors: any;
  isDark: boolean;
  primary: string;
}) => {
  const segmentedBg = isDark ? '#121B2A' : '#E9EFF7';
  const cardBg = colors.surface;

  const shadow = isDark
    ? {
        shadowColor: COLORS.black,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 18,
        elevation: 6,
      }
    : {
        shadowColor: COLORS.black,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 2,
      };

  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, backgroundColor: colors.background },

    header: {
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.lg,
    },
    headerTop: { flexDirection: 'row', alignItems: 'center' },
    iconButton: { padding: 8, borderRadius: 999 },
    headerTextWrap: { flex: 1, marginLeft: 12 },
    headerTitle: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    headerSubtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: 2,
    },

    scrollContent: { paddingBottom: 28 },

    segmented: {
      marginHorizontal: SPACING.xl,
      marginBottom: SPACING.xl,
      backgroundColor: segmentedBg,
      borderRadius: 16,
      padding: 6,
      flexDirection: 'row',
    },
    segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14 },
    segmentActive: { backgroundColor: colors.primary },
    segmentText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
    segmentTextActive: { color: COLORS.white },

    cardsGrid: {
      paddingHorizontal: SPACING.xl,
      gap: 14,
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: SPACING.xl,
    },
    summaryCard: {
      width: '48%',
      backgroundColor: cardBg,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      ...shadow,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    iconSquare: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    iconSquareBlue: { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.20)' : '#DBEAFE' },
    iconSquareGreen: { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.20)' : '#D1FAE5' },
    iconSquarePurple: { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.20)' : '#EDE9FE' },
    iconSquareOrange: { backgroundColor: isDark ? 'rgba(249, 115, 22, 0.20)' : '#FED7AA' },
    _iconBlue: { color: isDark ? '#60A5FA' : '#2563EB' },
    _iconGreen: { color: isDark ? '#34D399' : '#059669' },
    _iconPurple: { color: isDark ? '#A78BFA' : '#7C3AED' },
    _iconOrange: { color: isDark ? '#FB923C' : '#EA580C' },

    cardLabel: { ...TYPOGRAPHY.caption, color: colors.textSecondary, fontWeight: '700' },
    cardValue: { color: colors.text, fontSize: 24, fontWeight: '900' },
    cardSubtle: { ...TYPOGRAPHY.caption, color: colors.textSecondary, marginTop: 4 },

    trendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    trendText: { fontSize: 13, fontWeight: '900' },

    sectionCard: {
      marginHorizontal: SPACING.xl,
      marginBottom: SPACING.xl,
      backgroundColor: cardBg,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      ...shadow,
    },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
    sectionEmpty: { ...TYPOGRAPHY.caption, color: colors.textSecondary, marginTop: 8 },

    trendList: { gap: 16, marginTop: 6 },
    trendItem: { gap: 10 },
    trendItemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    trendMonth: { color: colors.text, fontSize: 16, fontWeight: '800' },
    trendMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    trendReceipts: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
    trendAmount: { color: colors.text, fontSize: 16, fontWeight: '900' },
    trendBarBg: { height: 10, borderRadius: 999, overflow: 'hidden', backgroundColor: isDark ? '#1A2536' : '#E6EDF6' },
    trendBarFill: { height: '100%', borderRadius: 999, backgroundColor: colors.primary },

    categoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
    categoryLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    categoryDot: { width: 12, height: 12, borderRadius: 6 },
    categoryName: { color: colors.text, fontSize: 15, fontWeight: '700' },
    categoryAmount: { color: colors.text, fontSize: 15, fontWeight: '900' },

    insightRow: { flexDirection: 'row', gap: 14, marginTop: 14 },
    insightIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    insightIconBlue: { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.20)' : '#DBEAFE' },
    insightIconGreen: { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.20)' : '#D1FAE5' },
    insightIconPurple: { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.20)' : '#EDE9FE' },
    insightContent: { flex: 1 },
    insightTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 6 },
    insightText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: '600' },
    insightBullet: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: '600', marginTop: 2 },

    exportRow: { flexDirection: 'row', gap: 12, paddingHorizontal: SPACING.xl, paddingBottom: 8 },
    exportBtn: {
      flex: 1,
      backgroundColor: cardBg,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      ...shadow,
    },
    exportIcon: { width: 42, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    exportText: { color: colors.text, fontSize: 15, fontWeight: '900' },
  });
};

export default ReportsScreen;
