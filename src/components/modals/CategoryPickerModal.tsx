import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import Feather from 'react-native-vector-icons/Feather';

import { Button, Card, Input } from '@/components/common';
import { COLORS, ICON_SIZES, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';

export interface CategoryOption {
  id: string;
  name: string;
  color: string;
  iconName?: string;
}

export interface CategoryPickerModalProps {
  visible: boolean;
  selectedId?: string;
  categories: CategoryOption[];
  onSelect: (category: CategoryOption) => void;
  onClose: () => void;
  title?: string;
  searchPlaceholder?: string;
}

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

export const CategoryPickerModal = ({
  visible,
  selectedId,
  categories,
  onSelect,
  onClose,
  title = 'Select Category',
  searchPlaceholder = 'Search categories…',
}: CategoryPickerModalProps) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;
  const styles = useMemo(() => createStyles(colors, primary), [colors, primary]);

  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(c => c.name.toLowerCase().includes(q));
  }, [categories, query]);

  const getIconName = (c: CategoryOption): string => {
    if (c.iconName) return c.iconName;
    switch (c.id) {
      case 'food':
        return 'coffee';
      case 'groceries':
        return 'shopping-cart';
      case 'transport':
        return 'truck';
      case 'shopping':
        return 'shopping-bag';
      case 'health':
        return 'heart';
      case 'misc':
        return 'more-horizontal';
      default:
        return 'tag';
    }
  };

  const renderItem = ({ item }: { item: CategoryOption }) => {
    const selected = item.id === selectedId;
    const iconName = getIconName(item);

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.name}
        onPress={() => {
          onSelect(item);
          onClose();
        }}
        style={({ pressed }) => [
          styles.gridItem,
          selected && styles.gridItemSelected,
          pressed && styles.gridItemPressed,
        ]}
      >
        <View style={styles.gridTopRow}>
          <View style={[styles.iconCircle, { backgroundColor: toRgba(item.color, 0.14) }]}>
            <Feather name={iconName} size={ICON_SIZES.md} color={item.color} />
          </View>
          {selected ? <Feather name="check" size={ICON_SIZES.sm} color={primary} /> : null}
        </View>

        <Text numberOfLines={2} style={[styles.gridLabel, selected && styles.gridLabelSelected]}>
          {item.name}
        </Text>

        <View style={styles.gridMetaRow}>
          <View style={[styles.dot, { backgroundColor: item.color }]} />
          <Text style={styles.gridMetaText}>{item.id}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      backdropOpacity={0.5}
      useNativeDriver
      style={styles.modal}
    >
      <Card style={styles.sheet} variant="default">
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.closeHit}>
            <Feather name="x" size={ICON_SIZES.md} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={searchPlaceholder}
          autoCapitalize="none"
          leftIcon={<Feather name="search" size={ICON_SIZES.sm} color={colors.textSecondary} />}
          style={styles.search}
        />

        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrap}
          contentContainerStyle={styles.gridContent}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />

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
      margin: 0,
      justifyContent: 'flex-end',
    },
    sheet: {
      padding: SPACING.lg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      maxHeight: '86%',
    },
    headerRow: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.md,
      paddingHorizontal: SPACING.xl,
    },
    title: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      textAlign: 'center',
    },
    closeHit: {
      position: 'absolute',
      right: SPACING.sm,
      top: -SPACING.xs,
      padding: SPACING.sm,
    },
    search: {
      marginBottom: SPACING.md,
    },
    gridContent: {
      paddingBottom: SPACING.lg,
    },
    columnWrap: {
      gap: SPACING.sm,
    },
    gridItem: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      minHeight: 96,
    },
    gridItemSelected: {
      borderColor: primary,
      backgroundColor: toRgba(primary, 0.06),
    },
    gridItemPressed: {
      opacity: 0.9,
    },
    gridTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    iconCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: toRgba(primary, 0.15),
    },
    gridLabel: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '700',
      marginBottom: SPACING.sm,
    },
    gridLabelSelected: {
      color: primary,
    },
    gridMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: SPACING.sm,
    },
    gridMetaText: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
    },
  });
