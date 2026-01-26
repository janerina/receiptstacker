import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';

import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { MainStackParamList } from '@/navigation/types';
import { hexToRgba } from '@/utils/color';

type Props = NativeStackScreenProps<MainStackParamList, 'WarrantyAlerts'>;

type AlertKind = 'urgent' | 'expiring' | 'active';

type AlertItem = {
  id: string;
  title: string;
  typeLabel: string;
  kind: AlertKind;
  timeRemaining: string;
  expires: string;
  store: string;
  purchaseDate: string;
  receiptId: string;
};

const ALERT_COLORS_LIGHT: Record<AlertKind, { bg: string; border: string; icon: string; title: string }> = {
  urgent: { bg: '#FFF1F1', border: '#FBCACA', icon: '#DC2626', title: '#991B1B' },
  expiring: { bg: '#FFF7E6', border: '#F4D08C', icon: '#D97706', title: '#92400E' },
  active: { bg: '#ECF5FF', border: '#BFD9FF', icon: '#2563EB', title: '#1E3A8A' },
};

export const WarrantyAlertsScreen = ({ navigation }: Props) => {
  const { colors, isDark } = useTheme();
  const primary = COLORS.brand.primary;

  const urgentAccent = isDark ? COLORS.semantic.error : '#DC2626';
  const expiringAccent = isDark ? COLORS.semantic.warning : '#D97706';
  const activeAccent = isDark ? primary : '#2563EB';

  const styles = useMemo(() => createStyles({ colors, isDark, urgentAccent, expiringAccent, activeAccent }), [colors, isDark, urgentAccent, expiringAccent, activeAccent]);

  const urgent: AlertItem[] = useMemo(
    () => [
      {
        id: 'u1',
        title: 'Sony WH-1000XM5',
        typeLabel: 'Warranty',
        kind: 'urgent',
        timeRemaining: '5 days',
        expires: 'Jan 29, 2026',
        store: 'Best Buy',
        purchaseDate: 'Jan 29, 2025',
        receiptId: 'R-001234',
      },
      {
        id: 'u2',
        title: 'Nike Air Max',
        typeLabel: 'Return Window',
        kind: 'urgent',
        timeRemaining: '3 days',
        expires: 'Jan 27, 2026',
        store: 'Nike Store',
        purchaseDate: 'Jan 14, 2026',
        receiptId: 'R-001235',
      },
    ],
    [],
  );

  const expiringSoon: AlertItem[] = useMemo(
    () => [
      {
        id: 'e1',
        title: 'MacBook Pro 16"',
        typeLabel: 'Warranty',
        kind: 'expiring',
        timeRemaining: '16 days',
        expires: 'Feb 9, 2026',
        store: 'Apple Store',
        purchaseDate: 'Feb 9, 2025',
        receiptId: 'R-001236',
      },
      {
        id: 'e2',
        title: 'Samsung Galaxy Watch',
        typeLabel: 'Return Window',
        kind: 'expiring',
        timeRemaining: '11 days',
        expires: 'Feb 4, 2026',
        store: 'Amazon',
        purchaseDate: 'Jan 21, 2026',
        receiptId: 'R-001237',
      },
    ],
    [],
  );

  const active: AlertItem[] = useMemo(
    () => [
      {
        id: 'a1',
        title: 'Dyson V15 Vacuum',
        typeLabel: 'Warranty',
        kind: 'active',
        timeRemaining: '21 days',
        expires: 'Feb 14, 2026',
        store: 'Target',
        purchaseDate: 'Feb 14, 2024',
        receiptId: 'R-001238',
      },
    ],
    [],
  );

  const summary = useMemo(
    () => ({ total: urgent.length + expiringSoon.length + active.length, urgent: urgent.length, active: active.length + expiringSoon.length }),
    [active.length, expiringSoon.length, urgent.length],
  );

  const renderAlertCard = (item: AlertItem) => {
    const light = ALERT_COLORS_LIGHT[item.kind];
    const accent = item.kind === 'urgent' ? urgentAccent : item.kind === 'expiring' ? expiringAccent : activeAccent;
    const themeColors = isDark
      ? {
          bg: hexToRgba(accent, 0.12),
          border: hexToRgba(accent, 0.28),
          icon: accent,
          title: colors.text,
        }
      : light;

    return (
      <View key={item.id} style={[styles.alertCard, { backgroundColor: themeColors.bg, borderColor: themeColors.border }]}
        accessibilityRole="summary">
        <View style={styles.alertTopRow}>
          <View style={styles.alertTopLeft}>
            <Feather name="shield" size={18} color={themeColors.icon} />
            <View style={styles.alertTitleWrap}>
              <Text style={[styles.alertTitle, { color: themeColors.title }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.alertTypeLabel} numberOfLines={1}>
                {item.typeLabel}
              </Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss alert" onPress={() => {}}>
            <Feather name="x" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.alertDetailsBox}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Time Remaining</Text>
            <Text style={[styles.detailValue, { color: themeColors.title }]}>{item.timeRemaining}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expires</Text>
            <Text style={styles.detailValue}>{item.expires}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Store</Text>
            <Text style={styles.detailValue}>{item.store}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Purchase Date</Text>
            <Text style={styles.detailValue}>{item.purchaseDate}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Receipt ID</Text>
            <Text style={styles.detailLink}>{item.receiptId}</Text>
          </View>
        </View>
      </View>
    );
  };

  const sectionHeader = (label: string, icon: React.ReactNode) => (
    <View style={styles.sectionHeader}>
      {icon}
      <Text style={styles.sectionHeaderText}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={styles.backButton}>
            <Feather name="arrow-left" size={ICON_SIZES.md} color={colors.text} />
          </Pressable>

          <View style={styles.topTitles}>
            <Text style={styles.pageTitle}>Warranty & Return Alerts</Text>
            <Text style={styles.pageSubtitle}>Track expiring warranties and return windows</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, styles.summaryTotal]}>
            <View style={styles.summaryIconRow}>
              <Feather name="alert-triangle" size={18} color={expiringAccent} />
              <Text style={styles.summaryLabel}>Total</Text>
            </View>
            <Text style={styles.summaryValue}>{summary.total}</Text>
          </View>

          <View style={[styles.summaryCard, styles.summaryUrgent]}>
            <View style={styles.summaryIconRow}>
              <Feather name="clock" size={18} color={urgentAccent} />
              <Text style={styles.summaryLabel}>Urgent</Text>
            </View>
            <Text style={styles.summaryValue}>{summary.urgent}</Text>
          </View>

          <View style={[styles.summaryCard, styles.summaryActive]}>
            <View style={styles.summaryIconRow}>
              <Feather name="shield" size={18} color={activeAccent} />
              <Text style={styles.summaryLabel}>Active</Text>
            </View>
            <Text style={styles.summaryValue}>{summary.active}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {sectionHeader(`Urgent (${urgent.length})`, <Feather name="alert-triangle" size={18} color={urgentAccent} />)}
        {urgent.map(renderAlertCard)}

        {sectionHeader(`Expiring Soon (${expiringSoon.length})`, <Feather name="clock" size={18} color={expiringAccent} />)}
        {expiringSoon.map(renderAlertCard)}

        {sectionHeader('Active', <Feather name="shield" size={18} color={activeAccent} />)}
        {active.map(renderAlertCard)}

        <View style={{ height: SPACING['2xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
  isDark,
  urgentAccent,
  expiringAccent,
  activeAccent,
}: {
  colors: { background: string; text: string; textSecondary: string; border: string; surface: string };
  isDark: boolean;
  urgentAccent: string;
  expiringAccent: string;
  activeAccent: string;
}) => {
  const pageTitle: TextStyle = {
    ...TYPOGRAPHY.sectionHeading,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '500',
    color: colors.text,
  };

  const pageSubtitle: TextStyle = {
    ...TYPOGRAPHY.bodyNormal,
    color: colors.textSecondary,
    marginTop: 4,
  };

  const summaryValue: TextStyle = {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    color: colors.text,
  };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingBottom: SPACING['2xl'],
    },

    topBar: {
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.lg,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.md,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topTitles: {
      flex: 1,
      paddingRight: SPACING.md,
    },
    pageTitle,
    pageSubtitle,

    summaryRow: {
      paddingHorizontal: SPACING.md,
      flexDirection: 'row',
      gap: SPACING.md,
    },
    summaryCard: {
      flex: 1,
      borderRadius: 18,
      padding: SPACING.lg,
      borderWidth: 1,
    } as ViewStyle,
    summaryTotal: {
      backgroundColor: isDark ? hexToRgba(expiringAccent, 0.12) : '#FFF7E6',
      borderColor: isDark ? hexToRgba(expiringAccent, 0.28) : '#F4D08C',
    },
    summaryUrgent: {
      backgroundColor: isDark ? hexToRgba(urgentAccent, 0.12) : '#FFF1F1',
      borderColor: isDark ? hexToRgba(urgentAccent, 0.28) : '#FBCACA',
    },
    summaryActive: {
      backgroundColor: isDark ? hexToRgba(activeAccent, 0.12) : '#ECF5FF',
      borderColor: isDark ? hexToRgba(activeAccent, 0.28) : '#BFD9FF',
    },
    summaryIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: SPACING.sm,
    },
    summaryLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      fontWeight: '600',
    },
    summaryValue,

    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: SPACING.xl,
      marginBottom: SPACING.lg,
    },

    sectionHeader: {
      paddingHorizontal: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginBottom: SPACING.md,
      marginTop: SPACING.md,
    },
    sectionHeaderText: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
    },

    alertCard: {
      marginHorizontal: SPACING.md,
      borderRadius: 22,
      padding: SPACING.lg,
      borderWidth: 1,
      marginBottom: SPACING.lg,
    },
    alertTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
      gap: SPACING.md,
    },
    alertTopLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      minWidth: 0,
    },
    alertTitleWrap: {
      flex: 1,
      minWidth: 0,
    },
    alertTitle: {
      ...TYPOGRAPHY.cardTitle,
      fontWeight: '500',
    },
    alertTypeLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginTop: 2,
    },

    alertDetailsBox: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    detailLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
    },
    detailValue: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '600',
    },
    detailDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: SPACING.sm,
    },
    detailLink: {
      ...TYPOGRAPHY.bodyNormal,
      color: COLORS.brand.primary,
      fontWeight: '600',
    },
  });
};

export default WarrantyAlertsScreen;
