import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import Modal from 'react-native-modal';

import { Button, Card } from '@/components/common';
import { DatePickerModal } from '@/components/modals/DatePickerModal';
import { OptionPickerModal, type OptionItem } from '@/components/modals/OptionPickerModal';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { MainStackParamList } from '@/navigation/types';
import { addWarrantyAlert, archiveWarrantyAlert, getWarrantyAlerts, type WarrantyAlert, type WarrantyAlertType } from '@/services/database';
import { getWarrantyAlertRemainingDays, syncWarrantyAlertNotifications } from '@/services/warrantyNotifications';
import { hexToRgba } from '@/utils/color';
import { formatDate } from '@/utils/format';

type Props = NativeStackScreenProps<MainStackParamList, 'WarrantyAlerts'>;

type AlertKind = 'urgent' | 'expiring' | 'active';

const ALERT_COLORS_LIGHT: Record<AlertKind, { bg: string; border: string; icon: string; title: string }> = {
  urgent: { bg: '#FFF1F1', border: '#FBCACA', icon: '#DC2626', title: '#991B1B' },
  expiring: { bg: '#FFF7E6', border: '#F4D08C', icon: '#D97706', title: '#92400E' },
  active: { bg: '#ECF5FF', border: '#BFD9FF', icon: '#2563EB', title: '#1E3A8A' },
};

