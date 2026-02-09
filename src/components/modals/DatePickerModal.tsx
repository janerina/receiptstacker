import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Modal from 'react-native-modal';
import DatePicker from 'react-native-date-picker';
import { Calendar } from 'react-native-calendars';
import Feather from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const visible = props.visible;
  const initial = isNewProps(props) ? props.selectedDate : props.initialDate;
  const title = props.title;
  const mode: PickerMode = isNewProps(props) ? (props.mode ?? 'date') : 'date';
  const minimumDate = isNewProps(props) ? props.minimumDate : undefined;
  const maximumDate = isNewProps(props) ? props.maximumDate : undefined;
  const onClose = props.onClose;

  const [tempDate, setTempDate] = useState<Date>(initial);

  useEffect(() => {
    if (visible) setTempDate(initial);
  }, [initial, visible]);

  const confirmWith = (date: Date) => {
    if (isNewProps(props)) {
      props.onSelect(date);
      props.onClose();
      return;
    }

    props.onConfirm(date);
    props.onClose();
  };

  const confirm = () => confirmWith(tempDate);

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

      selectedDayBackgroundColor: colors.primary,
      selectedDayTextColor: COLORS.common.white,
      todayTextColor: colors.primary,

      arrowColor: colors.text,
      disabledArrowColor: colors.textTertiary,

      dotColor: colors.primary,
      selectedDotColor: COLORS.common.white,

      textDisabledColor: isDark ? colors.textSecondary : colors.textTertiary,
      textInactiveColor: isDark ? colors.textSecondary : colors.textTertiary,
    }),
    [colors, isDark],
  );

  const maxCardHeight = useMemo(() => {
    const safeTop = Math.max(insets.top, 12);
    const safeBottom = Math.max(insets.bottom, 12);
    const available = windowHeight - safeTop - safeBottom - SPACING.lg * 2;
    return Math.max(560, Math.min(740, available));
  }, [insets.bottom, insets.top, windowHeight]);

  const calendarHeight = useMemo(() => {
    const estimated = maxCardHeight - SPACING.lg * 2;
    return Math.max(380, Math.min(520, estimated));
  }, [maxCardHeight]);

  const dateCardHeight = useMemo(() => {
    // Card padding (top+bottom) plus calendar height.
    return calendarHeight + SPACING.lg * 2;
  }, [calendarHeight]);

  const cardSizingStyle = useMemo(
    () => ({
      maxHeight: maxCardHeight,
      paddingBottom: SPACING.lg,
    }),
    [insets.bottom, maxCardHeight],
  );

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      backdropOpacity={0.5}
      useNativeDriver
      style={styles.modal}
    >
      <Card
        style={[
          styles.card,
          cardSizingStyle,
          mode === 'date'
            ? {
                height: dateCardHeight,
              }
            : null,
        ]}
        variant="default"
      >
        {title ? <Text style={styles.title}>{title}</Text> : null}

        {mode === 'date' ? (
          <>
            <View style={[styles.pickerWrapDate, { height: calendarHeight }]}>
              <Calendar
                current={selectedYmd}
                minDate={minYmd}
                maxDate={maxYmd}
                enableSwipeMonths
                hideExtraDays={false}
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

                  const next = new Date(tempDate);
                  next.setFullYear(y);
                  next.setMonth(m - 1);
                  next.setDate(d);

                  if (minimumDate && next.getTime() < minimumDate.getTime()) return;
                  if (maximumDate && next.getTime() > maximumDate.getTime()) return;

                  setTempDate(next);
                }}
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

            <View style={styles.actionsRow}>
              <Button title="Cancel" onPress={onClose} variant="secondary" style={styles.actionLeft} />
              <Button title="Done" onPress={confirm} variant="primary" style={styles.actionRight} />
            </View>
          </>
        ) : (
          <>
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.bodyScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.pickerWrap}>
                <DatePicker
                  date={tempDate}
                  onDateChange={setTempDate}
                  mode={mode}
                  minimumDate={minimumDate}
                  maximumDate={maximumDate}
                  theme={isDark ? 'dark' : 'light'}
                  {...(Platform.OS === 'android' && mode === 'date' ? { androidVariant: 'nativeAndroid' as const } : null)}
                />
              </View>
            </ScrollView>

            <View style={styles.actionsRow}>
              <Button title="Cancel" onPress={onClose} variant="secondary" style={styles.actionLeft} />
              <Button title="Done" onPress={confirm} variant="primary" style={styles.actionRight} />
            </View>
          </>
        )}
      </Card>
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
    modal: {
      margin: SPACING.lg,
      justifyContent: 'center',
    },
    card: {
      padding: SPACING.lg,
    },
    title: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      marginBottom: SPACING.md,
      textAlign: 'center',
    },
    bodyScroll: {
      flex: 1,
      marginBottom: SPACING.md,
    },
    bodyScrollContent: {
      flexGrow: 1,
      justifyContent: 'flex-start',
    },
    pickerWrapDate: {
      flexGrow: 0,
      alignItems: 'stretch',
      justifyContent: 'flex-start',
    },
    pickerWrap: {
      flex: 1,
      alignItems: 'stretch',
      justifyContent: 'flex-start',
      minHeight: 380,
    },
    calendar: {
      flex: 1,
      borderRadius: 16,
      overflow: 'hidden',
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
