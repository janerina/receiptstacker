import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';

import { Card } from '@/components/common';
import { LoadingOverlay } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrency } from '@/utils/format';
import { listReceipts } from '@/utils/receiptStore';

type Props = NativeStackScreenProps<MainStackParamList, 'Reports'>;

type Period = 'monthly' | 'quarterly' | 'yearly';

type Receipt = {
  id: string;
  merchant: string;
  amount: number;
  date: Date | string;
  category: string;
  categoryId: string;
  categoryColor?: string;
};

const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  groceries: '#10b981',
  food: '#f97316',
  shopping: '#a855f7',
  transport: '#3b82f6',
  utilities: '#f59e0b',
  entertainment: '#ec4899',
  misc: '#64748b',
};

const toDate = (value: Date | string): Date => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const monthLabelLong = (d: Date) => {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
  } catch {
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
};

const monthLabelShort = (d: Date) => {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d);
  } catch {
    return d.toLocaleDateString('en-US', { month: 'short' });
  }
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

const rangeForPeriod = (period: Period, now: Date): { start: Date; end: Date } => {
  if (period === 'monthly') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) };
  }
  if (period === 'quarterly') {
    const q = Math.floor(now.getMonth() / 3);
    return { start: new Date(now.getFullYear(), q * 3, 1), end: endOfDay(now) };
  }
  return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(now) };
};

const previousRange = (period: Period, range: { start: Date; end: Date }): { start: Date; end: Date } => {
  if (period === 'monthly') {
    const prev = new Date(range.start.getFullYear(), range.start.getMonth() - 1, 1);
    return { start: prev, end: endOfDay(new Date(prev.getFullYear(), prev.getMonth() + 1, 0)) };
  }
  if (period === 'quarterly') {
    const prev = new Date(range.start.getFullYear(), range.start.getMonth() - 3, 1);
    return { start: prev, end: endOfDay(new Date(prev.getFullYear(), prev.getMonth() + 3, 0)) };
  }
  const prevYear = new Date(range.start.getFullYear() - 1, 0, 1);
  return { start: prevYear, end: endOfDay(new Date(prevYear.getFullYear(), 11, 31)) };
};

const inRange = (r: Receipt, start: Date, end: Date) => {
  const t = toDate(r.date).getTime();
  return t >= start.getTime() && t <= end.getTime();
};

const categoryColorFor = (r: Receipt) => {
  const explicit = (r.categoryColor ?? '').trim();
  if (explicit) return explicit;
  const id = (r.categoryId ?? '').trim();
  if (id && DEFAULT_CATEGORY_COLORS[id]) return DEFAULT_CATEGORY_COLORS[id];
  return COLORS.brand.primary;
};

const groupBy = <T, K extends string>(items: T[], getKey: (t: T) => K) => {
  const map = new Map<K, T[]>();
  items.forEach(item => {
    const key = getKey(item);
    const existing = map.get(key);
    if (existing) existing.push(item);
    else map.set(key, [item]);
  });
  return map;
};

