import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import DatePicker from 'react-native-date-picker';
import { Calendar } from 'react-native-calendars';
import Feather from 'react-native-vector-icons/Feather';

import { Button, Card } from '@/components/common';
import { COLORS, ICON_SIZES, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';

type PickerMode = 'date' | 'time' | 'datetime';

type LegacyProps = {
  visible: boolean;
  initialDate: Date;
  onConfirm: (date: Date) => void;
  onClose: () => void;
  title?: string;
};

type NewProps = {
  visible: boolean;
  selectedDate: Date;
  onSelect: (date: Date) => void;
  onClose: () => void;
  mode?: PickerMode;
  minimumDate?: Date;
  maximumDate?: Date;
  title?: string;
};

export type DatePickerModalProps = LegacyProps | NewProps;

const isNewProps = (props: DatePickerModalProps): props is NewProps => {
  return (props as NewProps).selectedDate instanceof Date && typeof (props as NewProps).onSelect === 'function';
};

export const DatePickerModal = (props: DatePickerModalProps) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const visible = props.visible;
  const initial = isNewProps(props) ? props.selectedDate : props.initialDate;
  const title = props.title ?? 'Select Date';
  const mode: PickerMode = isNewProps(props) ? (props.mode ?? 'date') : 'date';
  const minimumDate = isNewProps(props) ? props.minimumDate : undefined;
  const maximumDate = isNewProps(props) ? props.maximumDate : undefined;
  const onClose = props.onClose;

  const [tempDate, setTempDate] = useState<Date>(initial);

  useEffect(() => {
    if (visible) setTempDate(initial);
  }, [initial, visible]);

  const confirm = () => {
    if (isNewProps(props)) {
      props.onSelect(tempDate);
      props.onClose();
      return;
    }

    props.onConfirm(tempDate);
  };

  const toYmd = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const selectedYmd = useMemo(() => toYmd(tempDate), [tempDate]);
  const minYmd = useMemo(() => (minimumDate ? toYmd(minimumDate) : undefined), [minimumDate]);
  const maxYmd = useMemo(() => (maximumDate ? toYmd(maximumDate) : undefined), [maximumDate]);

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

      selectedDayBackgroundColor: colors.primary,
      selectedDayTextColor: COLORS.common.white,
      todayTextColor: colors.primary,

      arrowColor: colors.text,
      disabledArrowColor: colors.textTertiary,

      dotColor: colors.primary,
      selectedDotColor: COLORS.common.white,

      textDisabledColor: colors.textTertiary,
    }),
    [colors],
  );

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      backdropOpacity={0.5}
      useNativeDriver
    >
      <Card style={styles.card} variant="default">
        <Text style={styles.title}>{title}</Text>

        <View style={styles.pickerWrap}>
          {mode === 'date' ? (
            <Calendar
              current={selectedYmd}
              minDate={minYmd}
              maxDate={maxYmd}
              enableSwipeMonths
              hideExtraDays
              theme={calendarTheme}
              markedDates={{
                [selectedYmd]: {
                  selected: true,
                  selectedColor: colors.primary,
                  selectedTextColor: COLORS.common.white,
                },
              }}
              onDayPress={(day) => {
                const [y, m, d] = String(day.dateString).split('-').map((n) => Number(n));
                if (!y || !m || !d) return;
                setTempDate((prev) => {
                  const next = new Date(prev);
                  next.setFullYear(y);
                  next.setMonth(m - 1);
                  next.setDate(d);
                  return next;
                });
              }}
              renderArrow={(direction) => (
                <Feather
                  name={direction === 'left' ? 'chevron-left' : 'chevron-right'}
                  size={ICON_SIZES.md}
                  color={colors.text}
                />
              )}
            />
          ) : (
            <DatePicker
              date={tempDate}
              onDateChange={setTempDate}
              mode={mode}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              theme={isDark ? 'dark' : 'light'}
            />
          )}
        </View>

        <View style={styles.actionsRow}>
          <Button title="Cancel" onPress={onClose} variant="secondary" style={styles.actionLeft} />
          <Button title="Done" onPress={confirm} variant="primary" style={styles.actionRight} />
        </View>
      </Card>
    </Modal>
  );
};

const createStyles = (colors: {
  text: string;
  textSecondary: string;
  textTertiary: string;
  background: string;
  border: string;
}) =>
  StyleSheet.create({
    card: {
      padding: SPACING.lg,
      minHeight: 460,
    },
    title: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      marginBottom: SPACING.md,
      textAlign: 'center',
    },
    pickerWrap: {
      marginBottom: SPACING.lg,
      alignItems: 'center',
      minHeight: 340,
      justifyContent: 'center',
    },
    actionsRow: {
      flexDirection: 'row',
    },
    actionLeft: {
      flex: 1,
      marginRight: SPACING.sm,
    },
    actionRight: {
      flex: 1,
      marginLeft: SPACING.sm,
    },
  });
