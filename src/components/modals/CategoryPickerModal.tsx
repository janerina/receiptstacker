import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import Feather from 'react-native-vector-icons/Feather';

import { Button, Card, CategoryIcon, Input } from '@/components/common';
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
  onAddNewCategory?: () => void;
  onClose: () => void;
  title?: string;
  searchPlaceholder?: string;
  variant?: 'grid' | 'list';
  presentation?: 'bottomSheet' | 'center';
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
  onAddNewCategory,
  onClose,
  title = 'Select Category',
  searchPlaceholder = 'Search categories…',
  variant = 'grid',
  presentation = 'bottomSheet',
}: CategoryPickerModalProps) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;
  const styles = useMemo(() => createStyles(colors, primary, presentation), [colors, primary, presentation]);

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

  const renderGridItem = ({ item }: { item: CategoryOption }) => {
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
            <CategoryIcon icon={iconName} size={ICON_SIZES.md} color={item.color} />
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

  const renderListItem = ({ item }: { item: CategoryOption }) => {
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
        style={({ pressed }) => [styles.rowItem, selected && styles.rowItemSelected, pressed && styles.rowItemPressed]}
      >
        <View style={[styles.iconCircle, { backgroundColor: toRgba(item.color, 0.14) }]}>
          <CategoryIcon icon={iconName} size={ICON_SIZES.md} color={item.color} />
        </View>

        <View style={styles.rowTextWrap}>
          <Text numberOfLines={1} style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
            {item.name}
          </Text>
          <View style={styles.rowMeta}>
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={styles.rowMetaText}>{item.id}</Text>
          </View>
        </View>

        {selected ? <Feather name="check" size={ICON_SIZES.md} color={primary} /> : null}
      </Pressable>
    );
  };

  const renderItem = variant === 'list' ? renderListItem : renderGridItem;

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      backdropOpacity={0.5}
      useNativeDriver
      useNativeDriverForBackdrop
      propagateSwipe
      avoidKeyboard
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
          numColumns={variant === 'grid' ? 2 : 1}
          columnWrapperStyle={variant === 'grid' ? styles.columnWrap : undefined}
          contentContainerStyle={variant === 'grid' ? styles.gridContent : styles.listContent}
          renderItem={renderItem}
          ListFooterComponent={
            onAddNewCategory
              ? () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add New Category"
                    onPress={() => {
                      onClose();
                      onAddNewCategory();
                    }}
                    style={({ pressed }) => [styles.addNewRow, pressed && styles.rowItemPressed]}
                  >
                    <View style={[styles.addNewIconCircle, { backgroundColor: toRgba(primary, 0.14) }]}>
                      <Feather name="plus" size={ICON_SIZES.md} color={primary} />
                    </View>
                    <Text style={[styles.addNewText, { color: primary }]}>Add New Category</Text>
                    <Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textSecondary} />
                  </Pressable>
                )
              : null
          }
          keyboardShouldPersistTaps="always"
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
    presentation: 'bottomSheet' | 'center',
  ) =>
    StyleSheet.create({
      modal: {
        margin: presentation === 'center' ? SPACING.lg : 0,
        justifyContent: presentation === 'center' ? 'center' : 'flex-end',
      },
      sheet: {
        padding: SPACING.lg,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderBottomLeftRadius: presentation === 'center' ? 28 : 0,
        borderBottomRightRadius: presentation === 'center' ? 28 : 0,
        width: '100%',
        backgroundColor: colors.surface,
        maxHeight: presentation === 'center' ? '80%' : '86%',
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

      addNewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.md,
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.sm,
        borderRadius: 16,
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        marginBottom: SPACING.md,
      },
      addNewIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: toRgba(primary, 0.15),
      },
      addNewText: {
        ...TYPOGRAPHY.bodyLarge,
        color: colors.text,
        fontWeight: '800',
        flex: 1,
      },

      listContent: {
        paddingBottom: SPACING.lg,
      },

      // List rows
      rowItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.md,
        backgroundColor: colors.surface,
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.md,
        marginBottom: SPACING.sm,
      },
      rowItemSelected: {
        borderColor: primary,
        backgroundColor: toRgba(primary, 0.06),
      },
      rowItemPressed: {
        opacity: 0.9,
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
      rowTextWrap: {
        flex: 1,
        minWidth: 0,
      },
      rowLabel: {
        ...TYPOGRAPHY.bodyLarge,
        color: colors.text,
        fontWeight: '700',
      },
      rowLabelSelected: {
        color: primary,
      },
      rowMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
      },

      // Grid layout
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
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
      },
      rowMetaText: {
        ...TYPOGRAPHY.caption,
        color: colors.textSecondary,
      },
      gridMetaText: {
        ...TYPOGRAPHY.caption,
        color: colors.textSecondary,
      },
    });
