import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import DatePicker from 'react-native-date-picker';

import { Button, Card } from '@/components/common';
import { SPACING, TYPOGRAPHY } from '@/constants';
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
          <DatePicker
            date={tempDate}
            onDateChange={setTempDate}
            mode={mode}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            theme={isDark ? 'dark' : 'light'}
          />
        </View>

        <View style={styles.actionsRow}>
          <Button title="Cancel" onPress={onClose} variant="secondary" style={styles.actionLeft} />
          <Button title="Done" onPress={confirm} variant="primary" style={styles.actionRight} />
        </View>
      </Card>
    </Modal>
  );
};

const createStyles = (colors: { text: string }) =>
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
      height: 300,
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
