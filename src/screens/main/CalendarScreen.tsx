import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { Calendar, type DateData } from 'react-native-calendars';

import { Card, Badge } from '@/components/common';
import { EmptyState, Header, LoadingOverlay } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { BottomTabParamList, MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
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

export const CalendarScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();

  const primary = COLORS.brand.primary;

  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [currentMonth, setCurrentMonth] = useState<string>(new Date().toISOString().split('T')[0]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [markedDates, setMarkedDates] = useState<MarkedDates>({});
  const [selectedDateReceipts, setSelectedDateReceipts] = useState<Receipt[]>([]);
  const [dayTotal, setDayTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

  const updateSelectedDateReceipts = useCallback((allReceipts: Receipt[], dateStr: string) => {
    const dateReceipts = filterReceiptsForDate(allReceipts, dateStr);
    setSelectedDateReceipts(dateReceipts);
    setDayTotal(dateReceipts.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0), 0));
  }, []);

  const loadReceipts = useCallback(async () => {
    try {
      setLoading(true);

      const stored = await listReceipts();

      // Lightweight mock fallback so the screen looks alive on first run.
      const mock: Receipt[] = [
        {
          id: '1',
          merchant: 'Starbucks',
          amount: 15.5,
          date: '2024-01-15',
          category: 'Food & Dining',
          categoryId: 'food',
          categoryColor: '#10b981',
          tags: ['Coffee'],
          paymentMethod: 'Credit Card',
        },
        {
          id: '2',
          merchant: 'Amazon',
          amount: 89.99,
          date: '2024-01-15',
          category: 'Shopping',
          categoryId: 'shopping',
          categoryColor: '#3b82f6',
          tags: ['Supplies'],
          paymentMethod: 'Debit Card',
        },
        {
          id: '3',
          merchant: 'Shell Gas',
          amount: 45.0,
          date: '2024-01-16',
          category: 'Transportation',
          categoryId: 'transport',
          categoryColor: '#f59e0b',
          tags: ['Travel'],
          paymentMethod: 'Credit Card',
        },
      ];

      const allReceipts = stored.length ? stored : mock;

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

  const handleDayPress = useCallback(
    (day: DateData) => {
      const dateStr = day.dateString;
      setSelectedDate(dateStr);
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

      textDisabledColor: colors.textTertiary,

      'stylesheet.calendar.main': {
        week: {
          marginTop: 2,
          marginBottom: 2,
          flexDirection: 'row',
          justifyContent: 'space-around',
        },
      },
    }),
    [colors, primary],
  );

  const selectedLabel = useMemo(() => {
    const d = new Date(selectedDate);
    if (Number.isNaN(d.getTime())) return '';
    return formatDate(d, 'long');
  }, [selectedDate]);

  const renderReceipt = useCallback(
    ({ item }: { item: Receipt }) => {
      const categoryColor = normalizeReceiptCategoryColor(item);
      const categoryBg = toRgba(categoryColor, 0.14);

      return (
        <View style={styles.itemWrapper}>
          <Card
            onPress={() => handleReceiptPress(item.id)}
            accessibilityLabel={`Open receipt ${item.merchant}`}
            style={styles.receiptCard}
          >
            <View style={styles.receiptRow}>
              <View style={styles.receiptLeft}>
                <Text style={styles.merchant} numberOfLines={1}>
                  {item.merchant}
                </Text>
                <View style={styles.categoryRow}>
                  <View style={[styles.categoryDot, { backgroundColor: categoryColor }]} />
                  <Text style={styles.categoryText} numberOfLines={1}>
                    {item.category}
                  </Text>
                </View>
              </View>

              <View style={styles.receiptRight}>
                <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
                <Badge text={item.category} style={{ backgroundColor: categoryBg, borderColor: 'transparent' } as ViewStyle} />
              </View>
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

  const showEmpty = !loading && selectedDateReceipts.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title="Calendar" onBack={() => navigation.goBack()} />

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

        <Text style={styles.monthTitle}>{toMonthLabel(currentMonth)}</Text>

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

      <View style={styles.calendarWrap}>
        <Calendar
          current={currentMonth}
          onDayPress={handleDayPress}
          onMonthChange={handleMonthChange}
          enableSwipeMonths
          markingType="multi-dot"
          markedDates={markedDates}
          hideExtraDays
          theme={calendarTheme}
        />
      </View>

      <View style={styles.selectedHeaderWrap}>
        <Card style={styles.selectedHeaderCard}>
          <View style={styles.selectedHeaderRow}>
            <Text style={styles.selectedDateText} numberOfLines={1}>
              {selectedLabel}
            </Text>
            <Text style={styles.selectedTotalText} numberOfLines={1}>
              Total: {formatCurrency(dayTotal)}
            </Text>
          </View>
        </Card>
      </View>

      {showEmpty ? (
        <EmptyState
          icon={emptyIcon}
          title="No Receipts"
          description="No receipts recorded for this date"
        />
      ) : (
        <FlatList
          data={selectedDateReceipts}
          keyExtractor={keyExtractor}
          renderItem={renderReceipt}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

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
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: opts.colors.background,
    },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
    },
    monthTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: opts.colors.text,
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
    calendarWrap: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    selectedHeaderWrap: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    selectedHeaderCard: {
      paddingVertical: 16,
      paddingHorizontal: 16,
    },
    selectedHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
    },
    selectedDateText: {
      ...TYPOGRAPHY.cardTitle,
      color: opts.colors.text,
      flex: 1,
    },
    selectedTotalText: {
      ...TYPOGRAPHY.bodyLarge,
      color: opts.primary,
      fontWeight: '700',
    },
    listContent: {
      paddingBottom: SPACING['2xl'],
    },
    itemWrapper: {
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.sm,
    },
    receiptCard: {
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    receiptRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
    },
    receiptLeft: {
      flex: 1,
      minWidth: 0,
    },
    merchant: {
      ...TYPOGRAPHY.bodyLarge,
      color: opts.colors.text,
      fontWeight: '700',
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 6,
      gap: 8,
    },
    categoryDot: {
      width: 10,
      height: 10,
      borderRadius: 999,
    },
    categoryText: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.textSecondary,
      flexShrink: 1,
    },
    receiptRight: {
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    amount: {
      ...TYPOGRAPHY.bodyLarge,
      color: opts.primary,
      fontWeight: '800',
      marginBottom: 6,
    },
    emptyIcon: {
      opacity: 0.3,
    },
  });