export const ReportsInsightsScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('monthly');
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  const styles = useMemo(() => createStyles({ colors }), [colors]);

  const hydrate = useCallback(async () => {
    try {
      setLoading(true);
      const stored = (await listReceipts()) as unknown as Receipt[];
      setReceipts(stored ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => rangeForPeriod(period, now), [now, period]);
  const prev = useMemo(() => previousRange(period, range), [period, range]);

  const periodReceipts = useMemo(
    () => receipts.filter(r => inRange(r, range.start, range.end)),
    [receipts, range.end, range.start],
  );

  const prevReceipts = useMemo(
    () => receipts.filter(r => inRange(r, prev.start, prev.end)),
    [prev.end, prev.start, receipts],
  );

  const periodTotal = useMemo(() => periodReceipts.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0), [periodReceipts]);
  const prevTotal = useMemo(() => prevReceipts.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0), [prevReceipts]);

  const periodCount = periodReceipts.length;
  const prevCount = prevReceipts.length;

  const pctChange = (current: number, previous: number): number => {
    if (!Number.isFinite(previous) || previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
  };

  const spendChangePct = useMemo(() => pctChange(periodTotal, prevTotal), [periodTotal, prevTotal]);
  const countChangePct = useMemo(() => pctChange(periodCount, prevCount), [periodCount, prevCount]);

  // Avg Monthly: average over the last 6 full months (including current month-to-date).
  const avgMonthly = useMemo(() => {
    const months: Array<{ start: Date; end: Date }> = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = endOfDay(i === 0 ? now : new Date(d.getFullYear(), d.getMonth() + 1, 0));
      months.push({ start, end });
    }

    const totals = months.map(m => receipts.filter(r => inRange(r, m.start, m.end)).reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0));
    return sum(totals) / totals.length;
  }, [now, receipts]);

  const spendingTrend = useMemo(() => {
    // Last 7 months including current.
    const months: Array<{ month: Date; start: Date; end: Date }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        month: d,
        start: new Date(d.getFullYear(), d.getMonth(), 1),
        end: endOfDay(i === 0 ? now : new Date(d.getFullYear(), d.getMonth() + 1, 0)),
      });
    }

    const windowReceipts = months.flatMap(m => receipts.filter(r => inRange(r, m.start, m.end)));
    const byCategory = groupBy(windowReceipts, r => (r.categoryId || r.category || 'misc') as string);
    const categoryTotals = Array.from(byCategory.entries())
      .map(([id, list]) => ({
        id,
        total: list.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0),
        color: categoryColorFor(list[0] as Receipt),
      }))
      .sort((a, b) => b.total - a.total);

    const top = categoryTotals.slice(0, 5);

    const rows = months.map(m => {
      const monthReceipts = receipts.filter(r => inRange(r, m.start, m.end));
      const total = monthReceipts.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0);

      const monthByCat = groupBy(monthReceipts, r => (r.categoryId || r.category || 'misc') as string);

      const segments = top
        .map(c => {
          const items = monthByCat.get(c.id) ?? [];
          const amt = items.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0);
          return { id: c.id, amount: amt, color: c.color };
        })
        .filter(s => s.amount > 0);

      const shownTotal = segments.reduce((s, seg) => s + seg.amount, 0);
      const other = Math.max(0, total - shownTotal);
      if (other > 0) segments.push({ id: 'other', amount: other, color: colors.surface });

      return {
        key: `${m.month.getFullYear()}-${m.month.getMonth()}`,
        label: monthLabelShort(m.month),
        total,
        segments,
      };
    });

    return rows;
  }, [colors.surface, now, receipts]);

  const categoryBreakdown = useMemo(() => {
    const byCategory = groupBy(periodReceipts, r => (r.category || 'Uncategorized') as string);
    const rows = Array.from(byCategory.entries())
      .map(([name, list]) => {
        const total = list.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0);
        const color = categoryColorFor(list[0] as Receipt);
        return { name, total, color };
      })
      .sort((a, b) => b.total - a.total);

    const grand = rows.reduce((s, r) => s + r.total, 0);
    return rows.slice(0, 6).map(r => ({
      ...r,
      pct: grand > 0 ? (r.total / grand) * 100 : 0,
    }));
  }, [periodReceipts]);

  const topMerchants = useMemo(() => {
    const byMerchant = groupBy(periodReceipts, r => (r.merchant || 'Unknown') as string);
    const rows = Array.from(byMerchant.entries())
      .map(([name, list]) => ({
        name,
        visits: list.length,
        total: list.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);

    return rows;
  }, [periodReceipts]);

  const smartInsights = useMemo(() => {
    const bullets: string[] = [];

    const spendAbs = Math.abs(spendChangePct);
    if (periodTotal > 0 && prevTotal > 0) {
      bullets.push(`You spent ${spendAbs.toFixed(0)}% ${spendChangePct >= 0 ? 'more' : 'less'} this period`);
    }

    if (categoryBreakdown.length > 0) {
      const top = categoryBreakdown[0];
      bullets.push(`${top.name} is your biggest category (${top.pct.toFixed(1)}%)`);
    }

    if (periodCount > 0) {
      bullets.push(`Your average receipt value is ${formatCurrency(periodTotal / periodCount)}`);
    }

    if (periodReceipts.length > 0) {
      const byDow = groupBy(periodReceipts, r => {
        const d = toDate(r.date);
        return d.toLocaleDateString('en-US', { weekday: 'long' }) as string;
      });
      const topDow = Array.from(byDow.entries())
        .map(([dow, list]) => ({ dow, total: list.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0) }))
        .sort((a, b) => b.total - a.total)[0];
      if (topDow) bullets.push(`Peak spending day: ${topDow.dow} (${formatCurrency(topDow.total)} total)`);
    }

    return bullets.slice(0, 4);
  }, [categoryBreakdown, periodCount, periodReceipts, periodTotal, prevTotal, spendChangePct]);

  const onBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('BottomTabs');
  }, [navigation]);

  const onDownload = useCallback(() => {
    // Placeholder action to match UI. Hook into report export later.
    // eslint-disable-next-line no-console
    console.log('Download report');
  }, []);

  const segmented = (
    <View style={styles.segmentedWrap}>
      {(
        [
          { id: 'monthly', label: 'Monthly' },
          { id: 'quarterly', label: 'Quarterly' },
          { id: 'yearly', label: 'Yearly' },
        ] as const
      ).map(item => {
        const active = period === item.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => setPeriod(item.id)}
            style={({ pressed }) => [styles.segmentedItem, active && styles.segmentedItemActive, pressed && styles.pressed]}
          >
            <Text style={[styles.segmentedText, active && styles.segmentedTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const statChange = (pct: number) => {
    const up = pct >= 0;
    const icon = up ? 'trending-up' : 'trending-down';
    const text = `${up ? '+' : ''}${pct.toFixed(1)}% vs last ${period === 'monthly' ? 'month' : period === 'quarterly' ? 'quarter' : 'year'}`;
    return { up, icon, text };
  };

  const spendChange = statChange(spendChangePct);
  const receiptChange = statChange(countChangePct);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            hitSlop={12}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <Feather name="arrow-left" size={22} color={colors.text} />
          </Pressable>

          <View style={styles.topHeaderText}>
            <Text style={styles.topTitle}>Reports</Text>
            <Text style={styles.topSubtitle}>Financial insights and analytics</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Download"
            onPress={onDownload}
            hitSlop={12}
            style={({ pressed }) => [styles.downloadButton, pressed && styles.backButtonPressed]}
          >
            <Feather name="download" size={22} color={COLORS.brand.primary} />
          </Pressable>
        </View>

        {segmented}

        <View style={styles.statRow}>
          <View style={[styles.statCard, styles.statBlue]}>
            <Feather name="dollar-sign" size={22} color={COLORS.common.white} style={styles.statIcon} />
            <Text style={styles.statLabel}>Avg. Monthly</Text>
            <Text style={styles.statValue}>{formatCurrency(avgMonthly)}</Text>
            <View style={styles.statDeltaRow}>
              <Feather name={spendChange.icon} size={14} color={COLORS.common.white} />
              <Text style={styles.statDeltaText}>{spendChange.text}</Text>
            </View>
          </View>

          <View style={[styles.statCard, styles.statGreen]}>
            <Feather name="file-text" size={22} color={COLORS.common.white} style={styles.statIcon} />
            <Text style={styles.statLabel}>Total Receipts</Text>
            <Text style={styles.statValue}>{periodCount.toLocaleString('en-US')}</Text>
            <View style={styles.statDeltaRow}>
              <Feather name={receiptChange.icon} size={14} color={COLORS.common.white} />
              <Text style={styles.statDeltaText}>{receiptChange.text}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCardWrap}>
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Spending Trend</Text>
                <Text style={styles.sectionSubtitle}>Last 7 months</Text>
              </View>
              <Feather name="bar-chart-2" size={22} color={COLORS.brand.primary} />
            </View>

            <View style={styles.trendRows}>
              {spendingTrend.map(row => {
                const total = row.total;
                const maxWidth = 1;
                const safeTotal = total > 0 ? total : 1;

                return (
                  <View key={row.key} style={styles.trendRow}>
                    <Text style={styles.trendMonth}>{row.label}</Text>

                    <View style={styles.trendBarTrack}>
                      <View style={styles.trendBarInner}>
                        {row.segments.map(seg => {
                          const flexVal = clamp(seg.amount / safeTotal, 0, maxWidth);
                          const showText = seg.id !== 'other' && flexVal >= 0.16;
                          return (
                            <View key={`${row.key}-${seg.id}`} style={[styles.trendSeg, { flex: flexVal, backgroundColor: seg.color }]}>
                              {showText ? (
                                <Text style={styles.trendSegText} numberOfLines={1}>
                                  {formatCurrency(seg.amount).replace('$', '$')}
                                </Text>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    </View>

                    <Text style={styles.trendTotal}>{formatCurrency(total)}</Text>
                  </View>
                );
              })}
            </View>
          </Card>
        </View>

        <View style={styles.sectionCardWrap}>
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Category Breakdown</Text>
                <Text style={styles.sectionSubtitle}>{period === 'monthly' ? "This month's spending" : 'This period\'s spending'}</Text>
              </View>
              <Feather name="pie-chart" size={22} color={COLORS.brand.primary} />
            </View>

            <View style={styles.breakdownWrap}>
              {categoryBreakdown.map(row => {
                const pct = clamp(row.pct, 0, 100);
                return (
                  <View key={row.name} style={styles.breakdownRow}>
                    <View style={styles.breakdownTop}>
                      <Text style={styles.breakdownName} numberOfLines={1}>
                        {row.name}
                      </Text>
                      <View style={styles.breakdownRight}>
                        <Text style={styles.breakdownPct}>{pct.toFixed(1)}%</Text>
                        <Text style={styles.breakdownAmt}>{formatCurrency(row.total)}</Text>
                      </View>
                    </View>

                    <View style={styles.breakdownTrack}>
                      <View style={[styles.breakdownFill, { width: `${pct}%`, backgroundColor: row.color }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        </View>

        <View style={styles.sectionCardWrap}>
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Top Merchants</Text>
              <Feather name="shopping-bag" size={22} color={COLORS.brand.primary} />
            </View>

            <View style={styles.merchantList}>
              {topMerchants.map(m => (
                <View key={m.name} style={styles.merchantCard}>
                  <View style={styles.merchantLeft}>
                    <Text style={styles.merchantName} numberOfLines={1}>
                      {m.name}
                    </Text>
                    <Text style={styles.merchantMeta}>{m.visits} visits</Text>
                  </View>
                  <Text style={styles.merchantAmt}>{formatCurrency(m.total)}</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>

        <View style={styles.sectionCardWrap}>
          <View style={styles.insightsCard}>
            <View style={styles.insightsHeader}>
              <View style={styles.insightsIconCircle}>
                <Feather name="trending-up" size={18} color="#7c3aed" />
              </View>
              <Text style={styles.insightsTitle}>Smart Insights</Text>
            </View>

            <View style={styles.insightsBullets}>
              {smartInsights.map((t, idx) => (
                <Text key={`${idx}-${t}`} style={styles.insightsBullet}>
                  • {t}
                </Text>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <LoadingOverlay visible={loading} message="Loading…" />
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
}: {
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
    border: string;
  };
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingBottom: SPACING['3xl'],
    },
    pressed: {
      opacity: 0.9,
    },

    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    downloadButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backButtonPressed: {
      backgroundColor: colors.surface,
    },
    topHeaderText: {
      flex: 1,
      marginLeft: SPACING.md,
      marginRight: SPACING.md,
    },
    topTitle: {
      ...TYPOGRAPHY.pageTitle,
      color: colors.text,
    },
    topSubtitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      marginTop: 2,
    },

    segmentedWrap: {
      flexDirection: 'row',
      gap: 8,
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.lg,
      marginBottom: SPACING.lg,
      padding: 6,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.full,
    },
    segmentedItem: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentedItemActive: {
      backgroundColor: COLORS.brand.primary,
    },
    segmentedText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    segmentedTextActive: {
      color: COLORS.common.white,
      fontWeight: '700',
    },

    statRow: {
      flexDirection: 'row',
      gap: SPACING.md,
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    statCard: {
      flex: 1,
      borderRadius: 18,
      paddingVertical: 16,
      paddingHorizontal: 16,
      minHeight: 122,
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 6,
    },
    statBlue: {
      backgroundColor: '#2563eb',
    },
    statGreen: {
      backgroundColor: '#10b981',
    },
    statIcon: {
      marginBottom: 10,
    },
    statLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '600',
      marginBottom: 6,
    },
    statValue: {
      fontSize: 30,
      fontWeight: '800',
      color: COLORS.common.white,
      marginBottom: 8,
    },
    statDeltaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statDeltaText: {
      ...TYPOGRAPHY.caption,
      color: COLORS.common.white,
      fontWeight: '600',
    },

    sectionCardWrap: {
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    sectionCard: {
      padding: SPACING.lg,
      borderRadius: 18,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: SPACING.lg,
    },
    sectionTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
      fontWeight: '800',
    },
    sectionSubtitle: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginTop: 4,
    },

    trendRows: {
      gap: 14,
    },
    trendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    trendMonth: {
      width: 34,
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      fontWeight: '700',
    },
    trendBarTrack: {
      flex: 1,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    trendBarInner: {
      flex: 1,
      flexDirection: 'row',
    },
    trendSeg: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    trendSegText: {
      ...TYPOGRAPHY.caption,
      color: COLORS.common.white,
      fontWeight: '800',
    },
    trendTotal: {
      width: 74,
      textAlign: 'right',
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
    },

    breakdownWrap: {
      gap: 16,
    },
    breakdownRow: {
      gap: 8,
    },
    breakdownTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
    },
    breakdownName: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '700',
      flex: 1,
    },
    breakdownRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    breakdownPct: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      fontWeight: '700',
      width: 56,
      textAlign: 'right',
    },
    breakdownAmt: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
      width: 88,
      textAlign: 'right',
    },
    breakdownTrack: {
      height: 10,
      borderRadius: 999,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    breakdownFill: {
      height: '100%',
      borderRadius: 999,
    },

    merchantList: {
      gap: 12,
    },
    merchantCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 16,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    merchantLeft: {
      flex: 1,
      paddingRight: SPACING.md,
    },
    merchantName: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
      marginBottom: 4,
    },
    merchantMeta: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    merchantAmt: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '900',
    },

    insightsCard: {
      borderRadius: 18,
      padding: SPACING.lg,
      backgroundColor: '#f5f3ff',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#e9d5ff',
    },
    insightsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    insightsIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#ede9fe',
      alignItems: 'center',
      justifyContent: 'center',
    },
    insightsTitle: {
      ...TYPOGRAPHY.bodyLarge,
      color: '#6d28d9',
      fontWeight: '900',
    },
    insightsBullets: {
      gap: 8,
      paddingLeft: 6,
    },
    insightsBullet: {
      ...TYPOGRAPHY.bodySmall,
      color: '#6d28d9',
      fontWeight: '700',
    },

    bottomSpacer: {
      height: 18,
    },
  });
