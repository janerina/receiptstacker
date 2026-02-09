import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { Calendar, type DateData } from 'react-native-calendars';

import { Card } from '@/components/common';
import { GuidedTourModal, type GuidedTourStep } from '@/components/tour';
import { EmptyState, LoadingOverlay } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { BottomTabParamList, MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { clearTourStage, getTourStage, isTourCompleted, saveTourCompleted, setTourStage } from '@/services/storage';
import { formatCurrency, formatDate } from '@/utils/format';
import { listReceipts } from '@/utils/receiptStore';
import type { Receipt } from '@/screens/main/ReceiptDetailScreen';

type Props = CompositeScreenProps<
  BottomTabScreenProps<BottomTabParamList, 'Calendar'>,
  NativeStackScreenProps<MainStackParamList, 'BottomTabs'>
>;

type MarkedDates = Record<
  string,
  {
    selected?: boolean;
    marked?: boolean;
    selectedColor?: string;
    dots?: Array<{ key: string; color: string }>
  }
>;

const toDateString = (value: Date | string): string => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
  return d.toISOString().split('T')[0];
};

const toMonthLabel = (dateString: string): string => {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';

  try {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
  } catch {
    return `${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
  }
};

const addMonths = (dateString: string, delta: number): string => {
  const d = new Date(dateString);
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  const next = new Date(safe.getFullYear(), safe.getMonth() + delta, 1);
  return next.toISOString().split('T')[0];
};

const toRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const normalizeReceiptCategoryColor = (receipt: Receipt): string => {
  const color = (receipt.categoryColor ?? '').trim();
  if (color) return color;

  switch ((receipt.categoryId ?? '').trim()) {
    case 'food':
    case 'groceries':
      return '#10b981';
    case 'transport':
      return '#3b82f6';
    case 'shopping':
      return '#a855f7';
    case 'health':
      return '#ef4444';
    case 'misc':
      return '#f59e0b';
    default:
      return COLORS.brand.primary;
  }
};

const buildMarkedDates = (allReceipts: Receipt[], selectedDate: string, selectedColor: string): MarkedDates => {
  const marked: MarkedDates = {};

  for (const receipt of allReceipts) {
    const dateStr = toDateString(receipt.date);
    const color = normalizeReceiptCategoryColor(receipt);

    if (!marked[dateStr]) {
      marked[dateStr] = { marked: true, dots: [] };
    }

    const dots = marked[dateStr].dots ?? [];
    if (dots.length < 3) {
      const exists = dots.some(d => d.color === color);
      if (!exists) {
        dots.push({ key: `${dateStr}-${color}`, color });
      }
    }
    marked[dateStr].dots = dots;
  }

  // Selected date styling
  if (marked[selectedDate]) {
    marked[selectedDate].selected = true;
    marked[selectedDate].selectedColor = selectedColor;
  } else {
    marked[selectedDate] = { selected: true, selectedColor };
  }

  return marked;
};

const filterReceiptsForDate = (allReceipts: Receipt[], dateStr: string): Receipt[] => {
  return allReceipts
    .filter(r => toDateString(r.date) === dateStr)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

const formatTime = (value: Date | string): string => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';

  try {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  } catch {
    const hours = d.getHours();
    const minutes = `${d.getMinutes()}`.padStart(2, '0');
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const twelve = hours % 12 === 0 ? 12 : hours % 12;
    return `${twelve}:${minutes} ${suffix}`;
  }
};

const CategoryPill = ({ label, color }: { label: string; color: string }) => {
  const bg = toRgba(color, 0.16);
  return (
    <View style={[stylesLocal.pill, { backgroundColor: bg }]}>
      <Text style={[stylesLocal.pillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const stylesLocal = StyleSheet.create({
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    maxWidth: 180,
  },
  pillText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
  },
});

export const CalendarScreen = ({ navigation }: Props) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const primary = COLORS.brand.primary;

  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [currentMonth, setCurrentMonth] = useState<string>(new Date().toISOString().split('T')[0]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [markedDates, setMarkedDates] = useState<MarkedDates>({});
  const [selectedDateReceipts, setSelectedDateReceipts] = useState<Receipt[]>([]);
  const [dayTotal, setDayTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [addReceiptMenuVisible, setAddReceiptMenuVisible] = useState(false);
  const [showAllReceipts, setShowAllReceipts] = useState(false);

  // --- Guided tour (staged flow) ---
  const [tourVisible, setTourVisible] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const tourSteps: GuidedTourStep[] = useMemo(
    () => [
      {
        key: 'calendar',
        title: 'Calendar View',
        body: 'Browse receipts by date. Tap a day to see totals and transactions for that date.',
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
        if (!completed && stage === 'calendar') {
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
    setTourStage('profile')
      .catch(() => undefined)
      .finally(() => {
        (navigation as any)?.navigate?.('Profile');
      });
  }, [navigation]);

  const styles = useMemo(() => createStyles({ colors, primary, isDark }), [colors, isDark, primary]);

  const normalizeDotColor = useCallback(
    (color: string) => {
      const raw = String(color ?? '').trim().toLowerCase();
      if (raw === '#fff' || raw === '#ffffff') return primary;
      return color;
    },
    [primary],
  );

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Home');
  }, [navigation]);

  const updateSelectedDateReceipts = useCallback((allReceipts: Receipt[], dateStr: string) => {
    const dateReceipts = filterReceiptsForDate(allReceipts, dateStr);
    setSelectedDateReceipts(dateReceipts);
    setDayTotal(dateReceipts.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0), 0));
  }, []);

  const loadReceipts = useCallback(async () => {
    try {
      setLoading(true);

      const stored = await listReceipts();

      const allReceipts = stored;

      // Normalize category colors (some older receipts may not have it).
      const normalized = allReceipts.map(r => ({
        ...r,
        categoryColor: normalizeReceiptCategoryColor(r),
      }));

      setReceipts(normalized);
      setMarkedDates(buildMarkedDates(normalized, selectedDate, primary));
      updateSelectedDateReceipts(normalized, selectedDate);
    } finally {
      setLoading(false);
    }
  }, [primary, selectedDate, updateSelectedDateReceipts]);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  useFocusEffect(
    useCallback(() => {
      // Calendar keeps its own receipts state; when a receipt is deleted/edited in a different
      // screen (e.g. ReceiptDetail modal), refresh when Calendar regains focus.
      loadReceipts();
      return () => undefined;
    }, [loadReceipts]),
  );

  const handleDayPress = useCallback(
    (day: DateData) => {
      const dateStr = day.dateString;
      setSelectedDate(dateStr);
      setShowAllReceipts(false);
      updateSelectedDateReceipts(receipts, dateStr);
      setMarkedDates(buildMarkedDates(receipts, dateStr, primary));
    },
    [primary, receipts, updateSelectedDateReceipts],
  );

  const handleMonthChange = useCallback((month: DateData) => {
    setCurrentMonth(month.dateString);
  }, []);

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth(prev => addMonths(prev, -1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth(prev => addMonths(prev, 1));
  }, []);

  const handleReceiptPress = useCallback(
    (receiptId: string) => {
      navigation.navigate('ReceiptDetail', { receiptId });
    },
    [navigation],
  );

  const calendarTheme = useMemo(
    () => ({
      calendarBackground: colors.background,
      backgroundColor: colors.background,
      monthTextColor: colors.text,
      textMonthFontWeight: '700' as const,
      textMonthFontSize: 16,

      dayTextColor: colors.text,
      textDayFontSize: 14,
      textDayFontWeight: '500' as const,

      textSectionTitleColor: colors.textSecondary,
      textSectionTitleDisabledColor: colors.textTertiary,
      textSectionTitleFontWeight: '600' as const,
      textSectionTitleFontSize: 12,

      selectedDayBackgroundColor: primary,
      selectedDayTextColor: COLORS.common.white,
      todayTextColor: primary,

      arrowColor: colors.text,
      disabledArrowColor: colors.textTertiary,

      dotColor: primary,
      selectedDotColor: COLORS.common.white,

      // react-native-calendars uses these for out-of-month/disabled day numbers.
      // In dark mode, `textTertiary` can get too low-contrast, so bump to secondary.
      textDisabledColor: isDark ? colors.textSecondary : colors.textTertiary,
      textInactiveColor: isDark ? colors.textSecondary : colors.textTertiary,

      'stylesheet.calendar.main': {
        week: {
          marginTop: 2,
          marginBottom: 2,
          flexDirection: 'row',
          justifyContent: 'space-around',
        },
      },
    }),
    [colors, isDark, primary],
  );

  const selectedLabel = useMemo(() => {
    const d = new Date(selectedDate);
    if (Number.isNaN(d.getTime())) return '';
    return formatDate(d, 'long');
  }, [selectedDate]);

  const monthReceipts = useMemo(() => {
    const d = new Date(currentMonth);
    const safe = Number.isNaN(d.getTime()) ? new Date() : d;
    const start = new Date(safe.getFullYear(), safe.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(safe.getFullYear(), safe.getMonth() + 1, 0, 23, 59, 59, 999);

    return receipts
      .filter(r => {
        const rd = new Date(r.date);
        if (Number.isNaN(rd.getTime())) return false;
        return rd.getTime() >= start.getTime() && rd.getTime() <= end.getTime();
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [currentMonth, receipts]);

  const monthStats = useMemo(() => {
    const totalSpent = monthReceipts.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0), 0);
    return { count: monthReceipts.length, totalSpent };
  }, [monthReceipts]);

  const displayedReceipts = showAllReceipts ? monthReceipts : selectedDateReceipts;
  const sectionTitleText = showAllReceipts ? `${toMonthLabel(currentMonth)} Receipts` : `${selectedLabel}'s Receipts`;
  const viewAllText = showAllReceipts ? 'View Day' : 'View All';

  const renderReceipt = useCallback(
    ({ item }: { item: Receipt }) => {
      const categoryColor = normalizeReceiptCategoryColor(item);
      const time = formatTime(item.date);

      return (
        <View style={styles.itemWrapper}>
          <Card
            onPress={() => handleReceiptPress(item.id)}
            accessibilityLabel={`Open receipt ${item.merchant}`}
            style={styles.receiptCard}
          >
            <View style={styles.receiptTopRow}>
              <Text style={styles.merchant} numberOfLines={1}>
                {item.merchant}
              </Text>
              <Text style={styles.amount} numberOfLines={1}>
                {formatCurrency(item.amount)}
              </Text>
            </View>

            <View style={styles.receiptBottomRow}>
              <CategoryPill label={item.category} color={categoryColor} />
              <Text style={styles.timeText} numberOfLines={1}>
                {time}
              </Text>
            </View>
          </Card>
        </View>
      );
    },
    [handleReceiptPress, styles],
  );

  const keyExtractor = useCallback((item: Receipt) => item.id, []);

  const emptyIcon = useMemo(
    () => <Feather name="calendar" size={60} color={colors.textTertiary} style={styles.emptyIcon} />,
    [colors.textTertiary, styles.emptyIcon],
  );

  const showEmpty = !loading && displayedReceipts.length === 0;

  const openScan = useCallback(() => {
    setAddReceiptMenuVisible(false);
    navigation.navigate('Scan');
  }, [navigation]);

  const openAddManually = useCallback(() => {
    setAddReceiptMenuVisible(false);
    navigation.navigate('AddManually', {});
  }, [navigation]);

  const listHeader = (
    <View>
      <View style={styles.topHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>

        <View style={styles.topHeaderText}>
          <Text style={styles.topTitle}>Calendar</Text>
          <Text style={styles.topSubtitle}>View receipts by date</Text>
        </View>
      </View>

      <View style={styles.calendarCardWrap}>
        <Card style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={handlePrevMonth}
              hitSlop={12}
              style={({ pressed }) => [styles.monthNavButton, pressed && styles.monthNavPressed]}
            >
              <Feather name="chevron-left" size={ICON_SIZES.lg} color={colors.text} />
            </Pressable>

            <Text
              style={styles.monthTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {toMonthLabel(currentMonth)}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              onPress={handleNextMonth}
              hitSlop={12}
              style={({ pressed }) => [styles.monthNavButton, pressed && styles.monthNavPressed]}
            >
              <Feather name="chevron-right" size={ICON_SIZES.lg} color={colors.text} />
            </Pressable>
          </View>

          <Calendar
            current={currentMonth}
            onDayPress={handleDayPress}
            onMonthChange={handleMonthChange}
            enableSwipeMonths
            hideArrows
            renderHeader={() => null}
            markingType="multi-dot"
            markedDates={markedDates}
            hideExtraDays
            theme={calendarTheme}
            dayComponent={({ date, state, marking }) => {
              if (!date) return null;
              const isDisabled = state === 'disabled';
              const isSelected = Boolean(marking?.selected);
              const dots = marking?.dots ?? [];
              const hasDots = dots.length > 0;

              const dayData: DateData = {
                dateString: date.dateString,
                day: date.day,
                month: date.month,
                year: date.year,
                timestamp: new Date(date.dateString).getTime(),
              };

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${date.dateString}`}
                  onPress={() => handleDayPress(dayData)}
                  style={styles.dayPress}
                >
                  <View
                    style={[
                      styles.dayOuter,
                      isSelected ? styles.dayOuterSelected : null,
                      !isSelected && hasDots ? styles.dayOuterMarked : null,
                    ]}
                  >
                    <View style={[styles.dayInner, isSelected ? styles.dayInnerSelected : null]}>
                      <Text
                        style={[
                          styles.dayText,
                          isSelected ? styles.dayTextSelected : null,
                          isDisabled ? styles.dayTextDisabled : null,
                        ]}
                      >
                        {date.day}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.dayDotsRow}>
                    {hasDots
                      ? dots.slice(0, 3).map(d => (
                          <View
                            key={d.key}
                            style={[styles.dayDot, { backgroundColor: normalizeDotColor(d.color) }]}
                          />
                        ))
                      : null}
                  </View>
                </Pressable>
              );
            }}
          />
        </Card>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.statCardBlue]}>
          <Feather name="file-text" size={20} color={COLORS.common.white} style={styles.statIcon} />
          <Text style={styles.statLabel}>Total Receipts</Text>
          <Text style={styles.statValue}>{monthStats.count}</Text>
        </View>

        <View style={[styles.statCard, styles.statCardGreen]}>
          <Feather name="dollar-sign" size={20} color={COLORS.common.white} style={styles.statIcon} />
          <Text style={styles.statLabel}>Total Spent</Text>
          <Text style={styles.statValue}>{formatCurrency(monthStats.totalSpent)}</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} numberOfLines={1}>
          {sectionTitleText}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View all receipts"
          onPress={() => setShowAllReceipts(v => !v)}
          style={({ pressed }) => [styles.viewAllBtn, pressed && styles.viewAllPressed]}
        >
          <Text style={styles.viewAllText}>{viewAllText}</Text>
        </Pressable>
      </View>
    </View>
  );

  const listFooter = (
    <View style={[styles.addReceiptFooter, { paddingBottom: 22 + insets.bottom }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add Receipt"
        onPress={() => setAddReceiptMenuVisible(true)}
        style={({ pressed }) => [styles.addReceiptBtn, pressed && styles.addReceiptPressed]}
      >
        <Feather name="plus" size={18} color={COLORS.common.white} />
        <Text style={styles.addReceiptText}>Add Receipt</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {showEmpty ? (
        <FlatList
          data={[]}
          keyExtractor={() => 'empty'}
          renderItem={null}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          ListEmptyComponent={
            <EmptyState icon={emptyIcon} title="No Receipts" description="No receipts recorded for this date" />
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: 28 + 92 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={displayedReceipts}
          keyExtractor={keyExtractor}
          renderItem={renderReceipt}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          contentContainerStyle={[styles.listContent, { paddingBottom: 28 + 92 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        isVisible={addReceiptMenuVisible}
        onBackdropPress={() => setAddReceiptMenuVisible(false)}
        onBackButtonPress={() => setAddReceiptMenuVisible(false)}
        backdropOpacity={0.12}
        useNativeDriver
        style={styles.addReceiptModal}
      >
        <View style={[styles.addReceiptMenu, { marginBottom: 92 + insets.bottom }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan Receipt"
            onPress={openScan}
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          >
            <View style={[styles.menuIconCircle, styles.menuIconCircleBlue]}>
              <Feather name="camera" size={22} color={COLORS.brand.primary} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuTitle}>Scan Receipt</Text>
              <Text style={styles.menuSubtitle}>Use camera to scan</Text>
            </View>
          </Pressable>

          <View style={styles.menuDivider} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add Manually"
            onPress={openAddManually}
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          >
            <View style={[styles.menuIconCircle, styles.menuIconCirclePurple]}>
              <Feather name="file-text" size={22} color="#7c3aed" />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuTitle}>Add Manually</Text>
              <Text style={styles.menuSubtitle}>Enter details manually</Text>
            </View>
          </Pressable>
        </View>
      </Modal>

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

      <LoadingOverlay visible={loading} message="Loading receipts..." />
    </SafeAreaView>
  );
};

const createStyles = (opts: {
  colors: {
    background: string;
    surface: string;
    border: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
  };
  primary: string;
  isDark: boolean;
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: opts.colors.background,
    },
    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backButtonPressed: {
      backgroundColor: opts.colors.surface,
    },
    topHeaderText: {
      flex: 1,
      marginLeft: SPACING.md,
    },
    topTitle: {
      ...TYPOGRAPHY.pageTitle,
      color: opts.colors.text,
    },
    topSubtitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: opts.colors.textSecondary,
      marginTop: 2,
    },
    calendarCardWrap: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
    },
    calendarCard: {
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      paddingHorizontal: SPACING.md,
      borderRadius: 18,
    },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      paddingBottom: SPACING.sm,
    },
    monthTitle: {
      fontFamily: TYPOGRAPHY.sectionHeading.fontFamily,
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '700',
      color: opts.colors.text,
      textAlign: 'center',
      flex: 1,
      paddingHorizontal: 10,
    },
    monthNavButton: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: opts.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: opts.colors.border,
    },
    monthNavPressed: {
      opacity: 0.75,
    },
    listContent: {
      paddingBottom: 0,
    },

    dayPress: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayOuter: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayOuterMarked: {
      backgroundColor: toRgba(opts.primary, opts.isDark ? 0.18 : 0.12),
    },
    dayOuterSelected: {
      borderWidth: 2,
      borderColor: opts.primary,
      backgroundColor: toRgba(opts.primary, opts.isDark ? 0.18 : 0.12),
    },
    dayInner: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    dayInnerSelected: {
      backgroundColor: opts.primary,
    },
    dayText: {
      fontSize: 16,
      fontWeight: '700',
      color: opts.colors.text,
    },
    dayTextSelected: {
      color: COLORS.common.white,
    },
    dayTextDisabled: {
      color: opts.colors.textTertiary,
      fontWeight: '600',
    },
    dayDotsRow: {
      height: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      marginTop: -6,
    },
    dayDot: {
      width: 5,
      height: 5,
      borderRadius: 999,
    },

    statsRow: {
      paddingHorizontal: SPACING.lg,
      marginTop: SPACING.lg,
      flexDirection: 'row',
      gap: SPACING.md,
    },
    statCard: {
      flex: 1,
      borderRadius: 18,
      padding: SPACING.lg,
      minHeight: 120,
      justifyContent: 'center',
    },
    statCardBlue: {
      backgroundColor: '#2563eb',
    },
    statCardGreen: {
      backgroundColor: '#10b981',
    },
    statIcon: {
      marginBottom: SPACING.md,
    },
    statLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: COLORS.common.white,
      fontWeight: '600',
    },
    statValue: {
      fontSize: 32,
      fontWeight: '800',
      color: COLORS.common.white,
      marginTop: SPACING.sm,
    },

    sectionHeader: {
      paddingHorizontal: SPACING.lg,
      marginTop: SPACING.xl,
      marginBottom: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
    },
    sectionTitle: {
      ...TYPOGRAPHY.sectionHeading,
      fontSize: 20,
      lineHeight: 28,
      fontWeight: '700',
      color: opts.colors.text,
      flex: 1,
    },
    viewAllBtn: {
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    viewAllPressed: {
      opacity: 0.7,
    },
    viewAllText: {
      ...TYPOGRAPHY.bodyNormal,
      color: opts.primary,
      fontWeight: '700',
    },
    itemWrapper: {
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.sm,
    },
    receiptCard: {
      paddingVertical: 18,
      paddingHorizontal: 18,
    },
    receiptTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPACING.md,
    },
    merchant: {
      ...TYPOGRAPHY.bodyLarge,
      color: opts.colors.text,
      fontWeight: '700',
      flex: 1,
      minWidth: 0,
    },
    receiptBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.md,
    },
    amount: {
      ...TYPOGRAPHY.bodyLarge,
      color: opts.colors.text,
      fontWeight: '700',
    },
    timeText: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.textSecondary,
      fontWeight: '500',
      marginLeft: SPACING.md,
    },

    addReceiptFooter: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
    },
    addReceiptBtn: {
      height: 56,
      borderRadius: 18,
      backgroundColor: opts.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 10,
    } satisfies ViewStyle,
    addReceiptPressed: {
      opacity: 0.9,
    },
    addReceiptText: {
      ...TYPOGRAPHY.bodyLarge,
      color: COLORS.common.white,
      fontWeight: '700',
    },

    addReceiptModal: {
      margin: 0,
      justifyContent: 'flex-end',
      alignItems: 'center',
    } satisfies ViewStyle,
    addReceiptMenu: {
      width: '86%',
      maxWidth: 420,
      borderRadius: 18,
      backgroundColor: opts.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: opts.colors.border,
      paddingVertical: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 12,
    } satisfies ViewStyle,
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 18,
      paddingVertical: 14,
    } satisfies ViewStyle,
    menuRowPressed: {
      opacity: 0.8,
    } satisfies ViewStyle,
    menuIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    } satisfies ViewStyle,
    menuIconCircleBlue: {
      backgroundColor: 'rgba(37,99,235,0.12)',
    } satisfies ViewStyle,
    menuIconCirclePurple: {
      backgroundColor: 'rgba(124,58,237,0.12)',
    } satisfies ViewStyle,
    menuTextCol: {
      flex: 1,
      minWidth: 0,
    } satisfies ViewStyle,
    menuTitle: {
      ...TYPOGRAPHY.bodyLarge,
      color: opts.colors.text,
      fontWeight: '700',
    },
    menuSubtitle: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.textSecondary,
      marginTop: 2,
      fontWeight: '500',
    },
    menuDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: opts.colors.border,
      marginHorizontal: 18,
    },
    emptyIcon: {
      opacity: 0.3,
    },
  });
