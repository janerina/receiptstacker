import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView as RNScrollView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Feather from 'react-native-vector-icons/Feather';

import { DatePickerModal } from '@/components/modals/DatePickerModal';
import type { OptionItem } from '@/components/modals/OptionPickerModal';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import type { MainStackParamList } from '@/navigation/types';
import {
  addWarrantyAlert,
  archiveWarrantyAlert,
  getWarrantyAlerts,
  getWarrantyAlertUniqueStores,
  type WarrantyAlert,
  type WarrantyAlertType,
} from '@/services/database';
import { syncWarrantyAlertNotifications } from '@/services/warrantyNotifications';
import { hexToRgba } from '@/utils/color';
import { formatCurrency, formatDate } from '@/utils/format';
import { calculateWarrantyStatus, type WarrantyStatus } from '@/utils/warrantyAlerts';

type Props = NativeStackScreenProps<MainStackParamList, 'WarrantyAlerts'>;

const CATEGORIES = [
  'Appliances',
  'Automotive',
  'Clothing',
  'Electronics',
  'Furniture',
  'Home & Garden',
  'Jewelry',
  'Other',
  'Sports & Outdoors',
] as const;

const SORT_ITEMS: Array<OptionItem & { id: 'expiry' | 'purchase' | 'amount' | 'name' }> = [
  { id: 'expiry', label: 'Expiry Date' },
  { id: 'purchase', label: 'Purchase Date' },
  { id: 'amount', label: 'Purchase Amount' },
  { id: 'name', label: 'Item Name' },
];

