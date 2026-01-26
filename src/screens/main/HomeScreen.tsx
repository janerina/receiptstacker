import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { Badge, Card, IconButton } from '@/components/common';
import { EmptyState, LoadingOverlay } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useAuth } from '@/contexts';
import { useTheme } from '@/hooks/useTheme';
import type { BottomTabParamList, HomeStackParamList, MainStackParamList } from '@/navigation';
import { formatCurrency, formatDate } from '@/utils/format';
import { hexToRgba } from '@/utils/color';

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
  NativeStackScreenProps<HomeStackParamList, 'HomeMain'>,
  CompositeScreenProps<BottomTabScreenProps<BottomTabParamList, 'Home'>, NativeStackScreenProps<MainStackParamList, 'BottomTabs'>>
>;

type TabRoute = keyof BottomTabParamList;
type StackRoute = Exclude<keyof MainStackParamList, 'BottomTabs' | 'ReceiptDetail'>;
type HomeRoute = keyof HomeStackParamList;
type QuickRoute = TabRoute | StackRoute | HomeRoute;

const CategoryPill = ({ label, color }: { label: string; color: string }) => {
  const styles = useMemo(() => {
    return StyleSheet.create({
      container: {
        paddingHorizontal: SPACING.sm,
        paddingVertical: SPACING.xs,
        borderRadius: RADIUS.full,
        backgroundColor: hexToRgba(color, 0.14),
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
  const { user } = useAuth();
  const primary = COLORS.brand.primary;

  const warrantyAccent = isDark ? '#FBBF24' : '#D97706';
  const backupAccent = isDark ? '#34D399' : '#059669';

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalReceipts: 0,
    monthlySpend: 0,
    weeklySpend: 0,
  });

  const [notificationCount] = useState(3);
  const [searchQuery, setSearchQuery] = useState('');
  const [showReceiptsFilter, setShowReceiptsFilter] = useState(false);
  const [filterCategoryLabel, setFilterCategoryLabel] = useState('All Categories');
  const [filterDateRangeLabel, setFilterDateRangeLabel] = useState('All Time');
  const [filterMin, setFilterMin] = useState('');
  const [filterMax, setFilterMax] = useState('');

  const styles = useMemo(() => createStyles({ colors, primary, isDark }), [colors, isDark, primary]);

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

  const handleQuickAction = (screen: QuickRoute, params?: object) => {
    const nav = navigation as unknown as { navigate: (name: string, params?: object) => void };
    if (params) {
      nav.navigate(screen as string, params);
      return;
    }
    nav.navigate(screen as string);
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

  const monthLabel = useMemo(() => {
    const now = new Date();
    const month = now.toLocaleString('default', { month: 'long' });
    return `${month} ${now.getFullYear()}`;
  }, []);

  const firstName = useMemo(() => {
    const raw = (user?.name ?? '').trim();
    if (!raw) return 'John';
    return raw.split(/\s+/)[0] ?? 'John';
  }, [user?.name]);

  const quickActions = useMemo(
    () => [
      {
        key: 'scan',
        label: 'Scan',
        icon: 'camera' as const,
        route: 'Scan' as const,
        iconBg: '#DCEBFF',
        iconColor: '#2D6BFF',
      },
      {
        key: 'budget',
        label: 'Budget',
        icon: 'dollar-sign' as const,
        route: 'Budget' as const,
        iconBg: '#DFF7E8',
        iconColor: '#0FAF5A',
      },
      {
        key: 'addManually',
        label: 'Add Manually',
        icon: 'file-text' as const,
        route: 'AddManually' as const,
        iconBg: '#EFE2FF',
        iconColor: '#8B4DFF',
      },
      {
        key: 'insights',
        label: 'Insights',
        icon: 'bar-chart-2' as const,
        route: 'Analytics' as const,
        iconBg: '#FFE9D2',
        iconColor: '#FF7A00',
      },
      {
        key: 'misc',
        label: 'Misc. Spend',
        icon: 'credit-card' as const,
        route: 'MiscSpend' as const,
        iconBg: '#FFE1E5',
        iconColor: '#FF3B57',
      },
      {
        key: 'calendar',
        label: 'Calendar',
        icon: 'calendar' as const,
        route: 'Calendar' as const,
        iconBg: '#FFE0F0',
        iconColor: '#FF4AA2',
      },
      {
        key: 'reports',
        label: 'Reports',
        icon: 'trending-up' as const,
        route: 'Reports' as const,
        iconBg: '#DCEBFF',
        iconColor: '#2D6BFF',
      },
      {
        key: 'tags',
        label: 'Tags',
        icon: 'tag' as const,
        route: 'Tags' as const,
        iconBg: '#D9F7F5',
        iconColor: '#00B5AD',
      },
      {
        key: 'categories',
        label: 'Categories',
        icon: 'folder' as const,
        route: 'Categories' as const,
        iconBg: '#E9E1FF',
        iconColor: '#7C3AED',
      },
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <LoadingOverlay visible={loading && !refreshing} message="Loading receipts…" />

      {!loading && receipts.length === 0 ? (
        <EmptyState
          icon={<Feather name="file-text" size={80} color={hexToRgba(colors.text, 0.3)} />}
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
            <View style={styles.headerLeft} accessibilityRole="header" accessibilityLabel="Home">
              <View style={styles.greetingRow}>
                <Text style={styles.greeting}>Hello, {firstName}</Text>
                <MaterialCommunityIcons
                  name={isDark ? 'hand-wave-outline' : 'hand-wave'}
                  size={22}
                  color={isDark ? colors.textSecondary : '#F59E0B'}
                  style={styles.greetingIcon}
                />
              </View>
              <Text style={styles.tagline}>Track your receipts effortlessly</Text>
            </View>

            <View style={styles.headerActions}>
              <View style={styles.themeButtonWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Toggle theme"
                  onPress={handleThemeToggle}
                  style={({ pressed }) => [styles.themeButton, pressed && styles.headerPressed]}
                >
                  <Feather
                    name={isDark ? 'moon' : 'sun'}
                    size={ICON_SIZES.md}
                    color={colors.text}
                  />
                </Pressable>
              </View>

              <View style={styles.bellWrap}>
                <IconButton
                  variant="ghost"
                  size="md"
                  icon={<Feather name="bell" size={ICON_SIZES.md} color={colors.text} />}
                  onPress={() => handleQuickAction('Notifications')}
                  accessibilityLabel="Notifications"
                />
                {notificationCount > 0 ? (
                  <Badge text={`${notificationCount}`} variant="error" style={styles.notificationBadge} />
                ) : null}
              </View>
            </View>
          </View>

          <View style={[styles.searchRow, showReceiptsFilter ? styles.searchRowCompact : null]}>
            <View style={styles.searchBox}>
              <Feather name="search" size={ICON_SIZES.md} color={colors.textSecondary} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search receipts..."
                placeholderTextColor={colors.textSecondary}
                style={styles.searchInput}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filter"
              onPress={() => setShowReceiptsFilter((v) => !v)}
              style={({ pressed }) => [showReceiptsFilter ? styles.filterButtonActive : styles.filterButton, pressed && styles.headerPressed]}
            >
              <Feather name="filter" size={ICON_SIZES.md} color={showReceiptsFilter ? COLORS.common.white : colors.text} />
              <Text style={[styles.filterButtonText, showReceiptsFilter ? styles.filterButtonTextActive : null]}>Filter</Text>
            </Pressable>
          </View>

          {showReceiptsFilter ? (
            <View style={styles.searchFilterWrap}>
              <View style={styles.searchFilterShadow}>
                <View style={styles.searchFilterCard} accessibilityLabel="Filter Receipts">
                  <Text style={styles.searchFilterTitle}>Filter Receipts</Text>

                  <Text style={styles.receiptsFilterLabel}>Category</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Category"
                    onPress={() => {}}
                    style={({ pressed }) => [styles.receiptsSelect, pressed && styles.headerPressed]}
                  >
                    <Text style={styles.receiptsSelectText}>{filterCategoryLabel}</Text>
                    <Feather name="chevron-down" size={ICON_SIZES.sm} color={colors.textSecondary} />
                  </Pressable>

                  <Text style={styles.receiptsFilterLabel}>Date Range</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Date Range"
                    onPress={() => {}}
                    style={({ pressed }) => [styles.receiptsSelect, pressed && styles.headerPressed]}
                  >
                    <Text style={styles.receiptsSelectText}>{filterDateRangeLabel}</Text>
                    <Feather name="chevron-down" size={ICON_SIZES.sm} color={colors.textSecondary} />
                  </Pressable>

                  <Text style={styles.receiptsFilterLabel}>Amount Range</Text>
                  <View style={styles.amountRow}>
                    <View style={styles.amountCell}>
                      <TextInput
                        value={filterMin}
                        onChangeText={setFilterMin}
                        placeholder="Min ($)"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="numeric"
                        style={styles.amountInput}
                      />
                    </View>
                    <View style={styles.amountCell}>
                      <TextInput
                        value={filterMax}
                        onChangeText={setFilterMax}
                        placeholder="Max ($)"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="numeric"
                        style={styles.amountInput}
                      />
                    </View>
                  </View>

                  <View style={styles.filterActionsRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Apply Filters"
                      onPress={() => setShowReceiptsFilter(false)}
                      style={({ pressed }) => [styles.applyFiltersButton, pressed && styles.applyFiltersPressed]}
                    >
                      <Text style={styles.applyFiltersText}>Apply Filters</Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear"
                      onPress={() => {
                        setFilterMin('');
                        setFilterMax('');
                        setFilterCategoryLabel('All Categories');
                        setFilterDateRangeLabel('All Time');
                      }}
                      style={({ pressed }) => [styles.clearFiltersButton, pressed && styles.headerPressed]}
                    >
                      <Text style={styles.clearFiltersText}>Clear</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.bigCardsRow}>
            <View style={styles.bigCardCell}>
              <View style={styles.bigCardShadow}>
                <LinearGradient
                  colors={['#2D6BFF', '#1E5BFF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.bigCard}
                >
                  <View style={styles.bigCardTopRow}>
                    <View>
                      <Text style={styles.bigCardTitle}>{monthLabel}</Text>
                      <Text style={styles.bigCardSubtitle}>Spent</Text>
                    </View>
                    <Feather name="trending-up" size={22} color={COLORS.common.white} />
                  </View>

                  <Text style={styles.bigCardValue}>{formatCurrency(stats.monthlySpend)}</Text>
                  <View style={styles.bigCardDivider} />

                  <View style={styles.bigCardBottomRow}>
                    <Text style={styles.bigCardMeta}>Budget</Text>
                    <Text style={styles.bigCardMetaValue}>{formatCurrency(2000)}</Text>
                  </View>
                </LinearGradient>
              </View>
            </View>

            <View style={styles.bigCardCell}>
              <View style={styles.bigCardShadow}>
                <LinearGradient
                  colors={['#00B36B', '#00A85F']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.bigCard}
                >
                  <View style={styles.bigCardTopRow}>
                    <View>
                      <Text style={styles.bigCardTitle}>This Week</Text>
                      <Text style={styles.bigCardSubtitle}>Spent</Text>
                    </View>
                    <Feather name="credit-card" size={22} color={COLORS.common.white} />
                  </View>

                  <Text style={styles.bigCardValue}>{formatCurrency(stats.weeklySpend)}</Text>
                  <View style={styles.bigCardDivider} />

                  <View style={styles.bigCardBottomRow}>
                    <Text style={styles.bigCardMeta}>Budget</Text>
                    <Text style={styles.bigCardMetaValue}>{formatCurrency(500)}</Text>
                  </View>
                </LinearGradient>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>

            <View style={styles.actionGrid}>
              {quickActions.map((action) => (
                <View key={action.key} style={styles.actionCell}>
                  <Card
                    variant="default"
                    onPress={() =>
                      handleQuickAction(
                        action.route,
                        action.route === 'AddManually' ? {} : undefined,
                      )
                    }
                    accessibilityLabel={action.label}
                    style={styles.actionCard}
                  >
                    <View style={styles.actionContent}>
                      <View
                        style={[
                          styles.actionIconCircle,
                          {
                            backgroundColor: isDark ? hexToRgba(action.iconColor, 0.18) : action.iconBg,
                          },
                        ]}
                      >
                        <Feather
                          name={action.icon}
                          size={28}
                          color={action.iconColor}
                        />
                      </View>
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
            <View style={styles.alertCard}>
              <View style={styles.alertHeaderRow}>
                <View style={styles.alertHeaderLeft}>
                  <View style={styles.alertIconCircle}>
                    <Feather name="alert-triangle" size={20} color={warrantyAccent} />
                  </View>
                  <View>
                    <Text style={styles.alertTitle}>Warranty & Return Alerts</Text>
                    <Text style={styles.alertSubtitle}>3 items expiring soon</Text>
                  </View>
                </View>
                <View style={styles.alertCountPill}>
                  <Text style={styles.alertCountText}>3</Text>
                </View>
              </View>

              <View style={styles.alertItem}>
                <View style={styles.alertItemLeft}>
                  <Text style={styles.alertItemTitle}>Sony WH-1000XM5</Text>
                  <Text style={styles.alertItemSub}>Warranty expires in 5 days</Text>
                </View>
                <Feather name="shield" size={18} color={warrantyAccent} />
              </View>

              <View style={styles.alertItem}>
                <View style={styles.alertItemLeft}>
                  <Text style={styles.alertItemTitle}>Nike Air Max</Text>
                  <Text style={styles.alertItemSub}>Return window closes in 3 days</Text>
                </View>
                <Feather name="shield" size={18} color={warrantyAccent} />
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View all alerts"
                onPress={() => handleQuickAction('WarrantyAlerts')}
              >
                <Text style={styles.alertLink}>View all alerts →</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.backupCard}>
              <View style={styles.backupHeaderRow}>
                <View style={styles.backupHeaderLeft}>
                  <View style={styles.backupIconCircle}>
                    <Feather name="archive" size={20} color={backupAccent} />
                  </View>
                  <View>
                    <Text style={styles.backupTitle}>Backup Status</Text>
                    <Text style={styles.backupSubtitle}>Last backup: 2 hours ago</Text>
                  </View>
                </View>

                <View style={styles.backupActivePill}>
                  <Text style={styles.backupActiveText}>Active</Text>
                </View>
              </View>

              <View style={styles.backupProgressRow}>
                <View style={styles.backupProgressTrack}>
                  <View style={styles.backupProgressFill} />
                </View>
                <Text style={styles.backupPercent}>87%</Text>
              </View>

              <Text style={styles.backupFootnote}>156 receipts backed up locally</Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Receipts</Text>
            </View>

            {recentReceipts.map((r) => (
              <Card
                key={r.id}
                variant="default"
                onPress={() => handleReceiptPress(r.id)}
                accessibilityLabel={`Receipt from ${r.merchant} for ${formatCurrency(r.amount)}`}
                style={styles.receiptCard}
              >
                <View style={styles.receiptTopRow}>
                  <Text style={styles.receiptMerchant} numberOfLines={1}>
                    {r.merchant}
                  </Text>
                  <Text style={styles.receiptAmount} numberOfLines={1}>
                    {formatCurrency(r.amount)}
                  </Text>
                </View>

                <View style={styles.receiptBottomRow}>
                  <CategoryPill label={r.category} color={r.categoryColor} />
                  <Text style={styles.receiptDate} numberOfLines={1}>
                    {formatDate(r.date, 'short')}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const createStyles = (opts: { colors: { background: string; text: string; textSecondary: string; textTertiary: string; border: string; surface: string }; primary: string; isDark: boolean }) => {
  const { colors, primary, isDark } = opts;

  const panelBg = isDark ? '#0B1220' : colors.surface;
  const panelBorder = isDark ? '#1E2A3B' : colors.border;

  const warrantyBg = isDark ? '#0B1220' : '#FFF7E6';
  const warrantyBorder = isDark ? '#8A5A12' : '#F4D08C';
  const warrantyText = isDark ? '#FBBF24' : '#92400E';
  const warrantySub = isDark ? '#FDE68A' : '#B45309';
  const warrantyIconBg = isDark ? '#1B2232' : '#FFECC7';
  const warrantyItemBg = isDark ? '#0E1624' : COLORS.common.white;
  const warrantyItemBorder = isDark ? '#2A2F3D' : '#F3D7A2';

  const backupBg = isDark ? '#0B1220' : '#E9FFF1';
  const backupBorder = isDark ? '#1F6F56' : '#BFEAD0';
  const backupText = isDark ? '#34D399' : '#064E3B';
  const backupSub = isDark ? '#A7F3D0' : '#047857';
  const backupIconBg = isDark ? '#14281F' : '#D6FFE7';
  const backupTrack = isDark ? '#0F2B22' : '#BFF1D3';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingBottom: SPACING['3xl'],
    },

    header: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerLeft: {
      flex: 1,
      paddingRight: SPACING.md,
    },
    greeting: {
      ...TYPOGRAPHY.pageTitle,
      color: colors.text,
    },
    greetingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    greetingIcon: {
      marginTop: 1,
    },
    tagline: {
      ...TYPOGRAPHY.bodyNormal,
      marginTop: 6,
      color: colors.textSecondary,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    themeButtonWrap: {
      marginRight: SPACING.sm,
    },
    themeButton: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...(isDark
        ? null
        : {
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowOffset: { width: 0, height: 8 },
            shadowRadius: 16,
            elevation: 6,
          }),
    },
    bellWrap: {
      position: 'relative',
    },
    notificationBadge: {
      position: 'absolute',
      top: -6,
      right: -6,
    },
    headerPressed: {
      opacity: 0.7,
    },

    searchRow: {
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    searchRowCompact: {
      paddingBottom: SPACING.sm,
    },
    searchBox: {
      flex: 1,
      height: 54,
      borderRadius: 18,
      backgroundColor: isDark ? colors.surface : '#F1F5F9',
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: colors.border,
      paddingHorizontal: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    searchInput: {
      flex: 1,
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      paddingVertical: 0,
    },
    filterButton: {
      height: 54,
      paddingHorizontal: SPACING.md,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    filterButtonActive: {
      height: 54,
      paddingHorizontal: SPACING.md,
      borderRadius: 18,
      backgroundColor: primary,
      borderWidth: 1,
      borderColor: primary,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    filterButtonText: {
      ...TYPOGRAPHY.bodyNormal,
      fontWeight: '600',
      color: colors.text,
    },
    filterButtonTextActive: {
      color: COLORS.common.white,
    },

    searchFilterWrap: {
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.lg,
    },
    searchFilterShadow: {
      borderRadius: 18,
      shadowColor: '#000',
      shadowOpacity: 0.10,
      shadowOffset: { width: 0, height: 10 },
      shadowRadius: 18,
      elevation: 6,
    },
    searchFilterCard: {
      borderRadius: 18,
      backgroundColor: colors.surface,
      padding: SPACING.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    searchFilterTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      marginBottom: SPACING.md,
    },

    bigCardsRow: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.xl,
      gap: SPACING.md,
    },
    bigCardCell: {
      flex: 1,
    },
    bigCardShadow: {
      borderRadius: 22,
      shadowColor: '#000',
      shadowOpacity: 0.14,
      shadowOffset: { width: 0, height: 10 },
      shadowRadius: 20,
      elevation: 8,
    },
    bigCard: {
      borderRadius: 22,
      padding: SPACING.lg,
      minHeight: 170,
    },
    bigCardTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    bigCardTitle: {
      ...TYPOGRAPHY.bodySmall,
      color: 'rgba(255,255,255,0.9)',
      fontWeight: '600',
    },
    bigCardSubtitle: {
      ...TYPOGRAPHY.bodySmall,
      color: 'rgba(255,255,255,0.9)',
      marginTop: 2,
      fontWeight: '600',
    },
    bigCardValue: {
      marginTop: SPACING.md,
      fontSize: 32,
      fontWeight: '700',
      color: COLORS.common.white,
    },
    bigCardDivider: {
      marginTop: SPACING.md,
      height: StyleSheet.hairlineWidth,
      backgroundColor: 'rgba(255,255,255,0.25)',
    },
    bigCardBottomRow: {
      marginTop: SPACING.sm,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    bigCardMeta: {
      ...TYPOGRAPHY.bodySmall,
      color: 'rgba(255,255,255,0.9)',
      fontWeight: '600',
    },
    bigCardMetaValue: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '700',
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
      padding: 14,
      minHeight: 108,
    },
    actionContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionIconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionLabel: {
      marginTop: SPACING.sm,
      fontSize: 13,
      lineHeight: 16,
      color: colors.text,
      fontWeight: '500',
      textAlign: 'center',
    },

    alertCard: {
      borderRadius: 20,
      padding: SPACING.lg,
      backgroundColor: warrantyBg,
      borderWidth: 1,
      borderColor: warrantyBorder,
    },
    alertHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: SPACING.md,
    },
    alertHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      flex: 1,
      paddingRight: SPACING.md,
    },
    alertIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: warrantyIconBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: warrantyText,
    },
    alertSubtitle: {
      ...TYPOGRAPHY.bodySmall,
      color: warrantySub,
      marginTop: 4,
      fontWeight: '500',
    },
    alertCountPill: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#D97706',
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertCountText: {
      ...TYPOGRAPHY.caption,
      color: COLORS.common.white,
      fontWeight: '800',
    },
    alertItem: {
      borderRadius: 16,
      backgroundColor: warrantyItemBg,
      borderWidth: 1,
      borderColor: warrantyItemBorder,
      padding: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    alertItemLeft: {
      flex: 1,
      paddingRight: SPACING.md,
    },
    alertItemTitle: {
      ...TYPOGRAPHY.bodyNormal,
      fontWeight: '600',
      color: colors.text,
    },
    alertItemSub: {
      ...TYPOGRAPHY.bodySmall,
      marginTop: 2,
      color: colors.textSecondary,
    },
    alertLink: {
      ...TYPOGRAPHY.bodyNormal,
      fontWeight: '600',
      color: warrantySub,
      marginTop: SPACING.sm,
    },

    backupCard: {
      borderRadius: 20,
      padding: SPACING.lg,
      backgroundColor: backupBg,
      borderWidth: 1,
      borderColor: backupBorder,
    },
    backupHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: SPACING.md,
    },
    backupHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      flex: 1,
      paddingRight: SPACING.md,
    },
    backupIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: backupIconBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backupTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: backupText,
    },
    backupSubtitle: {
      ...TYPOGRAPHY.bodySmall,
      color: backupSub,
      marginTop: 4,
      fontWeight: '500',
    },
    backupActivePill: {
      paddingHorizontal: SPACING.md,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: '#059669',
    },
    backupActiveText: {
      ...TYPOGRAPHY.caption,
      color: COLORS.common.white,
      fontWeight: '800',
    },
    backupProgressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    backupProgressTrack: {
      flex: 1,
      height: 10,
      borderRadius: 999,
      backgroundColor: backupTrack,
      overflow: 'hidden',
    },
    backupProgressFill: {
      width: '87%',
      height: '100%',
      backgroundColor: '#059669',
      borderRadius: 999,
    },
    backupPercent: {
      ...TYPOGRAPHY.bodySmall,
      fontWeight: '700',
      color: backupSub,
    },
    backupFootnote: {
      ...TYPOGRAPHY.bodySmall,
      marginTop: SPACING.md,
      color: backupSub,
      fontWeight: '500',
    },

    receiptCard: {
      padding: SPACING.sm,
      borderRadius: RADIUS.md,
      marginBottom: SPACING.sm,
    },
    receiptTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
      gap: SPACING.sm,
    },
    receiptBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    receiptMerchant: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      flex: 1,
      minWidth: 0,
    },
    receiptDate: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
    },
    receiptAmount: {
      ...TYPOGRAPHY.bodyNormal,
      fontWeight: '600',
      color: primary,
    },

    receiptsFilterCard: {
      borderRadius: 18,
      padding: SPACING.lg,
      marginTop: SPACING.md,
      marginBottom: SPACING.md,
    },
    receiptsFilterHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    receiptsFilterTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
    },
    receiptsFilterLabel: {
      ...TYPOGRAPHY.label,
      color: colors.textSecondary,
      marginBottom: SPACING.sm,
      marginTop: SPACING.sm,
    },
    receiptsSelect: {
      height: 54,
      borderRadius: 16,
      backgroundColor: isDark ? panelBg : '#F3F6FB',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? panelBorder : '#E3EAF5',
      paddingHorizontal: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    receiptsSelectText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
    },
    amountRow: {
      flexDirection: 'row',
      gap: SPACING.md,
      marginTop: SPACING.xs,
    },
    amountCell: {
      flex: 1,
      height: 54,
      borderRadius: 16,
      backgroundColor: isDark ? panelBg : '#F3F6FB',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? panelBorder : '#E3EAF5',
      paddingHorizontal: SPACING.md,
      justifyContent: 'center',
    },
    amountInput: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      paddingVertical: 0,
    },
    filterActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      marginTop: SPACING.lg,
    },
    applyFiltersButton: {
      flex: 1,
      height: 54,
      borderRadius: 16,
      backgroundColor: primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    applyFiltersPressed: {
      opacity: 0.85,
    },
    applyFiltersText: {
      ...TYPOGRAPHY.buttonText,
      color: COLORS.common.white,
      fontWeight: '600',
    },
    clearFiltersButton: {
      width: 92,
      height: 54,
      borderRadius: 16,
      backgroundColor: isDark ? '#111C2D' : '#EEF2F7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearFiltersText: {
      ...TYPOGRAPHY.buttonText,
      color: colors.text,
      fontWeight: '600',
    },
  });
};

export default HomeScreen;
