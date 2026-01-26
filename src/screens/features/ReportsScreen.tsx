import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';
import { generatePDF } from 'react-native-html-to-pdf';

import { Badge, Button, Card, Chip, IconButton } from '@/components/common';
import { EmptyState, Header, LoadingOverlay } from '@/components/compositions';
import { DatePickerModal } from '@/components/modals/DatePickerModal';
import { OptionPickerModal, type OptionItem } from '@/components/modals/OptionPickerModal';
import { COLORS, GRADIENTS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrency, formatDate } from '@/utils/format';
import { listReceipts } from '@/utils/receiptStore';
import { deleteReportById, listReports, upsertReport, type ReportFormat, type ReportType, type StoredReport } from '@/utils/reportsStore';

type Props = NativeStackScreenProps<MainStackParamList, 'Reports'>;

interface Receipt {
  id: string;
  merchant: string;
  amount: number;
  date: Date | string;
  category: string;
  categoryId: string;
  categoryColor: string;
}

const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'Food & Dining', color: '#10b981' },
  { id: 'groceries', name: 'Groceries', color: '#22c55e' },
  { id: 'transport', name: 'Transport', color: '#3b82f6' },
  { id: 'shopping', name: 'Shopping', color: '#a855f7' },
  { id: 'health', name: 'Health', color: '#ef4444' },
  { id: 'misc', name: 'Misc', color: '#f59e0b' },
] as const;

const REPORT_TYPE_ITEMS: OptionItem[] = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'custom', label: 'Custom' },
];

const FORMAT_ITEMS: OptionItem[] = [
  { id: 'pdf', label: 'PDF' },
  { id: 'csv', label: 'CSV' },
  { id: 'excel', label: 'Excel (CSV)' },
];

const toDate = (value: Date | string): Date => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const ensureFileUri = (pathOrUri: string) => (pathOrUri.startsWith('file://') ? pathOrUri : `file://${pathOrUri}`);

const bytesLabel = (bytes: number) => {
  const b = Number.isFinite(bytes) ? bytes : 0;
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

const monthName = (d: Date) => d.toLocaleDateString('en-US', { month: 'long' });

const rangeForType = (type: ReportType, custom: { start: Date; end: Date }): { start: Date; end: Date } => {
  const now = new Date();

  switch (type) {
    case 'monthly':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) };
    case 'quarterly': {
      const q = Math.floor(now.getMonth() / 3);
      return { start: new Date(now.getFullYear(), q * 3, 1), end: endOfDay(now) };
    }
    case 'yearly':
      return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(now) };
    case 'custom':
    default: {
      const s = startOfDay(custom.start);
      const e = endOfDay(custom.end);
      return s <= e ? { start: s, end: e } : { start: startOfDay(custom.end), end: endOfDay(custom.start) };
    }
  }
};

const formatReportName = (type: ReportType, start: Date, end: Date) => {
  if (type === 'monthly') {
    return `${monthName(start)} ${start.getFullYear()} Report`;
  }
  if (type === 'quarterly') {
    const q = Math.floor(start.getMonth() / 3) + 1;
    return `Q${q} ${start.getFullYear()} Report`;
  }
  if (type === 'yearly') {
    return `${start.getFullYear()} Report`;
  }
  return `${formatDate(start, 'short')} – ${formatDate(end, 'short')} Report`;
};

const groupSum = (rows: Receipt[], keyFn: (r: Receipt) => string) => {
  const map = new Map<string, number>();
  rows.forEach(r => {
    const key = keyFn(r);
    map.set(key, (map.get(key) ?? 0) + r.amount);
  });
  return Array.from(map.entries())
    .map(([key, total]) => ({ key, total }))
    .sort((a, b) => b.total - a.total);
};