export const WarrantyAlertsScreen = ({ navigation, route }: Props) => {
  const { colors, isDark } = useTheme();
  const primary = COLORS.brand.primary;

  const warrantyAccent = '#2563EB';
  const returnAccent = '#7C3AED';
  const criticalAccent = '#DC2626';
  const warningAccent = '#D97706';
  const activeAccent = '#059669';
  const expiredAccent = '#6B7280';

  const styles = useMemo(
    () =>
      createStyles({
        colors,
        isDark,
        primary,
        warrantyAccent,
        returnAccent,
        criticalAccent,
        warningAccent,
        activeAccent,
        expiredAccent,
      }),
    [
      colors,
      isDark,
      primary,
      warrantyAccent,
      returnAccent,
      criticalAccent,
      warningAccent,
      activeAccent,
      expiredAccent,
    ],
  );

  const [alerts, setAlerts] = useState<WarrantyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | WarrantyStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | WarrantyAlertType>('all');
  const [filterStore, setFilterStore] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [sortBy, setSortBy] = useState<(typeof SORT_ITEMS)[number]['id']>('expiry');
  const [sortPickerVisible, setSortPickerVisible] = useState(false);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [purchasePickerVisible, setPurchasePickerVisible] = useState(false);
  const [expiryPickerVisible, setExpiryPickerVisible] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);

  const [storeSuggestions, setStoreSuggestions] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expiryTouched, setExpiryTouched] = useState(false);

  const [newWarranty, setNewWarranty] = useState({
    itemName: '',
    store: '',
    purchaseDate: new Date(),
    purchaseAmount: '',
    type: 'warranty' as WarrantyAlertType,
    expiryDate: (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      return d;
    })(),
    warrantyLength: '',
    category: 'Electronics',
    notes: '',
  });

  const resetForm = useCallback(() => {
    const now = new Date();
    const expiry = new Date(now);
    expiry.setFullYear(expiry.getFullYear() + 1);
    setNewWarranty({
      itemName: '',
      store: '',
      purchaseDate: now,
      purchaseAmount: '',
      type: 'warranty',
      expiryDate: expiry,
      warrantyLength: '',
      category: 'Electronics',
      notes: '',
    });
    setExpiryTouched(false);
    setCategoryDropdownOpen(false);
  }, []);

  const openNativeDatePickerAndroid = useCallback(
    ({
      value,
      min,
      max,
      onSelect,
    }: {
      value: Date;
      min?: Date;
      max?: Date;
      onSelect: (d: Date) => void;
    }) => {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        minimumDate: min,
        maximumDate: max,
        onChange: (_event, selected) => {
          if (!selected) return;
          const next = new Date(value);
          next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
          onSelect(next);
        },
      });
    },
    [],
  );

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

      setNewWarranty(p => ({
        ...p,
        itemName: prefill?.title ?? p.itemName,
        type: prefill?.alertType ?? p.type,
        store: prefill?.store ?? p.store,
        notes: prefill?.notes ?? p.notes,
      }));

      if (prefill?.purchaseDate) {
        const d = new Date(prefill.purchaseDate);
        if (!Number.isNaN(d.getTime())) setNewWarranty(p => ({ ...p, purchaseDate: d }));
      }
      if (prefill?.expiryDate) {
        const d = new Date(prefill.expiryDate);
        if (!Number.isNaN(d.getTime())) {
          setNewWarranty(p => ({ ...p, expiryDate: d }));
          setExpiryTouched(true);
        }
      }

      setIsAddModalOpen(true);
    },
    [resetForm],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await syncWarrantyAlertNotifications();
      const data = await getWarrantyAlerts({ includeInactive: false });
      setAlerts(Array.isArray(data) ? data : []);
      setStoreSuggestions(await getWarrantyAlertUniqueStores());
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
    if (isAddModalOpen) return;
    openAdd(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.prefill]);

  // Note: We need `route` for optional prefill.


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toStartOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  const calculateStatus = useCallback((a: WarrantyAlert): { status: WarrantyStatus; daysRemaining: number } => {
    return calculateWarrantyStatus(a.expiryDate);
  }, []);

  const counts = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let active = 0;
    let expired = 0;
    for (const a of alerts) {
      const s = calculateStatus(a).status;
      if (s === 'critical') critical += 1;
      else if (s === 'warning') warning += 1;
      else if (s === 'active') active += 1;
      else expired += 1;
    }
    return { critical, warning, active, expired };
  }, [alerts, calculateStatus]);

  const currency = useCallback((value?: number) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return formatCurrency(value);
  }, []);

  const statusLabel = (s: WarrantyStatus) => {
    if (s === 'critical') return 'Critical';
    if (s === 'warning') return 'Warning';
    if (s === 'active') return 'Active';
    return 'Expired';
  };

  const filteredAlerts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const storeQ = filterStore.trim().toLowerCase();
    const min = minAmount.trim() ? Number(minAmount) : undefined;
    const max = maxAmount.trim() ? Number(maxAmount) : undefined;

    const out = alerts.filter(a => {
      const { status } = calculateStatus(a);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (typeFilter !== 'all' && a.alertType !== typeFilter) return false;

      if (storeQ) {
        const s = (a.store ?? '').toLowerCase();
        if (!s.includes(storeQ)) return false;
      }

      if (q) {
        const hay = `${a.title} ${(a.store ?? '')} ${(a.notes ?? '')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      const amount = typeof a.purchaseAmount === 'number' ? a.purchaseAmount : undefined;
      if (typeof min === 'number' && !Number.isNaN(min)) {
        if (typeof amount !== 'number' || amount < min) return false;
      }
      if (typeof max === 'number' && !Number.isNaN(max)) {
        if (typeof amount !== 'number' || amount > max) return false;
      }

      return true;
    });

    const cmpStr = (x: string, y: string) => x.localeCompare(y, undefined, { sensitivity: 'base' });
    out.sort((a, b) => {
      if (sortBy === 'name') return cmpStr(a.title, b.title);
      if (sortBy === 'amount') return (b.purchaseAmount ?? -1) - (a.purchaseAmount ?? -1);
      if (sortBy === 'purchase') return new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime();
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    });

    return out;
  }, [
    alerts,
    calculateStatus,
    filterStore,
    maxAmount,
    minAmount,
    searchQuery,
    sortBy,
    statusFilter,
    typeFilter,
  ]);

  const storeSuggestionsFiltered = useMemo(() => {
    const q = newWarranty.store.trim().toLowerCase();
    if (!q) return [];
    return storeSuggestions.filter(s => s.toLowerCase().includes(q)).slice(0, 5);
  }, [newWarranty.store, storeSuggestions]);

  useEffect(() => {
    if (expiryTouched) return;

    const purchase = toStartOfDay(newWarranty.purchaseDate);
    const expiry = new Date(purchase);
    expiry.setDate(expiry.getDate() + (newWarranty.type === 'warranty' ? 365 : 30));
    setNewWarranty(p => ({ ...p, expiryDate: expiry }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newWarranty.purchaseDate, newWarranty.type]);

  const validateForm = useCallback((): { ok: boolean; message?: string } => {
    if (!newWarranty.itemName.trim()) return { ok: false };
    if (!newWarranty.store.trim()) return { ok: false };
    if (!newWarranty.purchaseAmount.trim()) return { ok: false };
    const amount = Number(newWarranty.purchaseAmount);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false };

    const purchase = toStartOfDay(newWarranty.purchaseDate);
    const expiry = toStartOfDay(newWarranty.expiryDate);
    const today = toStartOfDay(new Date());
    if (purchase.getTime() > today.getTime()) return { ok: false, message: 'Purchase date cannot be in the future.' };
    if (expiry.getTime() <= purchase.getTime()) return { ok: false, message: 'Expiry date must be after purchase date.' };
    return { ok: true };
  }, [newWarranty, toStartOfDay]);

  const isFormValid = useMemo(() => validateForm().ok, [validateForm]);

  const handleSave = useCallback(async () => {
    const result = validateForm();
    if (!result.ok) {
      if (result.message) Alert.alert('Error', result.message);
      return;
    }

    try {
      setIsSubmitting(true);
      await addWarrantyAlert({
        title: newWarranty.itemName.trim(),
        alertType: newWarranty.type,
        store: newWarranty.store.trim(),
        purchaseDate: newWarranty.purchaseDate.toISOString(),
        purchaseAmount: Number(newWarranty.purchaseAmount),
        expiryDate: newWarranty.expiryDate.toISOString(),
        warrantyLength: newWarranty.warrantyLength.trim() || undefined,
        category: newWarranty.category,
        notes: newWarranty.notes.trim() || undefined,
        manualEntry: true,
      });

      setIsAddModalOpen(false);
      resetForm();
      await load();
    } catch (e) {
      console.error('Failed to save warranty alert:', e);
      Alert.alert('Error', 'Failed to save warranty alert. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [load, newWarranty, resetForm, validateForm]);

  const chip = (
    label: string,
    selected: boolean,
    onPress: () => void,
    opts?: { columns?: 2 | 3; variant?: 'primary' | 'neutral' },
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        (opts?.variant ?? 'neutral') === 'primary' ? styles.filterChipPrimary : styles.filterChipNeutral,
        (opts?.columns ?? 2) === 3 ? styles.filterChipThird : styles.filterChipHalf,
        selected && styles.filterChipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{label}</Text>
    </Pressable>
  );

  const statusColors = (s: WarrantyStatus) => {
    if (s === 'critical') return { bg: '#FEE2E2', border: '#FCA5A5', text: '#B91C1C', icon: criticalAccent };
    if (s === 'warning') return { bg: '#FEF3C7', border: '#FCD34D', text: '#B45309', icon: warningAccent };
    if (s === 'active') return { bg: '#D1FAE5', border: '#6EE7B7', text: '#047857', icon: activeAccent };
    return { bg: '#F3F4F6', border: '#E5E7EB', text: '#374151', icon: expiredAccent };
  };

  const renderAlertCard = (item: WarrantyAlert) => {
    const { status, daysRemaining } = calculateStatus(item);
    const sc = statusColors(status);
    const typeAccent = item.alertType === 'return' ? returnAccent : warrantyAccent;
    const shieldBg = item.alertType === 'return' ? '#EDE9FE' : '#DBEAFE';
    const daysLabel = status === 'expired' ? 'Expired' : `${Math.max(daysRemaining, 0)} days left`;
    const typeLabel = item.alertType === 'return' ? 'Return Window' : 'Warranty';

    return (
      <Pressable
        key={item.id}
        onLongPress={() => {
          Alert.alert('Archive alert?', 'This will remove it from your tracked list.', [
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
        style={({ pressed }) => [
          styles.itemCard,
          { backgroundColor: isDark ? hexToRgba(sc.icon, 0.12) : sc.bg, borderColor: isDark ? hexToRgba(sc.icon, 0.25) : sc.border },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.itemTopRow}>
          <View style={styles.itemTopLeft}>
            <View style={[styles.itemIconCircle, { backgroundColor: shieldBg }]}
              >
              <Feather name="shield" size={20} color={typeAccent} />
            </View>
            <Text style={styles.itemTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </View>

          <View style={styles.itemTopRight}>
            <Text style={styles.itemAmount}>{currency(item.purchaseAmount)}</Text>
            <Text style={[styles.itemDaysLeft, { color: isDark ? colors.textSecondary : sc.text }]}>{daysLabel}</Text>
          </View>
        </View>

        <View style={styles.itemChipsRow}>
          <View style={[styles.itemPill, { backgroundColor: isDark ? hexToRgba(sc.icon, 0.16) : hexToRgba(sc.icon, 0.12) }]}
            >
            <Feather
              name={status === 'expired' ? 'x-circle' : status === 'critical' ? 'alert-triangle' : status === 'warning' ? 'clock' : 'check-circle'}
              size={14}
              color={isDark ? sc.icon : sc.text}
            />
            <Text style={[styles.itemPillText, { color: isDark ? colors.text : sc.text }]}>{statusLabel(status)}</Text>
          </View>
          <View
            style={[styles.itemPill, { backgroundColor: isDark ? hexToRgba(typeAccent, 0.16) : hexToRgba(typeAccent, 0.12) }]}
          >
            <Text style={[styles.itemPillText, { color: isDark ? colors.text : typeAccent }]}>{typeLabel}</Text>
          </View>
        </View>

        <View style={styles.itemDivider} />

        <View style={styles.itemInfoGrid}>
          <View style={styles.itemInfoCell}>
            <Feather name="shopping-bag" size={16} color={isDark ? colors.textSecondary : sc.text} />
            <Text style={[styles.itemInfoText, { color: isDark ? colors.text : sc.text }]} numberOfLines={1}>
              {item.store ?? '—'}
            </Text>
          </View>
          <View style={styles.itemInfoCell}>
            <Feather name="calendar" size={16} color={isDark ? colors.textSecondary : sc.text} />
            <Text style={[styles.itemInfoText, { color: isDark ? colors.text : sc.text }]}>{formatDate(item.purchaseDate)}</Text>
          </View>
          <View style={styles.itemInfoCell}>
            <Feather name="clock" size={16} color={isDark ? colors.textSecondary : sc.text} />
            <Text style={[styles.itemInfoText, { color: isDark ? colors.text : sc.text }]}>{`Expires ${formatDate(item.expiryDate)}`}</Text>
          </View>
          <View style={styles.itemInfoCell}>
            <Feather name="shield" size={16} color={isDark ? colors.textSecondary : sc.text} />
            <Text style={[styles.itemInfoText, { color: isDark ? colors.text : sc.text }]} numberOfLines={1}>
              {item.warrantyLength?.trim() ? item.warrantyLength : '—'}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

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
            <Text style={styles.pageSubtitle}>{`${alerts.length} items tracked`}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add alert"
            onPress={() => openAdd()}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Feather name="plus" size={18} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Feather name="search" size={18} color={colors.textSecondary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search warranties and returns..."
              placeholderTextColor={colors.textSecondary}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="search"
            />
            {searchQuery.trim().length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setSearchQuery('')}
                style={({ pressed }) => [styles.searchClearButton, pressed && styles.pressed]}
              >
                <Feather name="x" size={18} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filters"
            onPress={() => setFilterOpen(p => !p)}
            style={({ pressed }) => [styles.filterButton, filterOpen && styles.filterButtonActive, pressed && styles.pressed]}
          >
            <Feather name="filter" size={18} color={filterOpen ? '#fff' : colors.text} />
          </Pressable>
        </View>

        {filterOpen ? (
          <View style={styles.filterPanel}>
            <Text style={styles.filterSectionLabel}>Status</Text>
            <View style={styles.filterGrid2}>
              {chip(
                `All (${alerts.length})`,
                statusFilter === 'all',
                () => setStatusFilter('all'),
                { columns: 2, variant: 'primary' },
              )}
              {chip(`Critical (${counts.critical})`, statusFilter === 'critical', () => setStatusFilter('critical'), { columns: 2 })}
              {chip(`Warning (${counts.warning})`, statusFilter === 'warning', () => setStatusFilter('warning'), { columns: 2 })}
              {chip(`Active (${counts.active})`, statusFilter === 'active', () => setStatusFilter('active'), { columns: 2 })}
            </View>

            <Text style={[styles.filterSectionLabel, { marginTop: SPACING.md }]}>Type</Text>
            <View style={styles.filterGrid3}>
              {chip('All', typeFilter === 'all', () => setTypeFilter('all'), { columns: 3, variant: 'primary' })}
              {chip('Warranty', typeFilter === 'warranty', () => setTypeFilter('warranty'), { columns: 3 })}
              {chip('Return', typeFilter === 'return', () => setTypeFilter('return'), { columns: 3 })}
            </View>

            <Text style={[styles.filterSectionLabel, { marginTop: SPACING.md }]}>Store</Text>
            <TextInput
              value={filterStore}
              onChangeText={setFilterStore}
              placeholder="Filter by store..."
              placeholderTextColor={colors.textSecondary}
              autoCorrect={false}
              spellCheck={false}
              style={styles.filterTextInput}
            />

            <Text style={[styles.filterSectionLabel, { marginTop: SPACING.md }]}>Purchase Amount</Text>
            <View style={styles.row2}>
              <TextInput
                value={minAmount}
                onChangeText={setMinAmount}
                placeholder="Min ($)"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                autoCorrect={false}
                spellCheck={false}
                style={[styles.filterTextInput, styles.half]}
              />
              <TextInput
                value={maxAmount}
                onChangeText={setMaxAmount}
                placeholder="Max ($)"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                autoCorrect={false}
                spellCheck={false}
                style={[styles.filterTextInput, styles.half]}
              />
            </View>

            <Text style={[styles.filterSectionLabel, { marginTop: SPACING.md }]}>Sort By</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sort by"
              onPress={() => setSortPickerVisible(v => !v)}
              style={({ pressed }) => [styles.selectRow, pressed && styles.pressed]}
            >
              <Text style={styles.selectRowText}>{SORT_ITEMS.find(i => i.id === sortBy)?.label ?? 'Expiry Date'}</Text>
              <Feather name={sortPickerVisible ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
            </Pressable>

            {sortPickerVisible ? (
              <View style={styles.dropdownPanel}>
                <RNScrollView
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  style={styles.dropdownScroll}
                >
                  {SORT_ITEMS.map((it) => {
                    const selected = it.id === sortBy;
                    return (
                      <Pressable
                        key={it.id}
                        accessibilityRole="button"
                        accessibilityLabel={it.label}
                        onPress={() => {
                          setSortBy(it.id);
                          setSortPickerVisible(false);
                        }}
                        style={({ pressed }) => [
                          styles.dropdownOption,
                          selected && styles.dropdownOptionSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.dropdownOptionText, selected && styles.dropdownOptionTextSelected]}>{it.label}</Text>
                      </Pressable>
                    );
                  })}
                </RNScrollView>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              onPress={() => {
              <Feather name="plus" size={18} color="#fff" />
                setTypeFilter('all');
                setFilterStore('');
                setMinAmount('');
                setMaxAmount('');
                setSortBy('expiry');
              }}
              style={({ pressed }) => [styles.clearFiltersButton, pressed && styles.pressed]}
            >
              <Text style={styles.clearFiltersText}>Clear All Filters</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statCritical]}>
            <Feather name="alert-triangle" size={20} color={criticalAccent} />
            <Text style={[styles.statValue, { color: criticalAccent }]}>{counts.critical}</Text>
            <Text style={[styles.statLabel, { color: criticalAccent }]}>Critical</Text>
          </View>
          <View style={[styles.statCard, styles.statWarning]}>
            <Feather name="clock" size={20} color={warningAccent} />
            <Text style={[styles.statValue, { color: warningAccent }]}>{counts.warning}</Text>
            <Text style={[styles.statLabel, { color: warningAccent }]}>Warning</Text>
          </View>
          <View style={[styles.statCard, styles.statActive]}>
            <Feather name="check-circle" size={20} color={activeAccent} />
            <Text style={[styles.statValue, { color: activeAccent }]}>{counts.active}</Text>
            <Text style={[styles.statLabel, { color: activeAccent }]}>Active</Text>
          </View>
          <View style={[styles.statCard, styles.statExpired]}>
            <Feather name="x-circle" size={20} color={expiredAccent} />
            <Text style={[styles.statValue, { color: expiredAccent }]}>{counts.expired}</Text>
            <Text style={[styles.statLabel, { color: expiredAccent }]}>Expired</Text>
          </View>
        </View>

        <View style={styles.listWrap}>
          {loading ? (
            <Text style={styles.emptyText}>Loading…</Text>
          ) : filteredAlerts.length === 0 ? (
            <Text style={styles.emptyText}>No alerts match your filters.</Text>
          ) : (
            filteredAlerts.map(renderAlertCard)
          )}
        </View>

        <View style={{ height: SPACING['2xl'] }} />
      </ScrollView>

      {/* Sort picker is inline in the filter panel (dropdown list) */}

      {Platform.OS !== 'android' ? (
        <DatePickerModal
          visible={purchasePickerVisible}
          selectedDate={newWarranty.purchaseDate}
          onSelect={d => setNewWarranty(p => ({ ...p, purchaseDate: d }))}
          onClose={() => setPurchasePickerVisible(false)}
          title="Purchase Date"
          maximumDate={new Date()}
        />
      ) : null}

      {Platform.OS !== 'android' ? (
        <DatePickerModal
          visible={expiryPickerVisible}
          selectedDate={newWarranty.expiryDate}
          onSelect={d => {
            setExpiryTouched(true);
            setNewWarranty(p => ({ ...p, expiryDate: d }));
          }}
          onClose={() => setExpiryPickerVisible(false)}
          title={newWarranty.type === 'return' ? 'Return Window Ends' : 'Warranty Expires'}
          minimumDate={newWarranty.purchaseDate}
        />
      ) : null}

      <Modal
        visible={isAddModalOpen}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={() => setIsAddModalOpen(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Warranty / Return Alert</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setIsAddModalOpen(false)}
                style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
              >
                <Feather name="x" size={22} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalContent}
              contentContainerStyle={{ paddingBottom: 140 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              <Text style={styles.fieldLabelReq}>Type *</Text>
              <View style={styles.typeRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Warranty"
                  onPress={() => setNewWarranty(p => ({ ...p, type: 'warranty' }))}
                  style={({ pressed }) => [
                    styles.typeButton,
                    newWarranty.type === 'warranty' && styles.typeButtonWarrantyActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Feather
                    name="shield"
                    size={16}
                    color={newWarranty.type === 'warranty' ? '#fff' : colors.text}
                  />
                  <Text style={[styles.typeButtonText, newWarranty.type === 'warranty' && styles.typeButtonTextActive]}>Warranty</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Return Window"
                  onPress={() => setNewWarranty(p => ({ ...p, type: 'return' }))}
                  style={({ pressed }) => [
                    styles.typeButton,
                    newWarranty.type === 'return' && styles.typeButtonReturnActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Feather
                    name="clock"
                    size={16}
                    color={newWarranty.type === 'return' ? '#fff' : colors.text}
                  />
                  <Text style={[styles.typeButtonText, newWarranty.type === 'return' && styles.typeButtonTextActive]}>Return Window</Text>
                </Pressable>
              </View>

              <Text style={styles.fieldLabelReq}>Item Name *</Text>
              <TextInput
                value={newWarranty.itemName}
                onChangeText={t => setNewWarranty(p => ({ ...p, itemName: t }))}
                placeholder="e.g., Sony WH-1000XM5 Headphones"
                placeholderTextColor={colors.textSecondary}
                style={styles.textInput}
                maxLength={100}
                autoCapitalize="words"
                autoCorrect={false}
                spellCheck={false}
                testID="item-name-input"
              />

              <Text style={styles.fieldLabelReq}>Store / Merchant *</Text>
              <TextInput
                value={newWarranty.store}
                onChangeText={t => setNewWarranty(p => ({ ...p, store: t }))}
                placeholder="e.g., Best Buy"
                placeholderTextColor={colors.textSecondary}
                style={styles.textInput}
                maxLength={50}
                autoCapitalize="words"
                autoCorrect={false}
                spellCheck={false}
                testID="store-input"
              />
              {storeSuggestionsFiltered.length ? (
                <View style={styles.suggestionsBox}>
                  {storeSuggestionsFiltered.map(s => (
                    <Pressable
                      key={s}
                      accessibilityRole="button"
                      accessibilityLabel={`Use store ${s}`}
                      onPress={() => setNewWarranty(p => ({ ...p, store: s }))}
                      style={({ pressed }) => [styles.suggestionRow, pressed && styles.pressed]}
                    >
                      <Text style={styles.suggestionText}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={styles.row2}>
                <View style={styles.half}>
                  <Text style={styles.fieldLabelReq}>Purchase Date *</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Select purchase date"
                    onPress={() => {
                      if (Platform.OS === 'android') {
                        openNativeDatePickerAndroid({
                          value: newWarranty.purchaseDate,
                          max: new Date(),
                          onSelect: (d) => setNewWarranty((p) => ({ ...p, purchaseDate: d })),
                        });
                        return;
                      }
                      setPurchasePickerVisible(true);
                    }}
                    style={({ pressed }) => [styles.selectRow, pressed && styles.pressed]}
                  >
                    <Text style={styles.selectRowText}>{formatDate(newWarranty.purchaseDate)}</Text>
                    <Feather name="calendar" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <View style={styles.half}>
                  <Text style={styles.fieldLabelReq}>Amount *</Text>
                  <TextInput
                    value={newWarranty.purchaseAmount}
                    onChangeText={t => setNewWarranty(p => ({ ...p, purchaseAmount: t }))}
                    placeholder="0.00"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="decimal-pad"
                    autoCorrect={false}
                    spellCheck={false}
                    style={styles.textInput}
                  />
                </View>
              </View>

              <View style={styles.row2}>
                <View style={styles.half}>
                  <Text style={styles.fieldLabelReq}>{newWarranty.type === 'return' ? 'Return Window Ends *' : 'Warranty Expires *'}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Select expiry date"
                    onPress={() => {
                      if (Platform.OS === 'android') {
                        openNativeDatePickerAndroid({
                          value: newWarranty.expiryDate,
                          min: newWarranty.purchaseDate,
                          onSelect: (d) => {
                            setExpiryTouched(true);
                            setNewWarranty((p) => ({ ...p, expiryDate: d }));
                          },
                        });
                        return;
                      }
                      setExpiryPickerVisible(true);
                    }}
                    style={({ pressed }) => [styles.selectRow, pressed && styles.pressed]}
                  >
                    <Text style={styles.selectRowText}>{formatDate(newWarranty.expiryDate)}</Text>
                    <Feather name="calendar" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <View style={styles.half}>
                  <Text style={styles.fieldLabel}>Coverage Period</Text>
                  <TextInput
                    value={newWarranty.warrantyLength}
                    onChangeText={t => setNewWarranty(p => ({ ...p, warrantyLength: t }))}
                    placeholder="e.g., 1 year, 30 days"
                    placeholderTextColor={colors.textSecondary}
                    style={styles.textInput}
                    maxLength={20}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Category</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select category"
                onPress={() => setCategoryDropdownOpen((v) => !v)}
                style={({ pressed }) => [styles.selectRow, pressed && styles.pressed]}
              >
                <Text style={styles.selectRowText}>{newWarranty.category}</Text>
                <Feather name="chevron-down" size={18} color={colors.textSecondary} />
              </Pressable>

              {categoryDropdownOpen ? (
                <View style={styles.inlineDropdownPanel}>
                  <ScrollView
                    style={styles.inlineDropdownScroll}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    {CATEGORIES.map((c) => {
                      const selected = c === newWarranty.category;
                      return (
                        <Pressable
                          key={c}
                          accessibilityRole="button"
                          accessibilityLabel={`Select category ${c}`}
                          onPress={() => {
                            setNewWarranty((p) => ({ ...p, category: c }));
                            setCategoryDropdownOpen(false);
                          }}
                          style={({ pressed }) => [
                            styles.inlineDropdownRow,
                            selected ? styles.inlineDropdownRowSelected : null,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.inlineDropdownText} numberOfLines={1}>
                            {c}
                          </Text>
                          {selected ? <Feather name="check" size={18} color={primary} /> : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>Notes (Optional)</Text>
              <TextInput
                value={newWarranty.notes}
                onChangeText={t => setNewWarranty(p => ({ ...p, notes: t }))}
                placeholder="Add any additional information..."
                placeholderTextColor={colors.textSecondary}
                style={[styles.textInput, styles.textArea]}
                maxLength={500}
                multiline
              />

              <View style={styles.infoCard}>
                <View style={styles.infoTitleRow}>
                  <Feather name="alert-triangle" size={16} color={primary} />
                  <Text style={styles.infoTitle}>Reminder Tips</Text>
                </View>
                <Text style={styles.infoText}>{`• We'll send you alerts 7, 3, and 1 day before expiry\n• Keep your receipt and warranty documents safe\n• Take photos of receipts for warranty claims`}</Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => {
                  resetForm();
                  setIsAddModalOpen(false);
                }}
                style={({ pressed }) => [styles.footerButton, styles.cancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add Alert"
                onPress={handleSave}
                disabled={!isFormValid || isSubmitting}
                style={({ pressed }) => [
                  styles.footerButton,
                  styles.addButtonPrimary,
                  (!isFormValid || isSubmitting) && styles.disabledButton,
                  pressed && styles.pressed,
                ]}
              >
                {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.addButtonText}>Add Alert</Text>}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
  isDark,
  primary,
  warrantyAccent,
  returnAccent,
  criticalAccent,
  warningAccent,
  activeAccent,
  expiredAccent,
}: {
  colors: { background: string; text: string; textSecondary: string; border: string; surface: string };
  isDark: boolean;
  primary: string;
  warrantyAccent: string;
  returnAccent: string;
  criticalAccent: string;
  warningAccent: string;
  activeAccent: string;
  expiredAccent: string;
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
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: primary,
    },
    pageTitle,
    pageSubtitle,

    searchRow: {
      paddingHorizontal: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      marginBottom: SPACING.lg,
    },
    searchInputWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      minHeight: 52,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: 15,
      paddingVertical: 0,
    },
    searchClearButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterButton: {
      width: 52,
      height: 52,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterButtonActive: {
      backgroundColor: primary,
      borderColor: primary,
    },

    filterPanel: {
      marginHorizontal: SPACING.md,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    filterSectionLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      fontWeight: '600',
      marginBottom: SPACING.sm,
    },
    filterGrid2: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    filterGrid3: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    filterChip: {
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    filterChipHalf: {
      width: '48%',
    },
    filterChipThird: {
      width: '31%',
    },
    filterChipNeutral: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    filterChipPrimary: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    filterChipSelected: {
      borderColor: primary,
      backgroundColor: hexToRgba(primary, 0.14),
    },
    filterChipText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '600',
    },
    filterChipTextSelected: {
      color: primary,
    },
    filterTextInput: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      color: colors.text,
      minHeight: 52,
    },
    row2: {
      flexDirection: 'row',
      gap: SPACING.md,
    },
    half: {
      flex: 1,
    },
    selectRow: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 52,
    },
    selectRowText: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '500',
    },

    inlineDropdownPanel: {
      marginTop: SPACING.sm,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    inlineDropdownScroll: {
      maxHeight: 220,
    },
    inlineDropdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    inlineDropdownRowSelected: {
      backgroundColor: isDark ? '#2563EB22' : '#EAF2FF',
    },
    inlineDropdownText: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '500',
      flex: 1,
      paddingRight: SPACING.md,
    },

    dropdownPanel: {
      marginTop: SPACING.sm,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    dropdownScroll: {
      maxHeight: 220,
    },
    dropdownOption: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    dropdownOptionSelected: {
      backgroundColor: isDark ? '#2563EB22' : '#EAF2FF',
    },
    dropdownOptionText: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '500',
    },
    dropdownOptionTextSelected: {
      color: primary,
      fontWeight: '700',
    },
    clearFiltersButton: {
      marginTop: SPACING.lg,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    clearFiltersText: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '600',
    },

    statsRow: {
      paddingHorizontal: SPACING.md,
      flexDirection: 'row',
      gap: SPACING.md,
      marginBottom: SPACING.lg,
    },
    statCard: {
      flex: 1,
      borderRadius: 18,
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 96,
    } as ViewStyle,
    statCritical: {
      backgroundColor: isDark ? hexToRgba(criticalAccent, 0.14) : '#FEE2E2',
      borderColor: isDark ? hexToRgba(criticalAccent, 0.25) : '#FCA5A5',
    },
    statWarning: {
      backgroundColor: isDark ? hexToRgba(warningAccent, 0.14) : '#FEF3C7',
      borderColor: isDark ? hexToRgba(warningAccent, 0.25) : '#FCD34D',
    },
    statActive: {
      backgroundColor: isDark ? hexToRgba(activeAccent, 0.14) : '#D1FAE5',
      borderColor: isDark ? hexToRgba(activeAccent, 0.25) : '#6EE7B7',
    },
    statExpired: {
      backgroundColor: isDark ? hexToRgba(expiredAccent, 0.14) : '#F3F4F6',
      borderColor: isDark ? hexToRgba(expiredAccent, 0.25) : '#E5E7EB',
    },
    statValue: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '800',
    },
    statLabel: {
      ...TYPOGRAPHY.bodySmall,
      fontWeight: '700',
    },

    listWrap: {
      paddingHorizontal: SPACING.md,
    },
    emptyText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.lg,
    },

    itemCard: {
      borderRadius: 22,
      borderWidth: 1,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    itemTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPACING.md,
    },
    itemTopLeft: {
      flex: 1,
      flexDirection: 'row',
      gap: SPACING.md,
      alignItems: 'center',
      minWidth: 0,
    },
    itemIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemTitle: {
      ...TYPOGRAPHY.sectionHeading,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '700',
      color: colors.text,
      flex: 1,
    },
    itemTopRight: {
      alignItems: 'flex-end',
      gap: 2,
    },
    itemAmount: {
      ...TYPOGRAPHY.sectionHeading,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '800',
      color: colors.text,
    },
    itemDaysLeft: {
      ...TYPOGRAPHY.bodySmall,
      fontWeight: '600',
    },
    itemChipsRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginTop: SPACING.md,
      alignItems: 'center',
    },
    itemPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    itemPillText: {
      ...TYPOGRAPHY.bodySmall,
      fontWeight: '700',
    },
    itemDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? hexToRgba(colors.border, 0.8) : '#E5E7EB',
      marginVertical: SPACING.md,
    },
    itemInfoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.md,
    },
    itemInfoCell: {
      width: '47%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    itemInfoText: {
      ...TYPOGRAPHY.bodyNormal,
      fontWeight: '600',
      flex: 1,
    },

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
      backgroundColor: isDark ? hexToRgba(warningAccent, 0.12) : '#FFF7E6',
      borderColor: isDark ? hexToRgba(warningAccent, 0.28) : '#F4D08C',
    },
    summaryUrgent: {
      backgroundColor: isDark ? hexToRgba(criticalAccent, 0.12) : '#FFF1F1',
      borderColor: isDark ? hexToRgba(criticalAccent, 0.28) : '#FBCACA',
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
    summaryValue: {
      fontSize: 26,
      lineHeight: 32,
      fontWeight: '800',
      color: colors.text,
      marginTop: 6,
    },

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

    modalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
    },
    modalClose: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalContent: {
      flex: 1,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
    },

    fieldLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.textSecondary,
      marginTop: SPACING.md,
      marginBottom: SPACING.xs,
      fontWeight: '600',
    },
    fieldLabelReq: {
      ...TYPOGRAPHY.bodySmall,
      color: colors.text,
      marginTop: SPACING.md,
      marginBottom: SPACING.xs,
      fontWeight: '700',
    },
    textInput: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      fontSize: 14,
      color: colors.text,
      minHeight: 52,
    },
    textArea: {
      minHeight: 96,
      textAlignVertical: 'top',
      paddingTop: SPACING.md,
    },

    typeRow: {
      flexDirection: 'row',
      gap: SPACING.md,
      marginBottom: SPACING.sm,
    },
    typeButton: {
      flex: 1,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    typeButtonWarrantyActive: {
      backgroundColor: warrantyAccent,
      borderColor: warrantyAccent,
    },
    typeButtonReturnActive: {
      backgroundColor: returnAccent,
      borderColor: returnAccent,
    },
    typeButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    typeButtonTextActive: {
      color: '#fff',
    },

    suggestionsBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.surface,
      marginTop: SPACING.sm,
      overflow: 'hidden',
    },
    suggestionRow: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    suggestionText: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '600',
    },

    infoCard: {
      backgroundColor: isDark ? hexToRgba(primary, 0.16) : '#EFF6FF',
      borderWidth: 1,
      borderColor: isDark ? hexToRgba(primary, 0.35) : '#BFDBFE',
      borderRadius: 16,
      padding: SPACING.md,
      marginTop: SPACING.lg,
    },
    infoTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    },
    infoTitle: {
      ...TYPOGRAPHY.bodyLarge,
      color: isDark ? colors.text : '#1E40AF',
      fontWeight: '800',
    },
    infoText: {
      fontSize: 12,
      lineHeight: 18,
      color: isDark ? colors.textSecondary : '#1E3A8A',
    },

    modalFooter: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      gap: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    footerButton: {
      flex: 1,
      minHeight: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelButtonText: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '700',
    },
    addButtonPrimary: {
      backgroundColor: primary,
    },
    addButtonText: {
      ...TYPOGRAPHY.bodyLarge,
      color: '#fff',
      fontWeight: '800',
    },
    disabledButton: {
      opacity: 0.5,
    },
  });
};

export default WarrantyAlertsScreen;
