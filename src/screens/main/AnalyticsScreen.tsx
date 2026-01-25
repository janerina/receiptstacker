import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import { LineChart, PieChart } from 'react-native-chart-kit';

import { Button, Card, Chip } from '@/components/common';
import { Header, LoadingOverlay } from '@/components/compositions';
import { DatePickerModal } from '@/components/modals/DatePickerModal';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { BottomTabParamList, MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { abbreviateNumber, formatCurrency } from '@/utils/format';
import { listReceipts } from '@/utils/receiptStore';

type Props = CompositeScreenProps<
  BottomTabScreenProps<BottomTabParamList, 'Analytics'>,
  NativeStackScreenProps<MainStackParamList, 'BottomTabs'>
>;

type Period = 'week' | 'month' | 'quarter' | 'year' | 'custom';

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

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

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
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;

  const [selectedPeriod, setSelectedPeriod] = useState<Period>('month');
  const [customDateRange, setCustomDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);

  const [customPickerVisible, setCustomPickerVisible] = useState(false);
  const [exportInfoVisible, setExportInfoVisible] = useState(false);
  const [customTempStart, setCustomTempStart] = useState<Date>(new Date());
  const [customTempEnd, setCustomTempEnd] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [analytics, setAnalytics] = useState<AnalyticsState>({
    total: 0,
    change: 0,
    lineChartData: { labels: [], datasets: [{ data: [] }] },
    pieChartData: [],
    categoryBreakdown: [],
    topMerchants: [],
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

  const calculateAnalytics = useCallback(
    (filtered: Receipt[], previous: Receipt[], range: { start: Date; end: Date }) => {
      const total = filtered.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0), 0);
      const prevTotal = previous.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0), 0);

      const change = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : total > 0 ? 100 : 0;

      const lineChartData = generateLineChartData(filtered, selectedPeriod, range);

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
        change,
        lineChartData,
        pieChartData,
        categoryBreakdown,
        topMerchants,
      });
    },
    [colors.textSecondary, primary, selectedPeriod],
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

      const range = getPeriodRange(selectedPeriod, customDateRange);
      const filtered = filterByRange(all, range);

      const prevRange = shiftRangeBack(range);
      const prevFiltered = filterByRange(all, prevRange);

      setReceipts(filtered);
      calculateAnalytics(filtered, prevFiltered, range);

      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    } catch (e) {
      console.error('Error loading receipts:', e);
      setReceipts([]);
      setAnalytics({
        total: 0,
        change: 0,
        lineChartData: { labels: [], datasets: [{ data: [] }] },
        pieChartData: [],
        categoryBreakdown: [],
        topMerchants: [],
      });
    } finally {
      setLoading(false);
    }
  }, [calculateAnalytics, customDateRange, fadeAnim, selectedPeriod]);

  useEffect(() => {
    loadReceipts().catch(() => undefined);
  }, [loadReceipts]);

  const handlePeriodChange = (period: Period) => {
    setSelectedPeriod(period);
    if (period === 'custom') {
      const now = new Date();
      const start = customDateRange?.start ?? addDays(now, -29);
      const end = customDateRange?.end ?? now;
      setCustomTempStart(start);
      setCustomTempEnd(end);
      setCustomPickerVisible(true);
    }
  };

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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title="Analytics" onBack={() => navigation.goBack()} showBackButton />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Period selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodRow}>
          {(
            [
              { key: 'week', label: 'Week' },
              { key: 'month', label: 'Month' },
              { key: 'quarter', label: 'Quarter' },
              { key: 'year', label: 'Year' },
              { key: 'custom', label: 'Custom' },
            ] as const
          ).map(p => (
            <Chip
              key={p.key}
              label={p.label}
              selected={selectedPeriod === p.key}
              onPress={() => handlePeriodChange(p.key)}
              style={styles.periodChip}
              accessibilityLabel={`Select ${p.label}`}
            />
          ))}
        </ScrollView>

        {/* Total spending */}
        <Card variant="glassmorphism" style={styles.totalCard}>
          <LinearGradient
            colors={[`rgba(59, 130, 246, 0.16)`, `rgba(37, 99, 235, 0.08)`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <Text style={styles.totalLabel}>Total Spending</Text>
          <Text style={styles.totalAmount}>{formatCurrency(analytics.total)}</Text>
          <View style={styles.changeRow}>
            <Feather
              name={changeIsUp ? 'trending-up' : 'trending-down'}
              size={ICON_SIZES.sm}
              color={changeColor}
              style={styles.changeIcon}
            />
            <Text style={[styles.changeText, { color: changeColor }]} numberOfLines={1}>
              {`${changeIsUp ? '↑' : '↓'} ${Math.abs(analytics.change).toFixed(0)}% from previous period`}
            </Text>
          </View>
        </Card>

        {/* Spending Over Time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spending Over Time</Text>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] }}>
            <Card variant="default" style={styles.chartCard}>
              {hasData ? (
                <LineChart
                  data={analytics.lineChartData}
                  width={screenWidth - SPACING.lg * 2}
                  height={220}
                  withShadow
                  withInnerLines={false}
                  withOuterLines={false}
                  bezier
                  chartConfig={chartConfig}
                  style={styles.chart}
                  formatYLabel={(v) => {
                    const num = Number(v);
                    if (!Number.isFinite(num)) return '';
                    return `$${abbreviateNumber(num)}`;
                  }}
                />
              ) : (
                <View style={styles.emptyChart}>
                  <Text style={styles.emptyText}>No receipts in this period</Text>
                </View>
              )}
            </Card>
          </Animated.View>
        </View>

        {/* By Category */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By Category</Text>
          <Animated.View style={{ opacity: fadeAnim }}>
            <Card variant="default" style={styles.chartCard}>
              {hasData && analytics.pieChartData.length ? (
                <PieChart
                  data={analytics.pieChartData}
                  width={screenWidth - SPACING.lg * 2}
                  height={200}
                  accessor="population"
                  backgroundColor="transparent"
                  paddingLeft="10"
                  absolute
                  chartConfig={chartConfig}
                  style={styles.chart}
                />
              ) : (
                <View style={styles.emptyChart}>
                  <Text style={styles.emptyText}>No category data</Text>
                </View>
              )}
            </Card>
          </Animated.View>
        </View>

        {/* Category Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Category Breakdown</Text>

          {analytics.categoryBreakdown.length ? (
            analytics.categoryBreakdown.map(item => {
              const pct = clamp(item.percentage, 0, 100);
              return (
                <Card key={item.name} variant="default" style={styles.breakdownCard}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.breakdownRight} numberOfLines={1}>
                      {pct}%  {formatCurrency(item.amount)}
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: item.color }]} />
                  </View>
                </Card>
              );
            })
          ) : (
            <Card variant="default" style={styles.breakdownCard}>
              <Text style={styles.emptyText}>No breakdown available</Text>
            </Card>
          )}
        </View>

        {/* Top Merchants */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Merchants</Text>
          <Card variant="default" style={styles.merchantsCard}>
            {analytics.topMerchants.length ? (
              analytics.topMerchants.map((m, idx) => (
                <View key={m.name} style={styles.merchantRow}>
                  <Text style={styles.merchantRank}>{idx + 1}.</Text>
                  <Text style={styles.merchantName} numberOfLines={1}>
                    {m.name}
                  </Text>
                  <Text style={styles.merchantAmount}>{formatCurrency(m.amount)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No merchants yet</Text>
            )}
          </Card>

          <Button
            title="Export"
            onPress={() => {
              // Optional feature: exporting charts as images.
              // Kept as a placeholder to avoid adding view-shot deps.
              setExportInfoVisible(true);
            }}
            variant="outline"
            icon={<Feather name="share" size={ICON_SIZES.sm} color={primary} />}
            fullWidth
            style={styles.exportBtn}
          />
        </View>
      </ScrollView>

      <LoadingOverlay visible={loading} />

      {/* Custom range modal */}
      <Modal
        isVisible={customPickerVisible}
        onBackdropPress={() => setCustomPickerVisible(false)}
        onBackButtonPress={() => setCustomPickerVisible(false)}
        backdropOpacity={0.5}
        useNativeDriver
      >
        <Card variant="default" style={styles.customModalCard}>
          <Text style={styles.customModalTitle}>Custom Range</Text>

          <View style={styles.customRow}>
            <Text style={styles.customLabel}>Start</Text>
            <Button title={customTempStart.toDateString()} onPress={() => setShowStartPicker(true)} variant="secondary" />
          </View>

          <View style={styles.customRow}>
            <Text style={styles.customLabel}>End</Text>
            <Button title={customTempEnd.toDateString()} onPress={() => setShowEndPicker(true)} variant="secondary" />
          </View>

          <View style={styles.customActions}>
            <Button
              title="Cancel"
              onPress={() => {
                setCustomPickerVisible(false);
                if (selectedPeriod === 'custom' && !customDateRange) {
                  setSelectedPeriod('month');
                }
              }}
              variant="outline"
              style={styles.customActionLeft}
            />
            <Button
              title="Apply"
              onPress={() => {
                const start = startOfDay(customTempStart);
                const end = endOfDay(customTempEnd);
                if (start.getTime() > end.getTime()) {
                  // swap
                  setCustomDateRange({ start: end, end: start });
                } else {
                  setCustomDateRange({ start, end });
                }
                setSelectedPeriod('custom');
                setCustomPickerVisible(false);
              }}
              variant="primary"
              style={styles.customActionRight}
            />
          </View>
        </Card>
      </Modal>

      <Modal
        isVisible={exportInfoVisible}
        onBackdropPress={() => setExportInfoVisible(false)}
        onBackButtonPress={() => setExportInfoVisible(false)}
        backdropOpacity={0.5}
        useNativeDriver
      >
        <Card variant="default" style={styles.customModalCard}>
          <Text style={styles.customModalTitle}>Export</Text>
          <Text style={styles.emptyText}>
            Image export is optional and not enabled yet. If you want, I can add chart image export using view-capture.
          </Text>
          <View style={styles.customActions}>
            <Button title="Close" onPress={() => setExportInfoVisible(false)} variant="secondary" fullWidth />
          </View>
        </Card>
      </Modal>

      <DatePickerModal
        visible={showStartPicker}
        initialDate={customTempStart}
        onConfirm={(d: Date) => {
          setCustomTempStart(d);
          setShowStartPicker(false);
        }}
        onClose={() => setShowStartPicker(false)}
      />

      <DatePickerModal
        visible={showEndPicker}
        initialDate={customTempEnd}
        onConfirm={(d: Date) => {
          setCustomTempEnd(d);
          setShowEndPicker(false);
        }}
        onClose={() => setShowEndPicker(false)}
      />
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
  primary,
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
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingBottom: SPACING.xl,
    },

    periodRow: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.lg,
    },
    periodChip: {
      marginRight: SPACING.sm,
    },

    totalCard: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
      padding: SPACING.lg,
      borderRadius: RADIUS.xl,
    },
    totalLabel: {
      ...TYPOGRAPHY.label,
      color: colors.textSecondary,
    },
    totalAmount: {
      fontSize: 28,
      fontWeight: '600',
      color: primary,
      marginTop: SPACING.sm,
    } satisfies TextStyle,
    changeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACING.sm,
    },
    changeIcon: {
      marginRight: SPACING.xs,
    },
    changeText: {
      ...TYPOGRAPHY.caption,
      fontWeight: '600',
    } satisfies TextStyle,

    section: {
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    sectionTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
      marginBottom: SPACING.md,
    },

    chartCard: {
      padding: SPACING.md,
    },
    chart: {
      borderRadius: RADIUS.lg,
    },
    emptyChart: {
      height: 220,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      textAlign: 'center',
    },

    breakdownCard: {
      padding: SPACING.md,
      marginBottom: SPACING.sm,
    },
    breakdownRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    breakdownName: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      flex: 1,
      paddingRight: SPACING.md,
    },
    breakdownRight: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      fontWeight: '700',
    } satisfies TextStyle,
    progressTrack: {
      height: 6,
      borderRadius: RADIUS.full,
      backgroundColor: colors.disabled,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: RADIUS.full,
    } satisfies ViewStyle,

    merchantsCard: {
      padding: SPACING.md,
    },
    merchantRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    merchantRank: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      fontWeight: '800',
      width: 28,
    } satisfies TextStyle,
    merchantName: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      flex: 1,
      paddingRight: SPACING.md,
    },
    merchantAmount: {
      ...TYPOGRAPHY.bodySmall,
      color: primary,
      fontWeight: '800',
    } satisfies TextStyle,

    exportBtn: {
      marginTop: SPACING.md,
    },

    customModalCard: {
      padding: SPACING.lg,
    },
    customModalTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },
    customRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    customLabel: {
      ...TYPOGRAPHY.label,
      color: colors.textSecondary,
      paddingRight: SPACING.md,
      flex: 1,
    },
    customActions: {
      flexDirection: 'row',
      marginTop: SPACING.md,
    },
    customActionLeft: {
      flex: 1,
      marginRight: SPACING.sm,
    } satisfies ViewStyle,
    customActionRight: {
      flex: 1,
      marginLeft: SPACING.sm,
    } satisfies ViewStyle,
  });

export default AnalyticsScreen;
