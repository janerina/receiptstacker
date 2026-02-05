import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, type LayoutChangeEvent, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import type { MarkedDates } from 'react-native-calendars/src/types';
import Feather from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, ICON_SIZES, RADIUS, SPACING } from '@/constants';
import { useTheme } from '@/hooks/useTheme';

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const startOfDay = (d: Date) => {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (d: Date) => {
  const next = new Date(d);
  next.setHours(23, 59, 59, 999);
  return next;
};

type DateRange = {
  start: Date;
  end: Date;
};

export type DateRangePickerModalProps = {
  visible: boolean;
  anchorRef?: React.RefObject<View>;
  initialStartDate?: Date | null;
  initialEndDate?: Date | null;
  minimumDate?: Date;
  maximumDate?: Date;
  title?: string;
  onConfirm: (range: DateRange) => void;
  onClose: () => void;
};

const toYmd = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const parseYmdToLocalDate = (dateString: string) => {
  const [y, m, d] = String(dateString)
    .split('-')
    .map(n => Number(n));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const addDaysLocal = (d: Date, days: number) => {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
};

const buildPeriodMarkedDates = ({
  start,
  end,
  primary,
}: {
  start: Date;
  end: Date;
  primary: string;
}): MarkedDates => {
  const s = startOfDay(start);
  const e = startOfDay(end);
  const startTime = Math.min(s.getTime(), e.getTime());
  const endTime = Math.max(s.getTime(), e.getTime());

  const out: MarkedDates = {};
  let cursor = new Date(startTime);
  let idx = 0;

  while (cursor.getTime() <= endTime && idx < 370) {
    const ymd = toYmd(cursor);
    const isStart = cursor.getTime() === startTime;
    const isEnd = cursor.getTime() === endTime;

    out[ymd] = {
      startingDay: isStart,
      endingDay: isEnd,
      color: primary,
      textColor: COLORS.common.white,
    };

    cursor = addDaysLocal(cursor, 1);
    idx += 1;
  }

  return out;
};

export const DateRangePickerModal = ({
  visible,
  anchorRef,
  initialStartDate,
  initialEndDate,
  minimumDate,
  maximumDate,
  onConfirm,
  onClose,
}: DateRangePickerModalProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tempStart, setTempStart] = useState<Date | null>(initialStartDate ?? null);
  const [tempEnd, setTempEnd] = useState<Date | null>(initialEndDate ?? null);

  const [anchorRect, setAnchorRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [popoverSize, setPopoverSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    if (!visible) return;
    setTempStart(initialStartDate ?? null);
    setTempEnd(initialEndDate ?? null);
  }, [initialEndDate, initialStartDate, visible]);

  useEffect(() => {
    if (!visible) {
      setAnchorRect(null);
      return;
    }

    const node = anchorRef?.current;
    if (!node || typeof (node as any).measureInWindow !== 'function') {
      setAnchorRect(null);
      return;
    }

    const raf = requestAnimationFrame(() => {
      (node as any).measureInWindow((x: number, y: number, width: number, height: number) => {
        setAnchorRect({ x, y, width, height });
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [anchorRef, visible]);

  const minYmd = useMemo(() => (minimumDate ? toYmd(minimumDate) : undefined), [minimumDate]);
  const maxYmd = useMemo(() => (maximumDate ? toYmd(maximumDate) : undefined), [maximumDate]);

  const window = Dimensions.get('window');
  const popoverPad = 12;
  const popoverWidth = Math.min(360, Math.max(280, window.width - popoverPad * 2));

  const popoverPosition = useMemo(() => {
    const maxLeft = Math.max(popoverPad, window.width - popoverWidth - popoverPad);

    const anchorCenterX = anchorRect ? anchorRect.x + anchorRect.width / 2 : window.width / 2;
    const left = Math.min(maxLeft, Math.max(popoverPad, anchorCenterX - popoverWidth / 2));

    const belowY = anchorRect ? anchorRect.y + anchorRect.height + 8 : window.height / 2;
    const availableBottom = window.height - Math.max(insets.bottom, 12) - popoverPad;
    const height = popoverSize.height || 360;
    const fitsBelow = belowY + height <= availableBottom;
    const aboveY = anchorRect ? anchorRect.y - height - 8 : Math.max(insets.top, 12) + popoverPad;

    const topRaw = fitsBelow ? belowY : aboveY;
    const topMin = Math.max(Math.max(insets.top, 12) + popoverPad, 0);
    const topMax = Math.max(topMin, availableBottom - height);
    const top = Math.min(topMax, Math.max(topMin, topRaw));

    return { left, top };
  }, [anchorRect, insets.bottom, insets.top, popoverSize.height, popoverWidth, window.height, window.width]);

  const markedDates: MarkedDates = useMemo(() => {
    if (tempStart && tempEnd) {
      return buildPeriodMarkedDates({ start: tempStart, end: tempEnd, primary: colors.primary });
    }

    if (tempStart) {
      const ymd = toYmd(tempStart);
      return {
        [ymd]: {
          startingDay: true,
          endingDay: true,
          color: colors.primary,
          textColor: COLORS.common.white,
        },
      };
    }

    return {};
  }, [colors.primary, tempEnd, tempStart]);


  const currentYmd = useMemo(() => {
    if (tempEnd) return toYmd(tempEnd);
    if (tempStart) return toYmd(tempStart);
    return toYmd(new Date());
  }, [tempEnd, tempStart]);

  const calendarTheme = useMemo(
    () => ({
      calendarBackground: colors.surface,
      backgroundColor: colors.surface,
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

      todayTextColor: colors.primary,

      arrowColor: colors.text,
      disabledArrowColor: colors.textTertiary,

      textDisabledColor: colors.textTertiary,
    }),
    [colors],
  );

  const handleDayPress = (day: DateData) => {
    const next = parseYmdToLocalDate(day.dateString);
    if (!next) return;

    const nextStart = startOfDay(next);

    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(nextStart);
      setTempEnd(null);
      return;
    }

    // tempStart is set, tempEnd not set -> finalize range and close.
    const start = startOfDay(tempStart);
    const end = nextStart;
    const s = start.getTime() <= end.getTime() ? start : end;
    const e = start.getTime() <= end.getTime() ? end : start;

    setTempStart(s);
    setTempEnd(e);
    onConfirm({ start: startOfDay(s), end: endOfDay(e) });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdropRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />

        <View
          style={[styles.popover, { left: popoverPosition.left, top: popoverPosition.top, width: popoverWidth }]}
          onLayout={(e: LayoutChangeEvent) => {
            const { width, height } = e.nativeEvent.layout;
            if (width !== popoverSize.width || height !== popoverSize.height) {
              setPopoverSize({ width, height });
            }
          }}
        >
          <Calendar
            current={currentYmd}
            minDate={minYmd}
            maxDate={maxYmd}
            enableSwipeMonths
            hideExtraDays
            theme={calendarTheme}
            markingType="period"
            markedDates={markedDates}
            onDayPress={handleDayPress}
            renderArrow={(direction) => (
              <Feather
                name={direction === 'left' ? 'chevron-left' : 'chevron-right'}
                size={ICON_SIZES.md}
                color={colors.text}
              />
            )}
            style={styles.calendar}
          />
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors: {
  text: string;
  textSecondary: string;
  textTertiary: string;
  background: string;
  surface: string;
  border: string;
}) =>
  StyleSheet.create({
    backdropRoot: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    popover: {
      position: 'absolute',
      padding: SPACING.sm,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.surface,
      shadowColor: COLORS.common.black,
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
    calendar: {
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
    },
  });