export const WarrantyAlertsScreen = ({ navigation, route }: Props) => {
  const { colors, isDark } = useTheme();
  const primary = COLORS.brand.primary;

  const urgentAccent = isDark ? COLORS.semantic.error : '#DC2626';
  const expiringAccent = isDark ? COLORS.semantic.warning : '#D97706';
  const activeAccent = isDark ? primary : '#2563EB';

  const styles = useMemo(
    () => createStyles({ colors, isDark, urgentAccent, expiringAccent, activeAccent }),
    [colors, isDark, urgentAccent, expiringAccent, activeAccent],
  );

  const [alerts, setAlerts] = useState<WarrantyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeExpanded, setActiveExpanded] = useState(false);

  const [addVisible, setAddVisible] = useState(false);
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const [purchasePickerVisible, setPurchasePickerVisible] = useState(false);
  const [expiryPickerVisible, setExpiryPickerVisible] = useState(false);

  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<WarrantyAlertType>('warranty');
  const [formStore, setFormStore] = useState('');
  const [formPurchaseDate, setFormPurchaseDate] = useState<Date>(new Date());
  const [formExpiryDate, setFormExpiryDate] = useState<Date>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  });
  const [formReceiptId, setFormReceiptId] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const resetForm = useCallback(() => {
    const now = new Date();
    const nextExpiry = new Date(now);
    nextExpiry.setFullYear(now.getFullYear() + 1);
    setFormTitle('');
    setFormType('warranty');
    setFormStore('');
    setFormPurchaseDate(now);
    setFormExpiryDate(nextExpiry);
    setFormReceiptId('');
    setFormNotes('');
  }, []);

  const openAdd = useCallback(
    (prefill?: {
      title?: string;
      alertType?: WarrantyAlertType;
      store?: string;
      purchaseDate?: string;
      expiryDate?: string;
      receiptId?: string;
      notes?: string;
    }) => {
      resetForm();

      if (prefill?.title) setFormTitle(prefill.title);
      if (prefill?.alertType) setFormType(prefill.alertType);
      if (prefill?.store) setFormStore(prefill.store);
      if (prefill?.receiptId) setFormReceiptId(prefill.receiptId);
      if (prefill?.notes) setFormNotes(prefill.notes);

      if (prefill?.purchaseDate) {
        const d = new Date(prefill.purchaseDate);
        if (!Number.isNaN(d.getTime())) setFormPurchaseDate(d);
      }
      if (prefill?.expiryDate) {
        const d = new Date(prefill.expiryDate);
        if (!Number.isNaN(d.getTime())) setFormExpiryDate(d);
      }

      setAddVisible(true);
    },
    [resetForm],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await syncWarrantyAlertNotifications();
      const data = await getWarrantyAlerts({ includeInactive: false });
      setAlerts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load warranty alerts:', e);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const prefill = route?.params?.prefill;
    if (!prefill) return;
    if (addVisible) return;
    openAdd(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.prefill]);

  // Note: We need `route` for optional prefill.


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const typeItems: OptionItem[] = useMemo(
    () => [
      { id: 'warranty', label: 'Warranty' },
      { id: 'return', label: 'Return Window' },
    ],
    [],
  );

  const computeKind = useCallback((a: WarrantyAlert): AlertKind => {
    const d = getWarrantyAlertRemainingDays(a);
    if (d <= 7) return 'urgent';
    if (d <= 30) return 'expiring';
    return 'active';
  }, []);

  const grouped = useMemo(() => {
    const urgent: WarrantyAlert[] = [];
    const expiring: WarrantyAlert[] = [];
    const active: WarrantyAlert[] = [];
    for (const a of alerts) {
      const d = getWarrantyAlertRemainingDays(a);
      if (d < 0) continue;
      const k = computeKind(a);
      if (k === 'urgent') urgent.push(a);
      else if (k === 'expiring') expiring.push(a);
      else active.push(a);
    }
    return { urgent, expiring, active };
  }, [alerts, computeKind]);

  const summary = useMemo(
    () => ({
      total: grouped.urgent.length + grouped.expiring.length + grouped.active.length,
      urgent: grouped.urgent.length,
      active: grouped.expiring.length + grouped.active.length,
    }),
    [grouped.active.length, grouped.expiring.length, grouped.urgent.length],
  );

  const formatRemaining = (a: WarrantyAlert): string => {
    const d = getWarrantyAlertRemainingDays(a);
    if (d <= 0) return '0 days';
    if (d === 1) return '1 day';
    return `${d} days`;
  };

  const renderAlertCard = (item: WarrantyAlert) => {
    const kind = computeKind(item);
    const light = ALERT_COLORS_LIGHT[kind];
    const accent = kind === 'urgent' ? urgentAccent : kind === 'expiring' ? expiringAccent : activeAccent;
    const themeColors = isDark
      ? {
          bg: hexToRgba(accent, 0.12),
          border: hexToRgba(accent, 0.28),
          icon: accent,
          title: colors.text,
        }
      : light;

    const typeLabel = item.alertType === 'return' ? 'Return Window' : 'Warranty';

    return (
      <View
        key={item.id}
        style={[styles.alertCard, { backgroundColor: themeColors.bg, borderColor: themeColors.border }]}
        accessibilityRole="summary"
      >
        <View style={styles.alertTopRow}>
          <View style={styles.alertTopLeft}>
            <Feather name="shield" size={18} color={themeColors.icon} />
            <View style={styles.alertTitleWrap}>
              <Text style={[styles.alertTitle, { color: themeColors.title }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.alertTypeLabel} numberOfLines={1}>
                {typeLabel}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Archive alert"
            onPress={() => {
              Alert.alert('Archive alert?', 'This will remove it from active alerts.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Archive',
                  style: 'destructive',
                  onPress: async () => {
                    await archiveWarrantyAlert(item.id);
                    await load();
                  },
                },
              ]);
            }}
          >
            <Feather name="x" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.alertDetailsBox}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Time Remaining</Text>
            <Text style={[styles.detailValue, { color: themeColors.title }]}>{formatRemaining(item)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expires</Text>
            <Text style={styles.detailValue}>{formatDate(item.expiryDate)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Store</Text>
            <Text style={styles.detailValue}>{item.store ?? '—'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Purchase Date</Text>
            <Text style={styles.detailValue}>{formatDate(item.purchaseDate)}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Receipt ID</Text>
            {item.receiptId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open receipt"
                onPress={() => navigation.navigate('ReceiptDetail', { receiptId: item.receiptId! })}
              >
                <Text style={styles.detailLink}>{item.receiptId}</Text>
              </Pressable>
            ) : (
              <Text style={styles.detailValue}>—</Text>
            )}
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
      >
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={styles.backButton}>
            <Feather name="arrow-left" size={ICON_SIZES.md} color={colors.text} />
          </Pressable>

          <View style={styles.topTitles}>
            <Text style={styles.pageTitle}>Warranty & Return Alerts</Text>
            <Text style={styles.pageSubtitle}>Track expiring warranties and return windows</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add alert"
            onPress={() => openAdd()}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Feather name="plus" size={18} color={colors.text} />
          </Pressable>
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

        {sectionHeader(`Urgent (${grouped.urgent.length})`, <Feather name="alert-triangle" size={18} color={urgentAccent} />)}
        {grouped.urgent.map(renderAlertCard)}

        {sectionHeader(
          `Expiring Soon (${grouped.expiring.length})`,
          <Feather name="clock" size={18} color={expiringAccent} />,
        )}
        {grouped.expiring.map(renderAlertCard)}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle active alerts"
          onPress={() => setActiveExpanded((p) => !p)}
          style={({ pressed }) => [styles.activeHeaderPress, pressed && styles.pressed]}
        >
          {sectionHeader(
            `Active (${grouped.active.length})`,
            <Feather name="shield" size={18} color={activeAccent} />,
          )}
          <Feather name={activeExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
        </Pressable>
        {activeExpanded ? (
          grouped.active.map(renderAlertCard)
        ) : (
          <View style={{ paddingHorizontal: SPACING.md }}>
            <Text style={styles.collapsedHint}>Tap to expand active alerts</Text>
          </View>
        )}

        <View style={{ height: SPACING['2xl'] }} />
      </ScrollView>

      <OptionPickerModal
        visible={typePickerVisible}
        title="Alert Type"
        items={typeItems}
        selectedId={formType}
        onClose={() => setTypePickerVisible(false)}
        onSelect={(item) => setFormType(item.id as WarrantyAlertType)}
      />

      <DatePickerModal
        visible={purchasePickerVisible}
        selectedDate={formPurchaseDate}
        onSelect={setFormPurchaseDate}
        onClose={() => setPurchasePickerVisible(false)}
        title="Purchase Date"
      />

      <DatePickerModal
        visible={expiryPickerVisible}
        selectedDate={formExpiryDate}
        onSelect={setFormExpiryDate}
        onClose={() => setExpiryPickerVisible(false)}
        title="Expiry Date"
        minimumDate={formPurchaseDate}
      />

      <Modal
        isVisible={addVisible}
        onBackdropPress={() => setAddVisible(false)}
        onBackButtonPress={() => setAddVisible(false)}
        backdropOpacity={0.5}
        useNativeDriver
      >
        <Card style={styles.addCard} variant="default">
          <Text style={styles.addTitle}>Add Alert</Text>

          <Text style={styles.fieldLabel}>Product</Text>
          <TextInput
            value={formTitle}
            onChangeText={setFormTitle}
            placeholder="e.g., Sony WH-1000XM5"
            placeholderTextColor={colors.textSecondary}
            style={styles.textInput}
          />

          <Text style={styles.fieldLabel}>Type</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select alert type"
            onPress={() => setTypePickerVisible(true)}
            style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}
          >
            <Text style={styles.pickerValue}>{formType === 'return' ? 'Return Window' : 'Warranty'}</Text>
            <Feather name="chevron-down" size={18} color={colors.textSecondary} />
          </Pressable>

          <Text style={styles.fieldLabel}>Store</Text>
          <TextInput
            value={formStore}
            onChangeText={setFormStore}
            placeholder="e.g., Best Buy"
            placeholderTextColor={colors.textSecondary}
            style={styles.textInput}
          />

          <View style={styles.twoColRow}>
            <View style={styles.twoCol}>
              <Text style={styles.fieldLabel}>Purchase Date</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select purchase date"
                onPress={() => setPurchasePickerVisible(true)}
                style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}
              >
                <Text style={styles.pickerValue}>{formatDate(formPurchaseDate)}</Text>
                <Feather name="calendar" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <View style={styles.twoCol}>
              <Text style={styles.fieldLabel}>Expiry Date</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select expiry date"
                onPress={() => setExpiryPickerVisible(true)}
                style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}
              >
                <Text style={styles.pickerValue}>{formatDate(formExpiryDate)}</Text>
                <Feather name="calendar" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <Text style={styles.fieldLabel}>Receipt ID (optional)</Text>
          <TextInput
            value={formReceiptId}
            onChangeText={setFormReceiptId}
            placeholder="Paste receipt id"
            placeholderTextColor={colors.textSecondary}
            style={styles.textInput}
          />

          <Text style={styles.fieldLabel}>Notes (optional)</Text>
          <TextInput
            value={formNotes}
            onChangeText={setFormNotes}
            placeholder="Any details…"
            placeholderTextColor={colors.textSecondary}
            style={[styles.textInput, styles.notesInput]}
            multiline
          />

          <View style={styles.addActionsRow}>
            <Button title="Cancel" variant="secondary" onPress={() => setAddVisible(false)} style={styles.addActionLeft} />
            <Button
              title="Save"
              variant="primary"
              onPress={async () => {
                const title = formTitle.trim();
                if (!title) {
                  Alert.alert('Missing product', 'Please enter a product name.');
                  return;
                }
                if (formExpiryDate.getTime() < formPurchaseDate.getTime()) {
                  Alert.alert('Invalid dates', 'Expiry date must be on or after purchase date.');
                  return;
                }

                await addWarrantyAlert({
                  title,
                  alertType: formType,
                  store: formStore.trim() || undefined,
                  purchaseDate: formPurchaseDate.toISOString(),
                  expiryDate: formExpiryDate.toISOString(),
                  receiptId: formReceiptId.trim() || undefined,
                  notes: formNotes.trim() || undefined,
                });

                setAddVisible(false);
                await load();
              }}
              style={styles.addActionRight}
            />
          </View>
        </Card>
      </Modal>
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
    addButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
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

    pressed: {
      opacity: 0.7,
    },

    activeHeaderPress: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingRight: SPACING.md,
    },
    collapsedHint: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginTop: -SPACING.sm,
      marginBottom: SPACING.md,
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

    addCard: {
      padding: SPACING.lg,
      borderRadius: RADIUS.lg,
    },
    addTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },
    fieldLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginTop: SPACING.sm,
      marginBottom: SPACING.xs,
    },
    textInput: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      color: colors.text,
    },
    notesInput: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    pickerRow: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pickerValue: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '600',
    },
    twoColRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    twoCol: {
      flex: 1,
    },
    addActionsRow: {
      flexDirection: 'row',
      marginTop: SPACING.lg,
    },
    addActionLeft: {
      flex: 1,
      marginRight: SPACING.sm,
    },
    addActionRight: {
      flex: 1,
      marginLeft: SPACING.sm,
    },
  });
};

export default WarrantyAlertsScreen;
