import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';

import { Badge, Card, IconButton } from '@/components/common';
import { BrandName, EmptyState, LoadingOverlay } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { BottomTabParamList, MainStackParamList } from '@/navigation';
import { formatCurrency, formatDate } from '@/utils/format';

interface Receipt {
  id: string;
  merchant: string;
  amount: number;
  date: Date | string;
  category: string;
  categoryColor: string;
  imageUri?: string;
}

interface Stats {
  totalReceipts: number;
  monthlySpend: number;
  weeklySpend: number;
}

type Props = CompositeScreenProps<
  BottomTabScreenProps<BottomTabParamList, 'Home'>,
  NativeStackScreenProps<MainStackParamList, 'BottomTabs'>
>;

type TabRoute = keyof BottomTabParamList;
type StackNoParamRoute = Exclude<keyof MainStackParamList, 'BottomTabs' | 'ReceiptDetail' | 'AddManually'>;
type QuickRoute = TabRoute | StackNoParamRoute;

const toRgba = (hexOrColor: string, alpha: number) => {
  const c = hexOrColor.trim();
  if (/^#([0-9a-fA-F]{3})$/.test(c)) {
    const r = parseInt(c[1] + c[1], 16);
    const g = parseInt(c[2] + c[2], 16);
    const b = parseInt(c[3] + c[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (/^#([0-9a-fA-F]{6})$/.test(c)) {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return hexOrColor;
};

const CategoryPill = ({ label, color }: { label: string; color: string }) => {
  const styles = useMemo(() => {
    return StyleSheet.create({
      container: {
        paddingHorizontal: SPACING.sm,
        paddingVertical: SPACING.xs,
        borderRadius: RADIUS.full,
        backgroundColor: toRgba(color, 0.14),
      },
      text: {
        ...TYPOGRAPHY.caption,
        fontWeight: '600',
        color,
      },
    });
  }, [color]);

  return (
    <View style={styles.container} accessibilityRole="text">
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

/**
 * ReceiptStacker Home/Dashboard screen.
 *
 * Features:
 * - Header with notifications + theme toggle
 * - Horizontal stat cards
 * - Quick actions grid
 * - Recent receipts list
 * - Pull-to-refresh
 */
export const HomeScreen = ({ navigation }: Props) => {
  const { colors, isDark, toggleTheme } = useTheme();
  const primary = COLORS.brand.primary;

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalReceipts: 0,
    monthlySpend: 0,
    weeklySpend: 0,
  });

  const [notificationCount] = useState(2);

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

  const calculateStats = useCallback((receiptsData: Receipt[]) => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const monthlySpend = receiptsData
      .filter((r) => {
        const receiptDate = new Date(r.date);
        return receiptDate.getMonth() === currentMonth && receiptDate.getFullYear() === currentYear;
      })
      .reduce((sum, r) => sum + r.amount, 0);

    const weeklySpend = receiptsData
      .filter((r) => new Date(r.date) >= sevenDaysAgo)
      .reduce((sum, r) => sum + r.amount, 0);

    setStats({
      totalReceipts: receiptsData.length,
      monthlySpend,
      weeklySpend,
    });
  }, []);

  const loadReceipts = useCallback(async () => {
    try {
      setLoading(true);

      // TODO: Replace with database/context load when available.
      // const receiptsData = await database.getReceipts();

      const now = new Date();
      const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

      const mockReceipts: Receipt[] = [
        {
          id: '1',
          merchant: 'Starbucks',
          amount: 15.5,
          date: daysAgo(1),
          category: 'Food & Dining',
          categoryColor: COLORS.semantic.success,
        },
        {
          id: '2',
          merchant: 'Amazon',
          amount: 89.99,
          date: daysAgo(2),
          category: 'Shopping',
          categoryColor: COLORS.brand.primary,
        },
        {
          id: '3',
          merchant: 'Shell Gas',
          amount: 45.0,
          date: daysAgo(3),
          category: 'Transportation',
          categoryColor: COLORS.semantic.warning,
        },
        {
          id: '4',
          merchant: 'Walmart',
          amount: 123.45,
          date: daysAgo(8),
          category: 'Shopping',
          categoryColor: COLORS.brand.primary,
        },
        {
          id: '5',
          merchant: 'Target',
          amount: 67.8,
          date: daysAgo(10),
          category: 'Shopping',
          categoryColor: COLORS.brand.primary,
        },
      ];

      await new Promise<void>((resolve) => setTimeout(resolve, 700));

      setReceipts(mockReceipts);
      calculateStats(mockReceipts);
    } catch (e) {
      console.error('Error loading receipts:', e);
      setReceipts([]);
      calculateStats([]);
    } finally {
      setLoading(false);
    }
  }, [calculateStats]);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReceipts();
    setRefreshing(false);
  }, [loadReceipts]);

  const handleThemeToggle = () => {
    toggleTheme();
  };

  const handleQuickAction = (screen: QuickRoute) => {
    navigation.navigate(screen as never);
  };

  const handleReceiptPress = (receiptId: string) => {
    navigation.navigate('ReceiptDetail', { receiptId });
  };

  const handleViewAllReceipts = () => {
    navigation.navigate('AllReceipts');
  };

  const recentReceipts = useMemo(() => receipts.slice(0, 5), [receipts]);

  const statCards = useMemo(
    () => [
      {
        key: 'total',
        label: 'Receipts',
        value: `${stats.totalReceipts}`,
        icon: 'file-text' as const,
      },
      {
        key: 'monthly',
        label: 'Monthly',
        value: formatCurrency(stats.monthlySpend),
        icon: 'trending-up' as const,
      },
      {
        key: 'weekly',
        label: 'Week',
        value: formatCurrency(stats.weeklySpend),
        icon: 'calendar' as const,
      },
    ],
    [stats.monthlySpend, stats.totalReceipts, stats.weeklySpend],
  );

  const quickActions = useMemo(
    () => [
      { key: 'scan', label: 'Scan', icon: 'camera' as const, route: 'Scan' as const },
      { key: 'budget', label: 'Budget', icon: 'dollar-sign' as const, route: 'Budget' as const },
      { key: 'categories', label: 'Categories', icon: 'grid' as const, route: 'Categories' as const },
      { key: 'analytics', label: 'Analytics', icon: 'bar-chart-2' as const, route: 'Analytics' as const },
      { key: 'calendar', label: 'Calendar', icon: 'calendar' as const, route: 'Calendar' as const },
      { key: 'reports', label: 'Reports', icon: 'file-text' as const, route: 'Reports' as const },
      { key: 'tags', label: 'Tags', icon: 'tag' as const, route: 'Tags' as const },
      { key: 'misc', label: 'Misc Spend', icon: 'trending-down' as const, route: 'MiscSpend' as const },
    ],
    [],
  );

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={colors.text}
        colors={[primary]}
      />
    ),
    [colors.text, onRefresh, primary, refreshing],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LoadingOverlay visible={loading && !refreshing} message="Loading receipts…" />

      {!loading && receipts.length === 0 ? (
        <EmptyState
          icon={<Feather name="file-text" size={80} color={toRgba(colors.text, 0.3)} />}
          title="No Receipts Yet"
          description="Start by scanning your first receipt"
          action={{ label: 'Scan Receipt', onPress: () => handleQuickAction('Scan') }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          <View style={styles.header}>
            <View accessibilityRole="header" accessibilityLabel="ReceiptStacker">
              <BrandName showTagline={false} style={styles.brandName} />
            </View>

            <View style={styles.headerActions}>
              <View style={styles.bellWrap}>
                <IconButton
                  variant="ghost"
                  size="md"
                  icon={<Feather name="bell" size={ICON_SIZES.md} color={colors.text} />}
                  onPress={() => handleQuickAction('Reports')}
                  accessibilityLabel="Notifications"
                />
                {notificationCount > 0 ? (
                  <Badge text={`${notificationCount}`} variant="error" style={styles.notificationBadge} />
                ) : null}
              </View>

              <View style={styles.headerActionItem}>
                <IconButton
                  variant="ghost"
                  size="md"
                  icon={
                    <Feather
                      name={isDark ? 'moon' : 'sun'}
                      size={ICON_SIZES.md}
                      color={colors.text}
                    />
                  }
                  onPress={handleThemeToggle}
                  accessibilityLabel="Toggle theme"
                />
              </View>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statsRow}
          >
            {statCards.map((card) => (
              <Card
                key={card.key}
                variant="glassmorphism"
                style={styles.statCard}
                accessibilityLabel={`${card.label}: ${card.value}`}
              >
                <LinearGradient
                  colors={[toRgba(primary, 0.2), toRgba(primary, 0.05)]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.gradientFill}
                />

                <View style={styles.statTopRow}>
                  <View style={styles.flex1} />
                  <Feather name={card.icon} size={ICON_SIZES.md} color={primary} />
                </View>

                <Text style={styles.statValue} numberOfLines={1}>
                  {card.value}
                </Text>
                <Text style={styles.statLabel} numberOfLines={1}>
                  {card.label}
                </Text>
              </Card>
            ))}
          </ScrollView>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>

            <View style={styles.actionGrid}>
              {quickActions.map((action) => (
                <View key={action.key} style={styles.actionCell}>
                  <Card
                    variant="default"
                    onPress={() => handleQuickAction(action.route)}
                    accessibilityLabel={action.label}
                    style={styles.actionCard}
                  >
                    <View style={styles.actionContent}>
                      <Feather name={action.icon} size={32} color={primary} />
                      <Text style={styles.actionLabel} numberOfLines={1}>
                        {action.label}
                      </Text>
                    </View>
                  </Card>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Receipts</Text>
              <IconButton
                variant="ghost"
                size="sm"
                icon={<Feather name="chevron-right" size={ICON_SIZES.md} color={primary} />}
                onPress={handleViewAllReceipts}
                accessibilityLabel="View all receipts"
              />
            </View>

            {recentReceipts.map((r) => (
              <Card
                key={r.id}
                variant="default"
                onPress={() => handleReceiptPress(r.id)}
                accessibilityLabel={`Receipt from ${r.merchant} for ${formatCurrency(r.amount)}`}
                style={styles.receiptCard}
              >
                <View style={styles.receiptRow}>
                  <View style={styles.receiptLeft}>
                    <Text style={styles.receiptMerchant} numberOfLines={1}>
                      {r.merchant}
                    </Text>
                    <Text style={styles.receiptDate} numberOfLines={1}>
                      {formatDate(r.date, 'short')}
                    </Text>
                  </View>

                  <View style={styles.receiptCenter}>
                    <CategoryPill label={r.category} color={r.categoryColor} />
                  </View>

                  <View style={styles.receiptRight}>
                    <Text style={styles.receiptAmount} numberOfLines={1}>
                      {formatCurrency(r.amount)}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const createStyles = (opts: { colors: { background: string; text: string; textSecondary: string; textTertiary: string; border: string; surface: string }; primary: string }) => {
  const { colors, primary } = opts;

  const brandName: TextStyle = {
    ...TYPOGRAPHY.sectionHeading,
    fontWeight: '800',
    lineHeight: 22,
  };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingBottom: SPACING['2xl'],
    },

    header: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    brandName,
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerActionItem: {
      marginLeft: SPACING.sm,
    },
    bellWrap: {
      position: 'relative',
    },
    notificationBadge: {
      position: 'absolute',
      top: -6,
      right: -6,
    },

    statsRow: {
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.lg,
    },
    statCard: {
      width: 140,
      height: 100,
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      marginRight: SPACING.md,
    } as ViewStyle,
    gradientFill: {
      ...StyleSheet.absoluteFillObject,
    },
    statTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    flex1: {
      flex: 1,
    },
    statValue: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
    },
    statLabel: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },

    section: {
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.lg,
    },
    sectionTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
      marginBottom: SPACING.md,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    actionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -SPACING.xs,
    },
    actionCell: {
      width: '33.3333%',
      paddingHorizontal: SPACING.xs,
      paddingBottom: SPACING.sm,
    },
    actionCard: {
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      minHeight: 96,
    },
    actionContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionLabel: {
      marginTop: SPACING.sm,
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      fontWeight: '600',
      textAlign: 'center',
    },

    receiptCard: {
      padding: SPACING.sm,
      borderRadius: RADIUS.md,
      marginBottom: SPACING.sm,
    },
    receiptRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    receiptLeft: {
      flex: 1,
      minWidth: 0,
    },
    receiptMerchant: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
    },
    receiptDate: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    receiptCenter: {
      marginLeft: SPACING.sm,
      marginRight: SPACING.sm,
      maxWidth: 140,
    },
    receiptRight: {
      alignItems: 'flex-end',
      maxWidth: 120,
    },
    receiptAmount: {
      ...TYPOGRAPHY.bodyNormal,
      fontWeight: '800',
      color: primary,
    },
  });
};

export default HomeScreen;