const escapeCsv = (value: string) => {
  const needsQuotes = /[",\n]/.test(value);
  const escaped = value.replaceAll('"', '""');
  return needsQuotes ? `"${escaped}"` : escaped;
};

const buildCsv = (rows: Receipt[], summary: { total: number }, start: Date, end: Date) => {
  const header = ['Date', 'Merchant', 'Category', 'Amount'];
  const lines = [
    `Report,${escapeCsv(`${formatDate(start, 'short')} - ${formatDate(end, 'short')}`)}`,
    `Total,${summary.total.toFixed(2)}`,
    '',
    header.join(','),
    ...rows.map(r => {
      const date = formatDate(r.date, 'short');
      return [
        escapeCsv(date),
        escapeCsv(r.merchant ?? ''),
        escapeCsv(r.category ?? ''),
        r.amount.toFixed(2),
      ].join(',');
    }),
  ];
  return lines.join('\n');
};

const buildPdfHtml = (opts: {
  title: string;
  start: Date;
  end: Date;
  total: number;
  byCategory: Array<{ key: string; total: number }>;
  byMerchant: Array<{ key: string; total: number }>;
}) => {
  const { title, start, end, total, byCategory, byMerchant } = opts;

  const rows = (items: Array<{ key: string; total: number }>) =>
    items
      .slice(0, 12)
      .map(
        x => `
          <tr>
            <td>${x.key}</td>
            <td style="text-align:right; font-weight:700;">${formatCurrency(x.total)}</td>
          </tr>`,
      )
      .join('');

  return `
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body { font-family: -apple-system, Roboto, Arial, sans-serif; padding: 24px; color: #111827; }
        .title { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
        .subtitle { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
        .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
        .kpi { font-size: 28px; font-weight: 900; margin-top: 6px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; }
        td { padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="title">${title}</div>
      <div class="subtitle">${formatDate(start, 'long')} – ${formatDate(end, 'long')}</div>

      <div class="card">
        <div style="font-size:12px; color:#6b7280; text-transform:uppercase; letter-spacing:0.06em;">Total Spend</div>
        <div class="kpi">${formatCurrency(total)}</div>
      </div>

      <div class="card">
        <div style="font-size:14px; font-weight:800; margin-bottom:10px;">By Category</div>
        <table>
          <thead>
            <tr><th>Category</th><th style="text-align:right;">Total</th></tr>
          </thead>
          <tbody>
            ${rows(byCategory)}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div style="font-size:14px; font-weight:800; margin-bottom:10px;">Top Merchants</div>
        <table>
          <thead>
            <tr><th>Merchant</th><th style="text-align:right;">Total</th></tr>
          </thead>
          <tbody>
            ${rows(byMerchant)}
          </tbody>
        </table>
      </div>
    </body>
  </html>
  `.trim();
};

const formatIconName = (format: ReportFormat) => {
  switch (format) {
    case 'pdf':
      return 'file-text';
    case 'excel':
      return 'grid';
    case 'csv':
    default:
      return 'file';
  }
};

const formatBadgeVariant = (format: ReportFormat): 'primary' | 'default' => {
  if (format === 'pdf') return 'primary';
  return 'default';
};

export const ReportsScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();
  const primary = COLORS.brand.primary;

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [reports, setReports] = useState<StoredReport[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  const [reportType, setReportType] = useState<ReportType>('monthly');
  const [format, setFormat] = useState<ReportFormat>('pdf');

  const [customStart, setCustomStart] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [customEnd, setCustomEnd] = useState<Date>(new Date());

  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]); // [] means All

  const styles = useMemo(() => createStyles({ colors, primary }), [colors, primary]);

  const hydrate = useCallback(async () => {
    try {
      setLoading(true);
      const [storedReports, storedReceipts] = await Promise.all([
        listReports(),
        listReceipts(),
      ]);

      setReports(storedReports);
      setReceipts(storedReceipts as unknown as Receipt[]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load reports', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();

    DEFAULT_CATEGORIES.forEach(c => map.set(c.id, { ...c }));

    receipts.forEach(r => {
      if (!r.categoryId) return;
      if (!map.has(r.categoryId)) {
        map.set(r.categoryId, { id: r.categoryId, name: r.category || r.categoryId, color: r.categoryColor || COLORS.chart[0] });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [receipts]);

  const isAllCategories = selectedCategoryIds.length === 0;

  const selectedCategoriesLabel = useMemo(() => {
    if (isAllCategories) return 'All Categories';
    const names = categories.filter(c => selectedCategoryIds.includes(c.id)).map(c => c.name);
    if (names.length === 0) return 'All Categories';
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }, [categories, isAllCategories, selectedCategoryIds]);

  const range = useMemo(() => rangeForType(reportType, { start: customStart, end: customEnd }), [customEnd, customStart, reportType]);

  const filteredReceipts = useMemo(() => {
    const start = startOfDay(range.start).getTime();
    const end = endOfDay(range.end).getTime();

    return receipts.filter(r => {
      const t = toDate(r.date).getTime();
      if (t < start || t > end) return false;
      if (isAllCategories) return true;
      return selectedCategoryIds.includes(r.categoryId);
    });
  }, [isAllCategories, range.end, range.start, receipts, selectedCategoryIds]);

  const summary = useMemo(() => {
    const total = filteredReceipts.reduce((sum, r) => sum + r.amount, 0);
    return { total };
  }, [filteredReceipts]);

  const onToggleCategory = useCallback((id: string) => {
    setSelectedCategoryIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return [...prev, id];
    });
  }, []);

  const onSetAllCategories = useCallback(() => {
    setSelectedCategoryIds([]);
  }, []);

  const generate = useCallback(async () => {
    try {
      setGenerating(true);

      const title = formatReportName(reportType, range.start, range.end);
      const createdAt = new Date().toISOString();
      const id = Date.now().toString();

      const byCategory = groupSum(filteredReceipts, r => r.category || 'Uncategorized');
      const byMerchant = groupSum(filteredReceipts, r => r.merchant || 'Unknown');

      let filePath = '';
      let sizeBytes = 0;

      if (format === 'pdf') {
        const html = buildPdfHtml({
          title,
          start: range.start,
          end: range.end,
          total: summary.total,
          byCategory,
          byMerchant,
        });

        const pdf = await generatePDF({ html, fileName: `report-${id}`, base64: false });
        if (!pdf.filePath) {
          Alert.alert('Reports', 'Failed to generate PDF');
          return;
        }

        filePath = pdf.filePath;
        try {
          const stat = await RNFS.stat(filePath);
          sizeBytes = Number(stat?.size ?? 0);
        } catch {
          sizeBytes = 0;
        }
      } else {
        const csv = buildCsv(filteredReceipts, summary, range.start, range.end);
        const baseDir = RNFS.DocumentDirectoryPath;
        const outPath = `${baseDir}/report-${id}.csv`;
        await RNFS.writeFile(outPath, csv, 'utf8');
        filePath = outPath;

        try {
          const stat = await RNFS.stat(outPath);
          sizeBytes = Number(stat?.size ?? csv.length);
        } catch {
          sizeBytes = csv.length;
        }
      }

      const report: StoredReport = {
        id,
        name: title,
        format,
        type: reportType,
        rangeStart: range.start.toISOString(),
        rangeEnd: range.end.toISOString(),
        filePath,
        sizeBytes,
        createdAt,
      };

      await upsertReport(report);
      setReports(prev => [report, ...prev]);

      Alert.alert('Report Generated', 'Your report is ready to share.', [
        {
          text: 'Share',
          onPress: () => {
            const url = ensureFileUri(filePath);
            Share.open({
              title: title,
              url,
              type: format === 'pdf' ? 'application/pdf' : 'text/csv',
            }).catch(() => undefined);
          },
        },
        { text: 'Close', style: 'cancel' },
      ]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Report generation failed', e);
      Alert.alert('Error', 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  }, [filteredReceipts, format, range.end, range.start, reportType, summary.total]);

  const shareReport = useCallback(async (report: StoredReport) => {
    try {
      const url = ensureFileUri(report.filePath);
      await Share.open({
        title: report.name,
        url,
        type: report.format === 'pdf' ? 'application/pdf' : 'text/csv',
      });
    } catch {
      // user cancelled
    }
  }, []);

  const deleteReport = useCallback(
    (report: StoredReport) => {
      Alert.alert('Delete Report', `Delete "${report.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReportById(report.id);
              setReports(prev => prev.filter(r => r.id !== report.id));

              const path = report.filePath.startsWith('file://') ? report.filePath.replace('file://', '') : report.filePath;
              const exists = await RNFS.exists(path);
              if (exists) {
                await RNFS.unlink(path);
              }
            } catch {
              Alert.alert('Error', 'Failed to delete report');
            }
          },
        },
      ]);
    },
    [],
  );

  const typeLabel = useMemo(() => REPORT_TYPE_ITEMS.find(i => i.id === reportType)?.label ?? 'Monthly', [reportType]);
  const formatLabel = useMemo(() => FORMAT_ITEMS.find(i => i.id === format)?.label ?? 'PDF', [format]);

  const rangeLabel = useMemo(() => {
    return `${formatDate(range.start, 'short')} – ${formatDate(range.end, 'short')}`;
  }, [range.end, range.start]);

  const configSubtitle = useMemo(() => {
    const cat = selectedCategoriesLabel;
    return `${typeLabel} • ${cat} • ${rangeLabel}`;
  }, [rangeLabel, selectedCategoriesLabel, typeLabel]);

  const empty = !loading && reports.length === 0;

  const renderReport = (report: StoredReport) => {
    const iconName = formatIconName(report.format);
    const badgeText = report.format.toUpperCase();
    const rangeText = `${formatDate(report.rangeStart, 'short')} – ${formatDate(report.rangeEnd, 'short')}`;

    return (
      <Pressable
        key={report.id}
        accessibilityRole="button"
        accessibilityLabel={report.name}
        onPress={() => shareReport(report)}
        onLongPress={() => deleteReport(report)}
        style={({ pressed }) => [pressed && { opacity: 0.9 }]}
      >
        <Card variant="default" style={styles.reportCard}>
          <View style={styles.reportRow}>
            <View style={styles.reportIconWrap}>
              <LinearGradient
                colors={Array.from(GRADIENTS.primary)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Feather name={iconName} size={ICON_SIZES.md} color={COLORS.common.white} />
            </View>

            <View style={styles.reportMain}>
              <Text style={styles.reportTitle} numberOfLines={1}>
                {report.name}
              </Text>
              <Text style={styles.reportMeta} numberOfLines={1}>
                {rangeText} • {bytesLabel(report.sizeBytes)} • {formatDate(report.createdAt, 'short')}
              </Text>
            </View>

            <View style={styles.reportRight}>
              <Badge text={badgeText} variant={formatBadgeVariant(report.format)} />
              <IconButton
                accessibilityLabel="Share"
                variant="ghost"
                size="sm"
                onPress={() => shareReport(report)}
                icon={<Feather name="share" size={ICON_SIZES.sm} color={colors.textSecondary} />}
              />
            </View>
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        title="Reports"
        onBack={() => navigation.goBack()}
        showBackButton
        rightAction={
          <IconButton
            accessibilityLabel="Refresh"
            variant="ghost"
            size="md"
            onPress={hydrate}
            icon={<Feather name="refresh-cw" size={ICON_SIZES.md} color={primary} />}
          />
        }
      />

      {empty ? (
        <EmptyState
          icon={<Feather name="file-text" size={80} color={colors.textTertiary} />}
          title="No Reports Yet"
          description="Generate a report to export and share your spending."
          action={{ label: 'Generate Report', onPress: () => undefined }}
        />
      ) : null}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card variant="glassmorphism" style={styles.configCard}>
          <LinearGradient
            colors={Array.from([`${primary}22`, `${primary}10`])}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <Text style={styles.configTitle}>Report Configuration</Text>
          <Text style={styles.configSubtitle}>{configSubtitle}</Text>

          <View style={styles.configRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select report type"
              onPress={() => setShowTypePicker(true)}
              style={({ pressed }) => [styles.configPill, pressed && styles.pressed]}
            >
              <Text style={styles.configPillLabel}>Type</Text>
              <Text style={styles.configPillValue}>{typeLabel}</Text>
            </Pressable>

            <View style={{ width: SPACING.sm }} />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select format"
              onPress={() => setShowFormatPicker(true)}
              style={({ pressed }) => [styles.configPill, pressed && styles.pressed]}
            >
              <Text style={styles.configPillLabel}>Format</Text>
              <Text style={styles.configPillValue}>{formatLabel}</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select categories"
            onPress={() => setShowCategoryModal(true)}
            style={({ pressed }) => [styles.configRowFull, pressed && styles.pressed]}
          >
            <Text style={styles.configRowLabel}>Categories</Text>
            <Text style={styles.configRowValue} numberOfLines={1}>
              {selectedCategoriesLabel}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select date range"
            onPress={() => {
              if (reportType === 'custom') setShowStartPicker(true);
            }}
            style={({ pressed }) => [styles.configRowFull, reportType !== 'custom' && { opacity: 0.7 }, pressed && styles.pressed]}
          >
            <Text style={styles.configRowLabel}>Date Range</Text>
            <Text style={styles.configRowValue}>{rangeLabel}</Text>
          </Pressable>

          <Button
            title="Generate Report"
            onPress={generate}
            variant="primary"
            size="lg"
            fullWidth
            disabled={generating}
            loading={generating}
            icon={<Feather name="zap" size={ICON_SIZES.sm} color={COLORS.common.white} />}
            style={styles.generateButton}
          />
        </Card>

        <Text style={styles.sectionTitle}>Recent Reports</Text>

        {reports.map(renderReport)}
      </ScrollView>

      {/* Type picker */}
      <OptionPickerModal
        visible={showTypePicker}
        title="Report Type"
        items={REPORT_TYPE_ITEMS}
        selectedId={reportType}
        onSelect={(item: OptionItem) => {
          const id = item.id as ReportType;
          setReportType(id);
          if (id === 'custom') {
            setShowStartPicker(true);
          }
        }}
        onClose={() => setShowTypePicker(false)}
      />

      {/* Format picker */}
      <OptionPickerModal
        visible={showFormatPicker}
        title="Format"
        items={FORMAT_ITEMS}
        selectedId={format}
        onSelect={(item: OptionItem) => setFormat(item.id as ReportFormat)}
        onClose={() => setShowFormatPicker(false)}
      />

      {/* Custom range pickers */}
      <DatePickerModal
        visible={showStartPicker}
        initialDate={customStart}
        onConfirm={(d: Date) => {
          setCustomStart(d);
          setShowStartPicker(false);
          setShowEndPicker(true);
        }}
        onClose={() => {
          setShowStartPicker(false);
          if (reportType === 'custom') {
            // keep custom selected; user can try again
          }
        }}
      />

      <DatePickerModal
        visible={showEndPicker}
        initialDate={customEnd}
        onConfirm={(d: Date) => {
          setCustomEnd(d);
          setShowEndPicker(false);
        }}
        onClose={() => setShowEndPicker(false)}
      />

      {/* Category multi-select */}
      <Modal
        isVisible={showCategoryModal}
        onBackdropPress={() => setShowCategoryModal(false)}
        onBackButtonPress={() => setShowCategoryModal(false)}
        backdropOpacity={0.5}
        useNativeDriver
      >
        <Card variant="default" style={styles.categoryModalCard}>
          <Text style={styles.modalTitle}>Filter Categories</Text>

          <View style={styles.modalActionsTop}>
            <Button title="All" onPress={onSetAllCategories} variant="secondary" size="sm" />
            <View style={{ width: SPACING.sm }} />
            <Button title="Done" onPress={() => setShowCategoryModal(false)} variant="primary" size="sm" />
          </View>

          <View style={styles.categoryChipsWrap}>
            {categories.map(c => {
              const selected = selectedCategoryIds.includes(c.id);
              return (
                <Chip
                  key={c.id}
                  label={c.name}
                  selected={selected}
                  onPress={() => onToggleCategory(c.id)}
                  style={styles.categoryChip}
                />
              );
            })}
          </View>

          {selectedCategoryIds.length > 0 ? (
            <Text style={styles.modalHint}>Selected: {selectedCategoryIds.length}</Text>
          ) : (
            <Text style={styles.modalHint}>All categories selected</Text>
          )}
        </Card>
      </Modal>

      <LoadingOverlay visible={loading} message="Loading…" />
    </SafeAreaView>
  );
};

const createStyles = ({
  colors,
  primary,
}: {
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
    border: string;
    disabled: string;
  };
  primary: string;
}) => {
  const label: TextStyle = { ...TYPOGRAPHY.label, color: colors.textSecondary };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING['3xl'],
    },

    configCard: {
      marginTop: SPACING.md,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    configTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      textAlign: 'center',
      marginBottom: SPACING.xs,
    },
    configSubtitle: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: SPACING.lg,
    },

    configRow: {
      flexDirection: 'row',
      marginBottom: SPACING.md,
    },
    configPill: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
    },
    pressed: {
      opacity: 0.9,
    },
    configPillLabel: {
      ...label,
      marginBottom: 2,
    },
    configPillValue: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '700',
    },

    configRowFull: {
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.md,
    },
    configRowLabel: {
      ...label,
      marginBottom: 2,
    },
    configRowValue: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.text,
      fontWeight: '600',
    },

    generateButton: {
      marginTop: SPACING.sm,
    },

    sectionTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
      marginBottom: SPACING.md,
    },

    reportCard: {
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    reportRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    reportIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: SPACING.md,
    },
    reportMain: {
      flex: 1,
      paddingRight: SPACING.md,
    },
    reportRight: {
      alignItems: 'flex-end',
      gap: SPACING.xs,
    },
    reportTitle: {
      ...TYPOGRAPHY.bodyLarge,
      color: colors.text,
      fontWeight: '800',
      marginBottom: 2,
    },
    reportMeta: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
    },

    categoryModalCard: {
      padding: SPACING.lg,
    },
    modalTitle: {
      ...TYPOGRAPHY.cardTitle,
      color: colors.text,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },
    modalActionsTop: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginBottom: SPACING.md,
    },
    categoryChipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    categoryChip: {
      marginRight: SPACING.sm,
      marginBottom: SPACING.sm,
    },
    modalHint: {
      ...TYPOGRAPHY.caption,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.sm,
    },
  });
};

export default ReportsScreen;
