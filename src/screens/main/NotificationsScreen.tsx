import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';

import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { MainStackParamList } from '@/navigation/types';
import { hexToRgba } from '@/utils/color';

type Props = NativeStackScreenProps<MainStackParamList, 'Notifications'>;

type NotificationKind = 'warranty' | 'backup' | 'budget' | 'feature' | 'cashback';

type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  timeAgo: string;
  unread: boolean;
};

const KIND_META: Record<NotificationKind, { icon: string; bgLight: string; accent: string }> = {
  warranty: { icon: 'alert-triangle', bgLight: '#FFF3D6', accent: '#D97706' },
  backup: { icon: 'check', bgLight: '#DCFCE7', accent: '#16A34A' },
  budget: { icon: 'trending-up', bgLight: '#DBEAFE', accent: '#2563EB' },
  feature: { icon: 'info', bgLight: '#DBEAFE', accent: '#2563EB' },
  cashback: { icon: 'gift', bgLight: '#DCFCE7', accent: '#16A34A' },
};

export const NotificationsScreen = ({ navigation }: Props) => {
  const { colors, isDark } = useTheme();
  const primary = COLORS.brand.primary;

  const styles = useMemo(() => createStyles({ colors, isDark, primary }), [colors, isDark, primary]);

  const [items, setItems] = useState<NotificationItem[]>([
    {
      id: 'n1',
      kind: 'warranty',
      title: 'Warranty Expiring Soon',
      message: 'Sony WH-1000XM5 warranty expires in 5 days',
      timeAgo: '2 hours ago',
      unread: true,
    },
    {
      id: 'n2',
      kind: 'backup',
      title: 'Backup Completed',
      message: '156 receipts backed up successfully',
      timeAgo: '3 hours ago',
      unread: true,
    },
    {
      id: 'n3',
      kind: 'budget',
      title: 'Budget Alert',
      message: "You've used 85% of your monthly budget",
      timeAgo: '5 hours ago',
      unread: true,
    },
    {
      id: 'n4',
      kind: 'feature',
      title: 'New Feature',
      message: 'Try our new expense comparison tool',
      timeAgo: '1 day ago',
      unread: false,
    },
    {
      id: 'n5',
      kind: 'cashback',
      title: 'Cashback Earned',
      message: 'You earned $12.50 in cashback this month',
      timeAgo: '2 days ago',
      unread: false,
    },
  ]);

  const unreadCount = useMemo(() => items.filter((i) => i.unread).length, [items]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconCircle}>
            <Feather name="bell" size={ICON_SIZES.md} color={COLORS.brand.primary} />
          </View>
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>Notifications</Text>
            <Text style={styles.headerSubtitle}>{unreadCount} unread</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Feather name="x" size={ICON_SIZES.lg} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark all as read"
          onPress={() => setItems((prev) => prev.map((p) => ({ ...p, unread: false })))}
          style={({ pressed }) => [styles.actionLink, pressed && styles.pressed]}
        >
          <Text style={styles.actionLinkText}>Mark all as read</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear all"
          onPress={() => setItems([])}
          style={({ pressed }) => [styles.actionLink, pressed && styles.pressed]}
        >
          <Text style={[styles.actionLinkText, styles.actionLinkMuted]}>Clear all</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {items.map((item) => {
          const meta = KIND_META[item.kind];
          const iconBg = isDark ? hexToRgba(meta.accent, 0.18) : meta.bgLight;
          const iconColor = meta.accent;

          return (
            <View key={item.id} style={styles.notificationCard} accessibilityRole="summary">
              <View style={styles.cardRow}>
                <View style={styles.cardLeft}>
                  <View style={[styles.cardIconCircle, { backgroundColor: iconBg }]}>
                    <Feather name={meta.icon as any} size={18} color={iconColor} />
                  </View>

                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardMessage}>{item.message}</Text>
                    <Text style={styles.cardTime}>{item.timeAgo}</Text>
                  </View>
                </View>

                {item.unread ? <View style={styles.unreadDot} /> : <View style={styles.unreadDotSpacer} />}
              </View>
            </View>
          );
        })}

        <View style={{ height: SPACING['3xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
  isDark,
  primary,
}: {
  colors: { background: string; text: string; textSecondary: string; border: string; surface: string };
  isDark: boolean;
  primary: string;
}) => {
  const headerTitle: TextStyle = {
    ...TYPOGRAPHY.sectionHeading,
    color: colors.text,
  };

  const cardTitle: TextStyle = {
    ...TYPOGRAPHY.cardTitle,
    color: colors.text,
  };

  const actionLinkText: TextStyle = {
    ...TYPOGRAPHY.bodyNormal,
    color: COLORS.brand.primary,
  };

  const headerIconCircleBg = isDark ? hexToRgba(primary, 0.18) : '#EAF2FF';
  const cardBg = isDark ? colors.surface : '#F3F7FF';
  const cardBorder = isDark ? hexToRgba(primary, 0.22) : '#C7D2FE';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    header: {
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    headerIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: headerIconCircleBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitles: {
      flexDirection: 'column',
    },
    headerTitle,
    headerSubtitle: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginTop: 2,
    },

    closeButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },

    pressed: {
      opacity: 0.7,
    },

    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    actionLink: {
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderRadius: 10,
    },
    actionLinkText,
    actionLinkMuted: {
      color: colors.textSecondary,
    },

    content: {
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: SPACING['2xl'],
    },

    notificationCard: {
      backgroundColor: cardBg,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: cardBorder,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },

    cardRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    cardLeft: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
      flex: 1,
      paddingRight: SPACING.sm,
    },
    cardIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },

    cardText: {
      flex: 1,
    },
    cardTitle,
    cardMessage: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      marginTop: 4,
    },
    cardTime: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      marginTop: 10,
    },

    unreadDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: COLORS.brand.primary,
      marginTop: 6,
    },
    unreadDotSpacer: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: 'transparent',
      marginTop: 6,
    },
  });
};
