import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Modal from 'react-native-modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/common';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';

export interface OptionItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface OptionPickerModalProps {
  visible: boolean;
  title: string;
  items: OptionItem[];
  selectedId?: string;
  onSelect: (item: OptionItem) => void;
  onClose: () => void;
}

export const OptionPickerModal = ({
  visible,
  title,
  items,
  selectedId,
  onSelect,
  onClose,
}: OptionPickerModalProps) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const styles = useMemo(() => createStyles(colors, primary), [colors, primary]);

  const maxListHeight = useMemo(() => {
    const safeTop = Math.max(insets.top, 12);
    const safeBottom = Math.max(insets.bottom, 12);
    // Leave space for title + close button padding.
    const reserved = 170;
    return Math.max(220, windowHeight - safeTop - safeBottom - reserved);
  }, [insets.bottom, insets.top, windowHeight]);

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      backdropOpacity={0.5}
      useNativeDriver
      avoidKeyboard
      propagateSwipe
      style={styles.modal}
    >
      <Card style={styles.card} variant="default">
        <Text style={styles.title}>{title}</Text>

        <ScrollView
          style={[styles.list, { maxHeight: maxListHeight }]}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {items.map(item => {
            const selected = item.id === selectedId;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.row,
                  selected && styles.rowSelected,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.left}>
                  {item.icon ? <View style={styles.icon}>{item.icon}</View> : null}
                  <View style={styles.textCol}>
                    <Text style={[styles.label, selected && styles.labelSelected]}>{item.label}</Text>
                    {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
                  </View>
                </View>
                {selected ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <Button title="Close" onPress={onClose} variant="secondary" fullWidth />
      </Card>
    </Modal>
  );
};

const createStyles = (
  colors: {
    text: string;
    textSecondary: string;
    surface: string;
    border: string;
  },
  primary: string,
) =>
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
    list: {
      marginBottom: SPACING.lg,
    },
    listContent: {
      paddingBottom: SPACING.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: SPACING.sm,
    },
    rowSelected: {
      borderColor: primary,
    },
    rowPressed: {
      opacity: 0.85,
    },
    left: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      paddingRight: SPACING.md,
    },
    icon: {
      marginRight: SPACING.sm,
    },
    textCol: {
      flex: 1,
    },
    label: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
    },
    labelSelected: {
      color: primary,
      fontWeight: '700',
    },
    desc: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    check: {
      ...TYPOGRAPHY.bodyLarge,
      color: primary,
      fontWeight: '900',
    },
  });
