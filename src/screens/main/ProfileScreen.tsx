import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Modal from 'react-native-modal';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import Share from 'react-native-share';
import { generatePDF } from 'react-native-html-to-pdf';
import { useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import { launchImageLibrary } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import DocumentPicker from 'react-native-document-picker';
import Clipboard from '@react-native-clipboard/clipboard';

import {
  createBackup as createRsbBackup,
  defaultBackupCategories as defaultRsbCategories,
  pickBackupFile as pickRsbBackupFile,
  restoreFromBackupFile as restoreRsbFromBackupFile,
} from '@/services/backupRestore';

import { Avatar, Button, Card, Input, Switch } from '@/components/common';
import { GuidedTourModal, type GuidedTourStep } from '@/components/tour';
import { Header, LoadingOverlay } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { BottomTabParamList, MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { listReceipts } from '@/utils/receiptStore';
import { makeUserScopedKey } from '@/utils/userScopedStorage';
import { emitAuthChanged } from '@/utils/authEvents';
import { useAuth, useCurrency } from '@/contexts';
import { CURRENCIES, DEFAULT_CURRENCY_CODE, getCurrencyDisplayName, getCurrencySymbol, isSupportedCurrencyCode, POPULAR_CURRENCY_CODES } from '@/utils/currencies';
import { updateLocalPassword, verifyLocalLogin } from '@/services/localAuth';
import { clearTourStage, getTourStage, isTourCompleted, saveTourCompleted, startFullAppTour } from '@/services/storage';
import { disableBiometricLogin, getBiometricState, getBiometryLabel, hasBiometricCredentials } from '@/services/biometricAuth';
import { HELP_FAQ, HELP_TEXT, QUICK_REFERENCE_TEXT, USER_MANUAL_TEXT } from '@/content/helpAndDocs';
import { PRIVACY_POLICY_TEXT, TERMS_OF_SERVICE_TEXT } from '@/content/legalText';

type Props = CompositeScreenProps<
  BottomTabScreenProps<BottomTabParamList, 'Profile'>,
  NativeStackScreenProps<MainStackParamList, 'BottomTabs'>
>;

type User = {
  name: string;
  email: string;
  avatar?: string | null;
};

type CurrencyCode = string;

const currencyMeta = (code: CurrencyCode, locale: string) => ({
  code: (code ?? DEFAULT_CURRENCY_CODE).toUpperCase(),
  symbol: getCurrencySymbol(code ?? DEFAULT_CURRENCY_CODE, locale),
  name: getCurrencyDisplayName(code ?? DEFAULT_CURRENCY_CODE),
});

type Settings = {
  darkMode: boolean;
  notifications: boolean;
  emailPreferences: boolean;
  faceId: boolean;
  budgetAlerts: boolean;
  celebrationMessages: boolean;
  alertDurationSeconds: number;
  alertRepeatMinutes: number;
  currency: CurrencyCode;
  language: 'EN';
};

const USER_KEY = '@user' as const;
const SETTINGS_KEY = '@settings' as const;
const AUTH_TOKEN_KEY = '@auth_token' as const;
const PROFILE_KEY = '@user_profile' as const;
const BIOMETRICS_ENABLED_KEY = '@biometrics_enabled' as const;
const LAST_BACKUP_AT_KEY = 'receiptstacker.lastBackupAt' as const;
const ACTIVE_USER_ID_KEY = 'receiptstacker.activeUserId' as const;

const APP_VERSION = (require('../../../package.json') as { version?: string }).version ?? '0.0.0';

const SUPPORT_EMAIL = 'support@receiptstacker.com' as const;

const PER_USER_BACKUP_BASE_KEYS = [
  PROFILE_KEY,
  'receiptstacker.receipts',
  'receiptstacker.budgets',
  'receiptstacker.budgets.v2',
  'receiptstacker.categories',
  'receiptstacker.tags',
  'receiptstacker.miscSpend',
  'receiptstacker.miscSpendCategories',
  'receiptstacker.reports',
] as const;

const getBackupKeysForUser = (userId: string | null): string[] => {
  return [
    USER_KEY,
    SETTINGS_KEY,
    ...PER_USER_BACKUP_BASE_KEYS.map((k) => makeUserScopedKey(k, userId)),
  ];
};

type BackupPayloadV1 = {
  app: 'ReceiptStacker';
  version: 1;
  exportedAt: string;
  keys: string[];
  data: Record<string, string | null>;
};

type LocalBackupFile = {
  name: string;
  path: string;
  mtimeMs: number;
  size: number;
};

const normalizeFilePath = (uri: string) => (uri.startsWith('file://') ? uri.replace('file://', '') : uri);

const defaultUser: User = {
  name: '',
  email: '',
  avatar: null,
};

const defaultSettings = (isDark: boolean): Settings => ({
  darkMode: isDark,
  notifications: true,
  emailPreferences: true,
  faceId: false,
  budgetAlerts: true,
  celebrationMessages: true,
  alertDurationSeconds: 5,
  alertRepeatMinutes: 5,
  currency: DEFAULT_CURRENCY_CODE,
  language: 'EN',
});

type UserProfile = {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  bio: string;
};

const defaultProfile: UserProfile = {
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
  bio: '',
};

const initialsFor = (firstName: string, lastName: string) => {
  const a = (firstName.trim()[0] ?? '').toUpperCase();
  const b = (lastName.trim()[0] ?? '').toUpperCase();
  return `${a}${b}`.trim() || 'U';
};

const passwordHasLetterAndNumber = (value: string) => {
  return /[A-Za-z]/.test(value) && /\d/.test(value);
};

const passwordHasSymbol = (value: string) => /[^A-Za-z0-9]/.test(value);

type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Weak' | 'Fair' | 'Good' | 'Strong';
};

const getPasswordStrength = (value: string): PasswordStrength => {
  const v = value ?? '';
  if (!v) return { score: 0, label: 'Weak' };

  const hasLen8 = v.length >= 8;
  const hasLen12 = v.length >= 12;
  const hasLetter = /[A-Za-z]/.test(v);
  const hasNumber = /\d/.test(v);
  const hasSymbol = passwordHasSymbol(v);

  const points = [hasLen8, hasLetter, hasNumber, hasSymbol, hasLen12].filter(Boolean).length;
  const score = Math.min(4, points) as 0 | 1 | 2 | 3 | 4;
  const label: PasswordStrength['label'] = score >= 4 ? 'Strong' : score >= 3 ? 'Good' : score >= 2 ? 'Fair' : 'Weak';
  return { score, label };
};

const toRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const receiptsToCsv = (receipts: Array<Record<string, unknown>>): string => {
  const header = ['id', 'merchant', 'amount', 'date', 'category', 'paymentMethod', 'tags', 'notes'] as const;

  const row = (v: unknown) => {
    const s = v == null ? '' : String(v);
    const escaped = s.replaceAll('"', '""');
    return `"${escaped}"`;
  };

  const lines = [header.join(',')];
  for (const r of receipts) {
    lines.push(
      [
        row(r.id),
        row(r.merchant),
        row(r.amount),
        row(r.date),
        row(r.category),
        row(r.paymentMethod),
        row(Array.isArray(r.tags) ? (r.tags as unknown[]).join('|') : r.tags),
        row(r.notes),
      ].join(','),
    );
  }
  return lines.join('\n');
};

const buildReceiptsHtml = (receipts: Array<Record<string, unknown>>): string => {
  const rows = receipts
    .slice(0, 250)
    .map(r => {
      const merchant = escapeHtml(String(r.merchant ?? ''));
      const amount = escapeHtml(String(r.amount ?? ''));
      const date = escapeHtml(String(r.date ?? ''));
      const category = escapeHtml(String(r.category ?? ''));

      return `
        <tr>
          <td>${merchant}</td>
          <td style="text-align:right;">${amount}</td>
          <td>${date}</td>
          <td>${category}</td>
        </tr>
      `.trim();
    })
    .join('');

  return `
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body { font-family: -apple-system, Roboto, Arial, sans-serif; padding: 24px; }
        h1 { font-size: 18px; margin: 0 0 12px; }
        .meta { color: #6b7280; font-size: 12px; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border-bottom: 1px solid #e5e7eb; padding: 10px 6px; font-size: 12px; }
        th { text-align: left; color: #374151; }
      </style>
    </head>
    <body>
      <h1>ReceiptStacker Export</h1>
      <div class="meta">Rows: ${receipts.length} (first ${Math.min(receipts.length, 250)})</div>
      <table>
        <thead>
          <tr>
            <th>Merchant</th>
            <th style="text-align:right;">Amount</th>
            <th>Date</th>
            <th>Category</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </body>
  </html>
  `.trim();
};

const SettingRow = ({
  icon,
  label,
  subtitle,
  right,
  onPress,
  isLast,
  accessibilityLabel,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  right: React.ReactNode;
  onPress?: () => void;
  isLast?: boolean;
  accessibilityLabel?: string;
  colors: { border: string; text: string };
}) => {
  const Row = onPress ? Pressable : View;

  return (
    <Row
      {...(onPress
        ? {
            accessibilityRole: 'button' as const,
            accessibilityLabel: accessibilityLabel ?? label,
            onPress,
            style: ({ pressed }: { pressed: boolean }) => [stylesShared.settingRow, pressed && stylesShared.pressed],
          }
        : { style: stylesShared.settingRow })}
    >
      <View style={stylesShared.settingLeft}>
        <View style={stylesShared.iconWrap}>{icon}</View>
        <View style={stylesShared.labelCol}>
          <Text style={[stylesShared.settingLabel, { color: colors.text }]}>{label}</Text>
          {subtitle ? <Text style={stylesShared.settingSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      <View style={stylesShared.settingRight}>{right}</View>

      {!isLast ? <View style={[stylesShared.divider, { backgroundColor: colors.border }]} /> : null}
    </Row>
  );
};

const stylesShared = StyleSheet.create({
  settingRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pressed: {
    opacity: 0.7,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 28,
    alignItems: 'center',
  },
  labelCol: {
    flex: 1,
    paddingRight: 86,
  },
  settingLabel: {
    ...TYPOGRAPHY.bodyNormal,
    fontWeight: '700',
  },
  settingSubtitle: {
    ...TYPOGRAPHY.caption,
    color: '#64748b',
    marginTop: 2,
  },
  settingRight: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  divider: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
});

export const ProfileScreen = ({ navigation }: Props) => {
  const { colors, isDark, setTheme } = useTheme();
  const { updateProfile } = useAuth();
  const { currency: activeCurrency, locale: activeLocale, setCurrency: setActiveCurrency } = useCurrency();

  const primary = COLORS.brand.primary;

  const [user, setUser] = useState<User>(defaultUser);
  const [settings, setSettings] = useState<Settings>(defaultSettings(isDark));

  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [pwShowCurrent, setPwShowCurrent] = useState(false);
  const [pwShowNew, setPwShowNew] = useState(false);
  const [pwShowConfirm, setPwShowConfirm] = useState(false);

  const [aboutModal, setAboutModal] = useState<null | 'help' | 'manual' | 'quick' | 'privacy' | 'terms'>(null);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const aboutDocText = useMemo(() => {
    if (aboutModal === 'privacy') return PRIVACY_POLICY_TEXT;
    if (aboutModal === 'terms') return TERMS_OF_SERVICE_TEXT;
    if (aboutModal === 'manual') return USER_MANUAL_TEXT;
    if (aboutModal === 'quick') return QUICK_REFERENCE_TEXT;
    if (aboutModal === 'help') {
      const faqText = HELP_FAQ.map(item => `${item.question}\n${item.answer}`).join('\n\n');
      return `${HELP_TEXT}\n${faqText}`;
    }
    return '';
  }, [aboutModal]);

  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editBio, setEditBio] = useState('');

  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [currencyQuery, setCurrencyQuery] = useState('');
  const [currencyAnchor, setCurrencyAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );
  const currencyTriggerRef = useRef<any>(null);

  const [showAlertDurationPicker, setShowAlertDurationPicker] = useState(false);
  const [showAlertRepeatPicker, setShowAlertRepeatPicker] = useState(false);

  const alertDurationOptions = useMemo(() => [3, 5, 8, 10] as const, []);
  const alertRepeatOptions = useMemo(() => [1, 3, 5, 10, 15] as const, []);

  useEffect(() => {
    // Keep local settings state in sync with the app-wide currency.
    setSettings(prev => (prev.currency === activeCurrency ? prev : { ...prev, currency: activeCurrency }));
  }, [activeCurrency]);

  // --- Guided tour (staged flow) ---
  const securitySettingsRowRef = useRef<View>(null);
  const appTourRowRef = useRef<View>(null);
  const [tourVisible, setTourVisible] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [replayTourEnabled, setReplayTourEnabled] = useState(false);

  const tourSteps: GuidedTourStep[] = useMemo(
    () => [
      {
        key: 'security',
        title: 'Manage Security',
        body: 'Review and configure your recovery options (PIN, questions, passphrase) and device security.',
        ref: securitySettingsRowRef,
      },
      {
        key: 'rerun',
        title: 'Re-run the Tour',
        body: 'You can always replay the full tour from here.',
        ref: appTourRowRef,
      },
      {
        key: 'done',
        title: 'You’re all set',
        body: 'Explore Analytics and Calendar anytime from the bottom tabs. You can skip or replay this tour whenever you like.',
      },
    ],
    [],
  );

  const cancelTour = useCallback(async () => {
    setTourVisible(false);
    setTourStep(0);
    try {
      await saveTourCompleted(true);
      await clearTourStage();
    } catch {
      // non-fatal
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const run = async () => {
        const [completed, stage] = await Promise.all([isTourCompleted(), getTourStage()]);
        if (!active) return;

        setReplayTourEnabled(!completed);
        if (!completed && stage === 'profile') {
          setTourStep(0);
          setTourVisible(true);
        }
      };
      run().catch(() => undefined);
      return () => {
        active = false;
      };
    }, []),
  );

  const handleTourNext = useCallback(() => {
    if (tourStep >= tourSteps.length - 1) {
      void cancelTour();
      return;
    }
    setTourStep((s) => s + 1);
  }, [cancelTour, tourStep, tourSteps.length]);

  const [showBackupRestoreModal, setShowBackupRestoreModal] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [localBackups, setLocalBackups] = useState<LocalBackupFile[]>([]);
  const [deviceBackups, setDeviceBackups] = useState<LocalBackupFile[]>([]);

  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
  const [showAdvancedRestore, setShowAdvancedRestore] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showManageBackups, setShowManageBackups] = useState(false);

  const [backupType, setBackupType] = useState<'full' | 'selective'>('full');
  const [backupEncryption, setBackupEncryption] = useState<'encrypted' | 'plain'>('encrypted');
  const [backupDestination, setBackupDestination] = useState<'local' | 'cloud' | 'share'>('local');
  const [backupPassword, setBackupPassword] = useState('');
  const [backupPwShow, setBackupPwShow] = useState(false);

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [retentionPolicy, setRetentionPolicy] = useState<1 | 3 | 5 | 10>(3);

  const [backupCategories, setBackupCategories] = useState<
    Array<{
      id: BackupCategoryId;
      name: string;
      description: string;
      dataSize: string;
      included: boolean;
      icon: string;
    }>
  >([
    {
      id: 'scannedReceipts',
      name: 'Scanned Receipts',
      description: 'All OCR scanned receipts with images',
      dataSize: '145 MB',
      included: true,
      icon: 'image',
    },
    {
      id: 'manualReceipts',
      name: 'Manual Receipts',
      description: 'Manually added receipt data',
      dataSize: '2.5 MB',
      included: true,
      icon: 'edit',
    },
    {
      id: 'miscSpend',
      name: 'Misc. Spend',
      description: 'Additional spending records',
      dataSize: '512 KB',
      included: true,
      icon: 'credit-card',
    },
    {
      id: 'reports',
      name: 'Reports',
      description: 'Saved reports and exports',
      dataSize: '8 MB',
      included: true,
      icon: 'bar-chart-2',
    },
    {
      id: 'warranty',
      name: 'Warranty & Alerts',
      description: 'Warranty items and alert settings',
      dataSize: '1.2 MB',
      included: true,
      icon: 'shield',
    },
    {
      id: 'categories',
      name: 'Categories',
      description: 'Receipt categories',
      dataSize: '128 KB',
      included: true,
      icon: 'tag',
    },
    {
      id: 'budgets',
      name: 'Budgets',
      description: 'Budget limits and history',
      dataSize: '256 KB',
      included: true,
      icon: 'pie-chart',
    },
    {
      id: 'settings',
      name: 'Settings',
      description: 'App preferences and configuration',
      dataSize: '64 KB',
      included: true,
      icon: 'settings',
    },
    {
      id: 'accounts',
      name: 'User Accounts',
      description: 'All user accounts on this device',
      dataSize: '512 KB',
      included: true,
      icon: 'users',
    },
  ]);

  const [showRestorePasswordModal, setShowRestorePasswordModal] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const [restorePwShow, setRestorePwShow] = useState(false);
  const [pendingRestorePath, setPendingRestorePath] = useState<string | null>(null);

  const localBackupDir = useMemo(() => {
    const base = (RNFS as any)?.DocumentDirectoryPath;
    return typeof base === 'string' && base.length ? `${base}/ReceiptStacker/Backups` : null;
  }, []);

  const deviceBackupDir = useMemo(() => {
    if (Platform.OS !== 'android') return null;
    const downloads = (RNFS as any)?.DownloadDirectoryPath;
    return typeof downloads === 'string' && downloads.length ? `${downloads}/ReceiptStacker/Backups` : null;
  }, []);

  const mapBackupDirEntries = useCallback((entries: any[]): LocalBackupFile[] => {
    return entries
      .filter(e => {
        const name = typeof e?.name === 'string' ? e.name.toLowerCase() : '';
        return Boolean(e?.isFile?.() && name && (name.endsWith('.rsb') || name.endsWith('.json')));
      })
      .map(e => ({
        name: e.name,
        path: e.path,
        mtimeMs: e.mtime ? new Date(e.mtime).getTime() : 0,
        size: typeof e.size === 'number' ? e.size : 0,
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  }, []);

  const styles = useMemo(() => createStyles({ colors, primary, isDark }), [colors, isDark, primary]);

  const loadUserData = useCallback(async () => {
    try {
      const [userRaw, settingsRaw, biometricsEnabledRaw] = await Promise.all([
        AsyncStorage.getItem(USER_KEY),
        AsyncStorage.getItem(SETTINGS_KEY),
        AsyncStorage.getItem(BIOMETRICS_ENABLED_KEY),
      ]);

      const faceIdFromKey =
        biometricsEnabledRaw === 'true' ? true : biometricsEnabledRaw === 'false' ? false : null;

      if (userRaw) {
        const parsed = JSON.parse(userRaw) as Partial<User>;
        setUser({
          name: typeof parsed.name === 'string' ? parsed.name : defaultUser.name,
          email: typeof parsed.email === 'string' ? parsed.email : defaultUser.email,
          avatar: typeof parsed.avatar === 'string' || parsed.avatar === null ? parsed.avatar : null,
        });
      }

      if (settingsRaw) {
        const parsed = JSON.parse(settingsRaw) as Partial<Settings>;
        const maybeCurrency = (parsed as any).currency;
        const currency =
          typeof maybeCurrency === 'string' && isSupportedCurrencyCode(maybeCurrency)
            ? maybeCurrency.toUpperCase()
            : DEFAULT_CURRENCY_CODE;
        const durationRaw = (parsed as any).alertDurationSeconds;
        const alertDurationSeconds =
          typeof durationRaw === 'number' && Number.isFinite(durationRaw)
            ? Math.max(1, Math.min(30, Math.round(durationRaw)))
            : 5;

        const repeatRaw = (parsed as any).alertRepeatMinutes;
        const alertRepeatMinutes =
          typeof repeatRaw === 'number' && Number.isFinite(repeatRaw)
            ? Math.max(1, Math.min(60, Math.round(repeatRaw)))
            : 5;

        const next: Settings = {
          // Theme preference is owned by ThemeContext; keep this UI toggle in sync with current theme.
          darkMode: isDark,
          notifications: typeof parsed.notifications === 'boolean' ? parsed.notifications : true,
          emailPreferences:
            typeof (parsed as any).emailPreferences === 'boolean' ? (parsed as any).emailPreferences : true,
          faceId: faceIdFromKey ?? (typeof parsed.faceId === 'boolean' ? parsed.faceId : false),
          budgetAlerts: typeof (parsed as any).budgetAlerts === 'boolean' ? (parsed as any).budgetAlerts : true,
          celebrationMessages:
            typeof (parsed as any).celebrationMessages === 'boolean' ? (parsed as any).celebrationMessages : true,
          alertDurationSeconds,
          alertRepeatMinutes,
          currency,
          language: 'EN',
        };

        setSettings(next);
      } else if (faceIdFromKey != null) {
        // If settings haven't been persisted yet, still reflect the biometrics flag.
        setSettings(prev => (prev.faceId === faceIdFromKey ? prev : { ...prev, faceId: faceIdFromKey }));
      }
    } catch {
      // Non-fatal
    }
  }, [isDark]);

  const loadBackupMeta = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(LAST_BACKUP_AT_KEY);
      setLastBackupAt(typeof raw === 'string' ? raw : null);
    } catch {
      setLastBackupAt(null);
    }
  }, []);

  const loadLocalBackups = useCallback(async () => {
    try {
      if (!localBackupDir) {
        setLocalBackups([]);
        return;
      }

      const exists = await RNFS.exists(localBackupDir);
      if (!exists) {
        setLocalBackups([]);
        return;
      }

      const entries = await RNFS.readDir(localBackupDir);
      setLocalBackups(mapBackupDirEntries(entries));
    } catch {
      setLocalBackups([]);
    }
  }, [localBackupDir, mapBackupDirEntries]);

  const loadDeviceBackups = useCallback(async () => {
    try {
      if (!deviceBackupDir) {
        setDeviceBackups([]);
        return;
      }

      const exists = await RNFS.exists(deviceBackupDir);
      if (!exists) {
        setDeviceBackups([]);
        return;
      }

      const entries = await RNFS.readDir(deviceBackupDir);
      setDeviceBackups(mapBackupDirEntries(entries));
    } catch {
      setDeviceBackups([]);
    }
  }, [deviceBackupDir, mapBackupDirEntries]);

  useEffect(() => {
    loadUserData();
    loadBackupMeta();
  }, [loadBackupMeta, loadUserData]);

  useEffect(() => {
    if (!showBackupRestoreModal) return;
    loadLocalBackups();
    loadDeviceBackups();
  }, [loadDeviceBackups, loadLocalBackups, showBackupRestoreModal]);

  useFocusEffect(
    useCallback(() => {
      loadUserData();
      loadBackupMeta();
    }, [loadBackupMeta, loadUserData]),
  );

  useEffect(() => {
    // If theme is toggled elsewhere (e.g. Home header), reflect that in this screen's settings toggle.
    setSettings(prev => (prev.darkMode === isDark ? prev : { ...prev, darkMode: isDark }));
  }, [isDark]);

  const persistSettings = useCallback(async (next: Settings) => {
    setSettings(next);
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Non-fatal
    }
  }, []);

  const handleDarkModeToggle = useCallback(
    async (value: boolean) => {
      setTheme(value ? 'dark' : 'light');
      await persistSettings({ ...settings, darkMode: value });
    },
    [persistSettings, setTheme, settings],
  );

  const handleNotificationsToggle = useCallback(
    async (value: boolean) => {
      await persistSettings({ ...settings, notifications: value });
    },
    [persistSettings, settings],
  );

  const handleEmailPreferencesToggle = useCallback(
    async (value: boolean) => {
      await persistSettings({ ...settings, emailPreferences: value });
    },
    [persistSettings, settings],
  );

  const handleBudgetAlertsToggle = useCallback(
    async (value: boolean) => {
      await persistSettings({ ...settings, budgetAlerts: value });
    },
    [persistSettings, settings],
  );

  const handleCelebrationMessagesToggle = useCallback(
    async (value: boolean) => {
      await persistSettings({ ...settings, celebrationMessages: value });
    },
    [persistSettings, settings],
  );

  const handleAlertDurationSelect = useCallback(
    async (seconds: number) => {
      const normalized = Math.max(1, Math.min(30, Math.round(seconds)));
      await persistSettings({ ...settings, alertDurationSeconds: normalized });
      setShowAlertDurationPicker(false);
    },
    [persistSettings, settings],
  );

  const handleAlertRepeatSelect = useCallback(
    async (minutes: number) => {
      const normalized = Math.max(1, Math.min(60, Math.round(minutes)));
      await persistSettings({ ...settings, alertRepeatMinutes: normalized });
      setShowAlertRepeatPicker(false);
    },
    [persistSettings, settings],
  );

  const openCurrencyPicker = useCallback(() => {
    try {
      const node = currencyTriggerRef.current;
      if (node && typeof node.measureInWindow === 'function') {
        node.measureInWindow((x: number, y: number, width: number, height: number) => {
          setCurrencyAnchor({ x, y, width, height });
          setShowCurrencyPicker(true);
        });
        return;
      }
    } catch {
      // ignore
    }
    setCurrencyAnchor(null);
    setShowCurrencyPicker(true);
  }, []);

  const handleCurrencySelect = useCallback(
    async (code: CurrencyCode) => {
      const normalized = (code ?? '').toUpperCase();
      await setActiveCurrency(normalized);
      await persistSettings({ ...settings, currency: normalized });
      setCurrencyQuery('');
      setShowCurrencyPicker(false);
    },
    [persistSettings, setActiveCurrency, settings],
  );

  const openBackupRestore = useCallback(() => {
    setShowBackupRestoreModal(true);
  }, []);

  const closeBackupRestore = useCallback(() => {
    setShowBackupRestoreModal(false);
    setShowAdvancedCreate(false);
    setShowAdvancedRestore(false);
    setShowSchedule(false);
    setShowManageBackups(false);
    setBackupType('full');
    setBackupEncryption('encrypted');
    setBackupDestination('local');
    setBackupPassword('');
    setBackupPwShow(false);
  }, []);

  const validateBackupPassword = useCallback((password: string) => {
    const errors: string[] = [];
    if (password.length < 8) errors.push('Password must be at least 8 characters.');
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /\d/.test(password);
    if (!hasLetter || !hasNumber) errors.push('Password must contain letters and numbers.');
    return { valid: errors.length === 0, errors };
  }, []);

  const persistBackupPrefs = useCallback(async (next: { scheduleEnabled: boolean; scheduleFrequency: string; retentionPolicy: number }) => {
    try {
      await AsyncStorage.setItem('receiptstacker.backupPrefs.v1', JSON.stringify(next));
    } catch {
      // non-fatal
    }
  }, []);

  const loadBackupPrefs = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('receiptstacker.backupPrefs.v1');
      if (!raw) return;
      const parsed = JSON.parse(raw) as any;
      if (typeof parsed?.scheduleEnabled === 'boolean') setScheduleEnabled(parsed.scheduleEnabled);
      if (parsed?.scheduleFrequency === 'daily' || parsed?.scheduleFrequency === 'weekly' || parsed?.scheduleFrequency === 'monthly') {
        setScheduleFrequency(parsed.scheduleFrequency);
      }
      if ([1, 3, 5, 10].includes(Number(parsed?.retentionPolicy))) {
        setRetentionPolicy(Number(parsed.retentionPolicy) as 1 | 3 | 5 | 10);
      }
    } catch {
      // non-fatal
    }
  }, []);

  const enforceRetentionPolicyNow = useCallback(
    async (count: number) => {
      try {
        const dirs: string[] = [];
        if (localBackupDir) dirs.push(localBackupDir);
        if (deviceBackupDir) dirs.push(deviceBackupDir);

        for (const dir of dirs) {
          const exists = await RNFS.exists(dir);
          if (!exists) continue;
          const entries = await RNFS.readDir(dir);
          const files = entries
            .filter(e => e?.isFile?.() && typeof e.name === 'string' && (e.name.endsWith('.rsb') || e.name.endsWith('.json')))
            .map(e => ({ path: e.path, mtimeMs: e.mtime ? new Date(e.mtime).getTime() : 0 }))
            .sort((a, b) => b.mtimeMs - a.mtimeMs);

          const toDelete = files.slice(Math.max(0, count));
          for (const f of toDelete) {
            try {
              await RNFS.unlink(f.path);
            } catch {
              // best-effort
            }
          }
        }
      } catch {
        // best-effort
      }
    },
    [deviceBackupDir, localBackupDir],
  );

  const buildBackupPayload = useCallback(async (): Promise<BackupPayloadV1> => {
    const activeUserId = await AsyncStorage.getItem(ACTIVE_USER_ID_KEY);
    const keys = getBackupKeysForUser(activeUserId);
    const pairs = await AsyncStorage.multiGet(keys);
    const data: Record<string, string | null> = {};
    for (const [k, v] of pairs) data[k] = v ?? null;

    return {
      app: 'ReceiptStacker',
      version: 1,
      exportedAt: new Date().toISOString(),
      keys,
      data,
    };
  }, []);

  const stampFromIso = useCallback((iso: string) => {
    return iso
      .replaceAll(':', '')
      .replaceAll('-', '')
      .replaceAll('.', '')
      .replace('T', '-')
      .replace('Z', '');
  }, []);

  const ensureDir = useCallback(async (dir: string) => {
    const exists = await RNFS.exists(dir);
    if (!exists) await RNFS.mkdir(dir);
  }, []);

  const writeBackupFile = useCallback(
    async ({ dir, fileName, payloadJson }: { dir: string; fileName: string; payloadJson: string }) => {
      await ensureDir(dir);
      const filePath = `${dir}/${fileName}`;
      await RNFS.writeFile(filePath, payloadJson, 'utf8');
      return filePath;
    },
    [ensureDir],
  );

  const validateBackupPayload = useCallback((parsed: unknown): parsed is BackupPayloadV1 => {
    const p = parsed as any;
    return Boolean(p && p.app === 'ReceiptStacker' && p.version === 1 && typeof p.exportedAt === 'string' && typeof p.data === 'object' && p.data);
  }, []);

  const restoreFromBackupPath = useCallback(
    async (path: string) => {
      const raw = await RNFS.readFile(path, 'utf8');
      let parsed: any = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }

      const isRsbEnvelope = Boolean(
        parsed && typeof parsed === 'object' && ['plain', 'compressed', 'encrypted'].includes((parsed as any).kind),
      );
      const isEncryptedRsb = Boolean(isRsbEnvelope && (parsed as any).kind === 'encrypted');
      const isLegacyJson = validateBackupPayload(parsed);

      if (!isRsbEnvelope && !isLegacyJson) {
        Alert.alert('Invalid Backup', 'This file does not look like a ReceiptStacker backup.');
        return;
      }

      Alert.alert(
        'Restore from Backup',
        'Warning: Restoring will overwrite your current data. Make sure you have a recent backup before proceeding.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: () => {
              if (isRsbEnvelope && isEncryptedRsb) {
                setPendingRestorePath(path);
                setRestorePassword('');
                setRestorePwShow(false);
                setShowRestorePasswordModal(true);
                return;
              }

              void (async () => {
                try {
                  setBackupBusy(true);

                  if (isRsbEnvelope) {
                    await restoreRsbFromBackupFile({ filePath: path });
                  } else {
                    const entries: Array<[string, string]> = [];
                    const removals: string[] = [];

                    const activeUserId = await AsyncStorage.getItem(ACTIVE_USER_ID_KEY);
                    const keys = getBackupKeysForUser(activeUserId);

                    for (const key of keys) {
                      const baseKey = String(key).split('::')[0];
                      const direct = (parsed.data as any)[key];
                      const legacy = (parsed.data as any)[baseKey];
                      const value = typeof direct === 'string' ? direct : typeof legacy === 'string' ? legacy : null;

                      if (typeof value === 'string') entries.push([key, value]);
                      else removals.push(key);

                      // Cleanup legacy unscoped keys to avoid cross-account leakage.
                      if (baseKey !== key) removals.push(baseKey);
                    }

                    if (removals.length) await AsyncStorage.multiRemove(removals);
                    if (entries.length) await AsyncStorage.multiSet(entries);
                  }

                  closeBackupRestore();
                  await loadUserData();
                  await loadBackupMeta();
                  await loadLocalBackups();
                  await loadDeviceBackups();
                  Alert.alert('Restore Complete', 'Your data has been restored. Some screens may need to be reopened to refresh.');
                } catch (e) {
                  const msg = e instanceof Error ? e.message : 'Unable to restore from this backup.';
                  Alert.alert('Restore Failed', msg);
                } finally {
                  setBackupBusy(false);
                }
              })();
            },
          },
        ],
      );
    },
    [closeBackupRestore, loadBackupMeta, loadDeviceBackups, loadLocalBackups, loadUserData, validateBackupPayload],
  );

  const shareBackupAtPath = useCallback(async (filePath: string) => {
    const url = `file://${filePath}`;
    await Share.open({
      title: 'ReceiptStacker Backup',
      url,
      type: 'application/json',
      ...(Platform.OS === 'ios' ? { saveToFiles: true } : null),
      failOnCancel: false,
    });
  }, []);

  const createBackupFile = useCallback(async () => {
    const wantEncrypted = backupEncryption === 'encrypted';
    const selectedCategories = backupType === 'selective'
      ? backupCategories.map(c => ({ id: c.id, included: c.included }))
      : defaultRsbCategories();

    if (wantEncrypted) {
      if (!backupPassword) {
        Alert.alert('Password Required', 'Please enter an encryption password.');
        return;
      }

      const validation = validateBackupPassword(backupPassword);
      if (!validation.valid) {
        Alert.alert('Weak Password', validation.errors.join('\n'), [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Use Anyway', onPress: () => void 0 },
        ]);
        // Continue anyway per prompt option.
      }
    }

    try {
      setBackupBusy(true);

      const result = await createRsbBackup({
        backupType,
        categories: selectedCategories,
        encryption: wantEncrypted ? 'encrypted' : 'plain',
        password: wantEncrypted ? backupPassword : undefined,
        destination: backupDestination,
        storageLocation: 'uninstallSafe',
      });

      await loadBackupMeta();
      await loadLocalBackups();
      await loadDeviceBackups();

      await enforceRetentionPolicyNow(retentionPolicy);
      await loadLocalBackups();
      await loadDeviceBackups();

      if (Platform.OS === 'android') {
        Alert.alert(
          'Backup Saved',
          `Saved outside the app in Downloads. This copy will still be available even if you uninstall the app.\n\n${result.filePath}`,
          [
            { text: 'Share', onPress: async () => shareBackupAtPath(result.filePath) },
            { text: 'OK' },
          ],
        );
      } else {
        Alert.alert(
          'Backup Saved',
          `Saved inside the app. Use Share to save a copy to Files/iCloud for uninstall-safe storage.\n\n${result.filePath}`,
          [
            { text: 'Share', onPress: async () => shareBackupAtPath(result.filePath) },
            { text: 'OK' },
          ],
        );
      }
    } catch {
      Alert.alert('Backup Failed', 'Unable to create a backup file.');
    } finally {
      setBackupBusy(false);
    }
  }, [
    backupCategories,
    backupDestination,
    backupEncryption,
    backupPassword,
    backupType,
    enforceRetentionPolicyNow,
    loadBackupMeta,
    loadDeviceBackups,
    loadLocalBackups,
    retentionPolicy,
    shareBackupAtPath,
    validateBackupPassword,
  ]);

  const restoreFromBackup = useCallback(async () => {
    try {
      const picked = await pickRsbBackupFile();
      const path = picked.path;
      await restoreFromBackupPath(path);
    } catch (e) {
      if ((DocumentPicker as any).isCancel?.(e)) return;
      Alert.alert('Restore Failed', 'Unable to select a backup file.');
    }
  }, [restoreFromBackupPath]);

  const restoreFromDeviceBackup = useCallback(
    async (filePath: string, fileName: string) => {
      try {
        await restoreFromBackupPath(filePath);
      } catch {
        Alert.alert(
          'Restore Needs File Access',
          `Android blocked direct access to this file. Please select it from Downloads to restore:\n\n${fileName}`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Select File',
              onPress: async () => {
                await restoreFromBackup();
              },
            },
          ],
        );
      }
    },
    [restoreFromBackup, restoreFromBackupPath],
  );

  const restoreFromLocalBackup = useCallback(
    async (filePath: string) => {
      try {
        await restoreFromBackupPath(filePath);
      } catch {
        Alert.alert('Restore Failed', 'Unable to restore from that local backup.');
      }
    },
    [restoreFromBackupPath],
  );

  const handleFaceIdToggle = useCallback(
    async (value: boolean) => {
      if (value) {
        try {
          setLoading(true);

          const state = await getBiometricState();
          if (state.state === 'notSupported' || state.state === 'notEnrolled') {
            Alert.alert('Not Available', state.message);
            return;
          }

          const enabled = await hasBiometricCredentials();
          if (!enabled) {
            const label = getBiometryLabel(state.kind);
            Alert.alert(
              'Set Up Required',
              `${label} is not set up for login on this device yet. From the Login screen, tap “Set up ${label}” to complete setup.`,
            );
            return;
          }

          await AsyncStorage.setItem(BIOMETRICS_ENABLED_KEY, 'true');
          await persistSettings({ ...settings, faceId: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to enable biometrics';
          Alert.alert('Error', msg);
        } finally {
          setLoading(false);
        }
      } else {
        try {
          setLoading(true);
          await AsyncStorage.setItem(BIOMETRICS_ENABLED_KEY, 'false');
          await disableBiometricLogin();
        } catch {
          // Non-fatal
        } finally {
          await persistSettings({ ...settings, faceId: false });
          setLoading(false);
        }
      }
    },
    [persistSettings, settings],
  );

  const openEditProfile = useCallback(async () => {
    try {
      const displayName = user.name?.trim() || '';
      const [nameFirst = '', nameLast = ''] = displayName.split(' ');

      setEditAvatar(typeof user.avatar === 'string' ? user.avatar : null);
      setEditEmail(user.email ?? '');

      const activeUserId = await AsyncStorage.getItem(ACTIVE_USER_ID_KEY);
      const profileKey = makeUserScopedKey(PROFILE_KEY, activeUserId);
      const rawProfile = await AsyncStorage.getItem(profileKey);
      const parsed = rawProfile ? (JSON.parse(rawProfile) as Partial<UserProfile>) : null;

      setEditFirstName(typeof parsed?.firstName === 'string' ? parsed.firstName : nameFirst || defaultProfile.firstName);
      setEditLastName(typeof parsed?.lastName === 'string' ? parsed.lastName : nameLast || defaultProfile.lastName);
      setEditPhone(typeof parsed?.phone === 'string' ? parsed.phone : defaultProfile.phone);
      setEditAddress(typeof parsed?.address === 'string' ? parsed.address : defaultProfile.address);
      setEditBio(typeof parsed?.bio === 'string' ? parsed.bio : defaultProfile.bio);

      setShowEditProfileModal(true);
    } catch {
      setShowEditProfileModal(true);
    }
  }, [user.avatar, user.email, user.name]);

  const pickEditAvatar = useCallback(async () => {
    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.8,
      });
      const uri = res.assets?.[0]?.uri;
      if (uri) setEditAvatar(uri);
    } catch {
      Alert.alert('Error', 'Failed to pick image');
    }
  }, []);

  const handleSaveEditProfile = useCallback(async () => {
    const nextFirst = editFirstName.trim();
    const nextLast = editLastName.trim();
    const nextEmail = editEmail.trim();

    if (!nextFirst || !nextLast || !nextEmail) {
      Alert.alert('Missing Info', 'Please enter your first name, last name, and email.');
      return;
    }

    const fullName = `${nextFirst} ${nextLast}`.trim();
    const profile: UserProfile = {
      firstName: nextFirst,
      lastName: nextLast,
      phone: editPhone.trim(),
      address: editAddress.trim(),
      bio: editBio.trim(),
    };

    try {
      setLoading(true);
      await updateProfile({ name: fullName, email: nextEmail, avatar: editAvatar ?? undefined });
      const activeUserId = await AsyncStorage.getItem(ACTIVE_USER_ID_KEY);
      const profileKey = makeUserScopedKey(PROFILE_KEY, activeUserId);
      await AsyncStorage.setItem(profileKey, JSON.stringify(profile));
      setShowEditProfileModal(false);
      await loadUserData();
    } catch {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  }, [editAddress, editAvatar, editBio, editEmail, editFirstName, editLastName, editPhone, loadUserData, updateProfile]);

  const changePasswordEnabled = useMemo(() => {
    const cur = currentPassword;
    const next = newPassword;
    const conf = confirmPassword;
    if (!cur || !next || !conf) return false;
    if (next.length < 8) return false;
    if (!passwordHasLetterAndNumber(next)) return false;
    if (next !== conf) return false;
    if (next === cur) return false;
    return true;
  }, [confirmPassword, currentPassword, newPassword]);

  const passwordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

  const passwordRequirementStatus = useMemo(() => {
    const next = newPassword;
    return {
      len: next.length >= 8,
      mix: passwordHasLetterAndNumber(next),
      match: Boolean(next) && next === confirmPassword,
    };
  }, [confirmPassword, newPassword]);

  const handleSavePassword = useCallback(async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Missing Info', 'Please fill out all password fields.');
      return;
    }

    if (newPassword.length < 8 || !passwordHasLetterAndNumber(newPassword)) {
      Alert.alert(
        'Weak Password',
        'Your password must be at least 8 characters long and include letters and numbers.',
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New password and confirmation do not match.');
      return;
    }

    if (newPassword === currentPassword) {
      Alert.alert('Invalid Password', 'New password must be different from your current password.');
      return;
    }

    const email = user.email.trim();
    if (!email) {
      Alert.alert('Error', 'No user email found. Please login again.');
      return;
    }

    try {
      setLoading(true);
      await verifyLocalLogin(email, currentPassword);
      await updateLocalPassword(email, newPassword);

      setShowChangePasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwShowCurrent(false);
      setPwShowNew(false);
      setPwShowConfirm(false);
      Alert.alert('Success', 'Password updated successfully');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update password';
      if (msg.toLowerCase().includes('invalid email or password') || msg.toLowerCase().includes('no local account')) {
        Alert.alert('Incorrect Password', 'Current password is incorrect, or no local account exists for this email.');
        return;
      }
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }, [confirmPassword, currentPassword, newPassword, user.email]);

  const exportAsCSV = useCallback(async () => {
    try {
      setLoading(true);
      const receipts = await listReceipts();
      const csv = receiptsToCsv(receipts as unknown as Array<Record<string, unknown>>);

      await Share.open({
        title: 'ReceiptStacker Export (CSV)',
        message: csv,
      });
    } catch {
      Alert.alert('Error', 'Failed to export data');
    } finally {
      setLoading(false);
    }
  }, []);

  const exportAsJSON = useCallback(async () => {
    try {
      setLoading(true);
      const receipts = await listReceipts();
      const payload = {
        exportedAt: new Date().toISOString(),
        user,
        settings,
        receipts,
      };

      await Share.open({
        title: 'ReceiptStacker Export (JSON)',
        message: JSON.stringify(payload, null, 2),
      });
    } catch {
      Alert.alert('Error', 'Failed to export data');
    } finally {
      setLoading(false);
    }
  }, [settings, user]);

  const exportAsPDF = useCallback(async () => {
    try {
      setLoading(true);
      const receipts = await listReceipts();

      const pdf = await generatePDF({
        html: buildReceiptsHtml(receipts as unknown as Array<Record<string, unknown>>),
        fileName: `receiptstacker-export-${Date.now()}`,
        base64: false,
      });

      if (!pdf.filePath) {
        Alert.alert('Export', 'Failed to generate PDF');
        return;
      }

      const url = pdf.filePath.startsWith('file://') ? pdf.filePath : `file://${pdf.filePath}`;
      await Share.open({
        title: 'ReceiptStacker Export (PDF)',
        url,
        type: 'application/pdf',
      });
    } catch {
      Alert.alert('Error', 'Failed to export data');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleExportData = useCallback(() => {
    Alert.alert('Export Data', 'Choose export format:', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'CSV', onPress: () => exportAsCSV() },
      { text: 'JSON', onPress: () => exportAsJSON() },
      { text: 'PDF', onPress: () => exportAsPDF() },
    ]);
  }, [exportAsCSV, exportAsJSON, exportAsPDF]);

  const handleClearCache = useCallback(() => {
    Alert.alert(
      'Clear Cache',
      'This will clear temporary data. Your receipts will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);

              // Cache keys are intentionally separate from receipts/auth.
              const cacheKeys: string[] = ['receiptstacker.temp'];
              await AsyncStorage.multiRemove(cacheKeys);

              Alert.alert('Success', 'Cache cleared successfully');
            } catch {
              Alert.alert('Error', 'Failed to clear cache');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, USER_KEY]);

            emitAuthChanged();
          } catch {
            Alert.alert('Error', 'Failed to logout');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }, []);

  const openUrl = useCallback(async (url: string) => {
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) {
        Alert.alert('Unavailable', 'Cannot open this link on your device.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Failed to open link');
    }
  }, []);

  const openSecuritySettings = useCallback(() => {
    const nav = navigation as any;
    try {
      nav.navigate('SecuritySettings');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Navigation failed: SecuritySettings', e);
      try {
        const parent = nav?.getParent?.();
        parent?.navigate?.('SecuritySettings');
      } catch (e2) {
        // eslint-disable-next-line no-console
        console.error('Parent navigation failed: SecuritySettings', e2);
      }
    }
  }, [navigation]);

  const handleReplayTourToggle = useCallback(
    (enabled: boolean) => {
      const run = async () => {
        try {
          setLoading(true);
          if (enabled) {
            await startFullAppTour();
            setReplayTourEnabled(true);
            // Kick the user to Home so the tour can begin.
            (navigation as any).navigate('Home');
          } else {
            await saveTourCompleted(true);
            await clearTourStage();
            setReplayTourEnabled(false);
          }
        } catch {
          Alert.alert('Error', enabled ? 'Failed to start tour' : 'Failed to disable tour');
        } finally {
          setLoading(false);
        }
      };

      void run();
    },
    [navigation],
  );

  const closeAction = useMemo(
    () => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => navigation.canGoBack() && navigation.goBack()}
        style={({ pressed }) => [styles.closeButton, pressed && styles.closePressed]}
        hitSlop={12}
      >
        <Text style={styles.closeText}>Close</Text>
      </Pressable>
    ),
    [navigation, styles.closeButton, styles.closePressed, styles.closeText],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Settings" rightAction={closeAction} showBackButton={false} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* User card */}
        <View style={styles.userCardWrap}>
          <Card variant="glassmorphism" style={styles.userCard}>
            <Avatar
              size="xl"
              name={user.name}
              source={user.avatar ? { uri: user.avatar } : undefined}
              style={styles.avatar}
              accessibilityLabel="User avatar"
            />

            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>

            <Button title="Edit Profile" variant="outline" size="sm" onPress={openEditProfile} />
          </Card>
        </View>

        {/* ACCOUNT */}
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <Card style={styles.sectionCard}>
          <SettingRow
            colors={colors}
            icon={<Feather name="user" size={ICON_SIZES.sm} color={colors.text} />}
            label="Edit Profile"
            onPress={openEditProfile}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="lock" size={ICON_SIZES.sm} color={colors.text} />}
            label="Change Password"
            onPress={() => setShowChangePasswordModal(true)}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
            isLast
          />
        </Card>

        {/* APP SETTINGS */}
        <Text style={styles.sectionTitle}>APP SETTINGS</Text>
        <Card style={styles.sectionCard}>
          <SettingRow
            colors={colors}
            icon={<Feather name={settings.darkMode ? 'moon' : 'sun'} size={ICON_SIZES.sm} color={colors.text} />}
            label="Dark Mode"
            right={<Switch value={settings.darkMode} onValueChange={handleDarkModeToggle} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="bell" size={ICON_SIZES.sm} color={colors.text} />}
            label="Notifications"
            right={<Switch value={settings.notifications} onValueChange={handleNotificationsToggle} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="mail" size={ICON_SIZES.sm} color={colors.text} />}
            label="Email Preferences"
            subtitle="Product updates and tips"
            right={<Switch value={settings.emailPreferences} onValueChange={handleEmailPreferencesToggle} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="globe" size={ICON_SIZES.sm} color={colors.text} />}
            label="Language"
            onPress={() => Alert.alert('Language', 'Only English is available right now.')}
            right={
              <View style={styles.valueRight}>
                <Text style={styles.valueText}>{settings.language}</Text>
                <Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />
              </View>
            }
            isLast
          />
        </Card>

        {/* SECURITY */}
        <Text style={styles.sectionTitle}>SECURITY</Text>
        <Card style={styles.sectionCard}>
          <SettingRow
            colors={colors}
            icon={<Feather name="shield" size={ICON_SIZES.sm} color={colors.text} />}
            label="Face ID Authentication"
            subtitle="Secure biometric login"
            right={<Switch value={settings.faceId} onValueChange={handleFaceIdToggle} />}
            isLast
          />
        </Card>

        {/* PREFERENCES */}
        <Text style={styles.sectionTitle}>PREFERENCES</Text>
        <Card style={styles.sectionCard}>
          <SettingRow
            colors={colors}
            icon={<Feather name="sliders" size={ICON_SIZES.sm} color={colors.text} />}
            label="Budget Alerts"
            subtitle="Notify at 80% and 100%"
            right={<Switch value={settings.budgetAlerts} onValueChange={handleBudgetAlertsToggle} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="smile" size={ICON_SIZES.sm} color={colors.text} />}
            label="Celebration Messages"
            subtitle="Show when under budget"
            right={<Switch value={settings.celebrationMessages} onValueChange={handleCelebrationMessagesToggle} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="clock" size={ICON_SIZES.sm} color={colors.text} />}
            label="Alert Duration"
            subtitle="Auto-hide banners on Home"
            onPress={() => setShowAlertDurationPicker(true)}
            right={
              <View style={styles.valueRight}>
                <Text style={styles.valueText}>{`${settings.alertDurationSeconds}s`}</Text>
                <Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />
              </View>
            }
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="repeat" size={ICON_SIZES.sm} color={colors.text} />}
            label="Alert Repeat"
            subtitle="How often alerts re-appear"
            onPress={() => setShowAlertRepeatPicker(true)}
            right={
              <View style={styles.valueRight}>
                <Text style={styles.valueText}>{`${settings.alertRepeatMinutes}m`}</Text>
                <Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />
              </View>
            }
          />
          <View ref={appTourRowRef} collapsable={false}>
            <SettingRow
              colors={colors}
              icon={<Feather name="map" size={ICON_SIZES.sm} color={colors.text} />}
              label="App Tour"
              subtitle="Simulate first-time experience"
              right={<Switch value={replayTourEnabled} onValueChange={handleReplayTourToggle} />}
            />
          </View>
          <SettingRow
            colors={colors}
            icon={<Feather name="credit-card" size={ICON_SIZES.sm} color={colors.text} />}
            label="Currency"
            subtitle={currencyMeta(settings.currency, activeLocale).name}
            onPress={openCurrencyPicker}
            right={
              <View ref={currencyTriggerRef} collapsable={false}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select currency"
                  onPress={openCurrencyPicker}
                  style={({ pressed }) => [styles.currencyPill, pressed ? styles.currencyPillPressed : null]}
                >
                  <Text style={styles.currencyPillText}>
                    {currencyMeta(settings.currency, activeLocale).symbol} {settings.currency}
                  </Text>
                  <Feather name="chevron-down" size={18} color={primary} />
                </Pressable>
              </View>
            }
            isLast
          />
        </Card>

        {/* DATA MANAGEMENT */}
        <Text style={styles.sectionTitle}>DATA MANAGEMENT</Text>
        <Card style={styles.sectionCard}>
          <SettingRow
            colors={colors}
            icon={<Feather name="download" size={ICON_SIZES.sm} color={colors.text} />}
            label="Export Data"
            onPress={handleExportData}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="database" size={ICON_SIZES.sm} color={colors.text} />}
            label="Backup & Restore"
            subtitle="Export or import your data"
            onPress={openBackupRestore}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="trash-2" size={ICON_SIZES.sm} color={colors.text} />}
            label="Clear Cache"
            onPress={handleClearCache}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
            isLast
          />
        </Card>

        {/* ABOUT */}
        <Text style={styles.sectionTitle}>ABOUT</Text>
        <Card style={styles.sectionCard}>
          <SettingRow
            colors={colors}
            icon={<Feather name="help-circle" size={ICON_SIZES.sm} color={colors.text} />}
            label="Help"
            onPress={() => setAboutModal('help')}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="book-open" size={ICON_SIZES.sm} color={colors.text} />}
            label="User Manual"
            subtitle="Detailed guide for all features"
            onPress={() => setAboutModal('manual')}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="zap" size={ICON_SIZES.sm} color={colors.text} />}
            label="Quick Reference Guide"
            subtitle="Short list of key actions"
            onPress={() => setAboutModal('quick')}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="file-text" size={ICON_SIZES.sm} color={colors.text} />}
            label="Privacy Policy"
            onPress={() => setAboutModal('privacy')}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="file-text" size={ICON_SIZES.sm} color={colors.text} />}
            label="Terms of Service"
            onPress={() => setAboutModal('terms')}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="info" size={ICON_SIZES.sm} color={colors.text} />}
            label="App Version"
            onPress={() => Alert.alert('App Version', `ReceiptStacker v${APP_VERSION}`)}
            right={<Text style={styles.valueText}>v{APP_VERSION}</Text>}
            isLast
          />
        </Card>

        {/* Logout */}
        <View style={styles.logoutWrap}>
          <Button title="Logout" variant="danger" size="lg" fullWidth onPress={handleLogout} />
        </View>
      </ScrollView>

      {/* Edit Profile Modal (matches Screen 1) */}
      <Modal
        isVisible={showEditProfileModal}
        onBackdropPress={() => setShowEditProfileModal(false)}
        onBackButtonPress={() => setShowEditProfileModal(false)}
        backdropOpacity={0.4}
        style={styles.modal}
        avoidKeyboard
      >
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.modalKbWrap}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>Edit Profile</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={() => setShowEditProfileModal(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.modalClosePressed]}
              >
                <Feather name="x" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <KeyboardAwareScrollView
              enableOnAndroid
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
              enableAutomaticScroll
              extraScrollHeight={Platform.OS === 'android' ? 24 : 16}
              contentContainerStyle={[styles.modalContent, { paddingBottom: SPACING['3xl'] }]}
            >
              <View style={styles.editAvatarWrap}>
                <View style={styles.editAvatarSquare}>
                  <LinearGradient colors={[COLORS.brand.primary, COLORS.brand.primaryDark]} style={StyleSheet.absoluteFill} />
                  {editAvatar ? (
                    <Image source={{ uri: editAvatar }} style={styles.editAvatarImage} />
                  ) : (
                    <Text style={styles.editAvatarInitials}>{initialsFor(editFirstName, editLastName)}</Text>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change photo"
                  onPress={pickEditAvatar}
                  style={({ pressed }) => [styles.cameraBtn, pressed && styles.cameraBtnPressed]}
                >
                  <Feather name="camera" size={18} color={COLORS.common.white} />
                </Pressable>
              </View>

              <View style={styles.row}>
                <View style={styles.flex1}>
                  <Input label="First Name" value={editFirstName} onChangeText={setEditFirstName} placeholder="John" />
                </View>
                <View style={{ width: SPACING.md }} />
                <View style={styles.flex1}>
                  <Input label="Last Name" value={editLastName} onChangeText={setEditLastName} placeholder="Doe" />
                </View>
              </View>

              <View style={styles.fieldSpacer} />
              <Input
                label="Email"
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="john.doe@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View style={styles.fieldSpacer} />
              <Input
                label="Phone"
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="+1 (555) 123-4567"
                keyboardType="phone-pad"
                autoCapitalize="none"
              />

              <View style={styles.fieldSpacer} />
              <Input
                label="Address"
                value={editAddress}
                onChangeText={setEditAddress}
                placeholder="123 Main St, City, State"
                autoCapitalize="sentences"
              />

              <View style={styles.fieldSpacer} />
              <Input
                label="Bio"
                value={editBio}
                onChangeText={setEditBio}
                placeholder="Managing my expenses efficiently with ReceiptStacker"
                multiline
                numberOfLines={4}
                minHeight={120}
              />

              <View style={{ height: SPACING.xl }} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save Changes"
                onPress={handleSaveEditProfile}
                disabled={loading}
                style={({ pressed }) => [
                  styles.primaryActionBtn,
                  pressed && !loading ? styles.primaryActionBtnPressed : null,
                  loading ? styles.primaryActionBtnDisabled : null,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.common.white} />
                ) : (
                  <Text style={styles.primaryActionText}>Save Changes</Text>
                )}
              </Pressable>
            </KeyboardAwareScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Currency Picker (matches Screen 1 dropdown) */}
      <Modal
        isVisible={showCurrencyPicker}
        onBackdropPress={() => setShowCurrencyPicker(false)}
        onBackButtonPress={() => setShowCurrencyPicker(false)}
        backdropOpacity={0}
        style={styles.currencyModal}
        useNativeDriver
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close currency picker"
          onPress={() => setShowCurrencyPicker(false)}
          style={StyleSheet.absoluteFill}
        />

        {(() => {
          const window = Dimensions.get('window');
          const popupWidth = 280;
          const popupMaxHeight = Math.min(360, Math.max(220, window.height * 0.42));
          const anchor = currencyAnchor;

          const left = anchor
            ? Math.max(16, Math.min(window.width - popupWidth - 16, anchor.x + anchor.width - popupWidth))
            : Math.max(16, (window.width - popupWidth) / 2);

          const top = anchor
            ? Math.max(80, Math.min(window.height - popupMaxHeight - 24, anchor.y + anchor.height + 10))
            : Math.max(120, (window.height - popupMaxHeight) / 2);

          const q = currencyQuery.trim().toLowerCase();
          const filtered = q
            ? CURRENCIES.filter(c => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
            : CURRENCIES;

          return (
            <View style={[styles.currencyPopup, { width: popupWidth, maxHeight: popupMaxHeight, left, top }]}>
              <View style={styles.currencyHeader}>
                <Input
                  value={currencyQuery}
                  onChangeText={setCurrencyQuery}
                  placeholder="Search currency (code or name)"
                />

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.currencyChips}
                >
                  {POPULAR_CURRENCY_CODES.map(code => {
                    if (!isSupportedCurrencyCode(code)) return null;
                    const selected = code === settings.currency;
                    return (
                      <Pressable
                        key={code}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${code}`}
                        onPress={() => handleCurrencySelect(code)}
                        style={({ pressed }) => [
                          styles.currencyChip,
                          selected ? styles.currencyChipSelected : null,
                          pressed ? styles.currencyChipPressed : null,
                        ]}
                      >
                        <Text style={[styles.currencyChipText, selected ? styles.currencyChipTextSelected : null]}>
                          {getCurrencySymbol(code, activeLocale)} {code}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.currencyDivider} />

              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
                {filtered.map(c => {
                  const selected = c.code === settings.currency;
                  const symbol = getCurrencySymbol(c.code, activeLocale);
                  return (
                    <Pressable
                      key={c.code}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${c.code}`}
                      onPress={() => handleCurrencySelect(c.code)}
                      style={({ pressed }) => [
                        styles.currencyOption,
                        selected ? styles.currencyOptionSelected : null,
                        pressed ? styles.currencyOptionPressed : null,
                      ]}
                    >
                      <View style={styles.currencyOptionRow}>
                        <Text style={[styles.currencyOptionText, selected ? styles.currencyOptionTextSelected : null]}>
                          {symbol} {c.code}
                        </Text>
                        <Text style={styles.currencyOptionSubText} numberOfLines={1}>
                          {c.name}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          );
        })()}
      </Modal>

      <Modal
        isVisible={showAlertDurationPicker}
        onBackdropPress={() => setShowAlertDurationPicker(false)}
        onBackButtonPress={() => setShowAlertDurationPicker(false)}
        backdropOpacity={0.35}
        style={styles.modal}
        avoidKeyboard
      >
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.modalKbWrap}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>Alert Duration</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={() => setShowAlertDurationPicker(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.modalClosePressed]}
              >
                <Feather name="x" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {alertDurationOptions.map((s) => {
                const selected = settings.alertDurationSeconds === s;
                return (
                  <Pressable
                    key={String(s)}
                    accessibilityRole="button"
                    accessibilityLabel={`Set alert duration to ${s} seconds`}
                    onPress={() => void handleAlertDurationSelect(s)}
                    style={({ pressed }) => [styles.pickerRow, selected ? { borderColor: primary } : null, pressed ? styles.pickerRowPressed : null]}
                  >
                    <Text style={[styles.pickerRowText, selected ? { color: primary } : null]}>{`${s} seconds`}</Text>
                    {selected ? <Feather name="check" size={18} color={primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        isVisible={showAlertRepeatPicker}
        onBackdropPress={() => setShowAlertRepeatPicker(false)}
        onBackButtonPress={() => setShowAlertRepeatPicker(false)}
        backdropOpacity={0.35}
        style={styles.modal}
        avoidKeyboard
      >
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.modalKbWrap}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>Alert Repeat</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={() => setShowAlertRepeatPicker(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.modalClosePressed]}
              >
                <Feather name="x" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {alertRepeatOptions.map((m) => {
                const selected = settings.alertRepeatMinutes === m;
                return (
                  <Pressable
                    key={String(m)}
                    accessibilityRole="button"
                    accessibilityLabel={`Set alert repeat to ${m} minutes`}
                    onPress={() => void handleAlertRepeatSelect(m)}
                    style={({ pressed }) => [styles.pickerRow, selected ? { borderColor: primary } : null, pressed ? styles.pickerRowPressed : null]}
                  >
                    <Text style={[styles.pickerRowText, selected ? { color: primary } : null]}>{`${m} minute${m === 1 ? '' : 's'}`}</Text>
                    {selected ? <Feather name="check" size={18} color={primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Backup & Restore Modal (matches Screen 2/3) */}
      <Modal
        isVisible={showBackupRestoreModal}
        onBackdropPress={closeBackupRestore}
        onBackButtonPress={closeBackupRestore}
        backdropOpacity={0.5}
        style={styles.modal}
        avoidKeyboard
      >
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.modalKbWrap}>
          <View style={styles.backupModalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>Backup & Restore</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={closeBackupRestore}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.modalClosePressed]}
              >
                <Feather name="x" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.backupContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Hero */}
              <View style={styles.backupHeroWrap}>
                <View style={styles.backupTopIconCircle}>
                  <Feather name="hard-drive" size={56} color={COLORS.common.white} />
                </View>

                <View style={styles.backupInfoBannerRow}>
                  <Feather name="info" size={20} color={styles.backupInfoIcon?.color ?? colors.textSecondary} />
                  <View style={styles.backupInfoBannerTextCol}>
                    <Text style={styles.backupInfoText}>
                      Keep your data safe by creating regular backups. You can restore your data anytime from a backup file.
                    </Text>
                    {lastBackupAt ? (
                      <Text style={styles.backupInfoMeta}>Last backup: {new Date(lastBackupAt).toLocaleString()}</Text>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* Multi-account banner */}
              <View style={styles.backupMultiAccountBanner}>
                <Feather name="database" size={20} color={colors.text} />
                <View style={styles.backupMultiAccountTextCol}>
                  <Text style={styles.backupMultiAccountTitle}>Multi-Account Backup</Text>
                  <Text style={styles.backupMultiAccountDesc}>
                    All backups include data from ALL user accounts. Any account can restore the complete backup.
                  </Text>
                </View>
              </View>

              {/* Create Backup */}
              <View style={styles.backupSectionCard}>
                <View style={styles.backupSectionHeaderPad}>
                  <Text style={styles.backupSectionTitleLarge}>Create Backup</Text>
                  <Text style={styles.backupSectionDescNoPad}>
                    Export all your data including receipts, budgets, categories, and settings to a secure JSON file.
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Advanced Options"
                  onPress={() => setShowAdvancedCreate(v => !v)}
                  style={({ pressed }) => [styles.backupToggleRow, pressed ? styles.backupToggleRowPressed : null]}
                >
                  <View style={styles.backupToggleLeft}>
                    <Feather name="settings" size={16} color={primary} />
                    <Text style={styles.backupToggleText}>Advanced Options</Text>
                  </View>
                  <Feather name="chevron-down" size={16} color={primary} style={{ transform: [{ rotate: showAdvancedCreate ? '180deg' : '0deg' }] }} />
                </Pressable>

                {showAdvancedCreate ? (
                  <View style={styles.backupAdvancedWrap}>
                    <Text style={styles.backupFieldLabel}>Backup Type</Text>
                    <View style={styles.backupGrid2}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Full Backup"
                        onPress={() => setBackupType('full')}
                        style={({ pressed }) => [
                          styles.backupGridBtn,
                          backupType === 'full' ? styles.backupGridBtnSelected : null,
                          pressed ? styles.backupGridBtnPressed : null,
                        ]}
                      >
                        <Feather name="hard-drive" size={20} color={backupType === 'full' ? primary : colors.textSecondary} />
                        <View style={styles.backupGridBtnTextCol}>
                          <Text style={styles.backupGridBtnTitle}>Full Backup</Text>
                          <Text style={styles.backupGridBtnDesc}>All data (~157 MB)</Text>
                        </View>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Selective Backup"
                        onPress={() => setBackupType('selective')}
                        style={({ pressed }) => [
                          styles.backupGridBtn,
                          backupType === 'selective' ? styles.backupGridBtnSelected : null,
                          pressed ? styles.backupGridBtnPressed : null,
                        ]}
                      >
                        <Feather name="folder" size={20} color={backupType === 'selective' ? primary : colors.textSecondary} />
                        <View style={styles.backupGridBtnTextCol}>
                          <Text style={styles.backupGridBtnTitle}>Selective</Text>
                          <Text style={styles.backupGridBtnDesc}>Choose categories</Text>
                        </View>
                      </Pressable>
                    </View>

                    {backupType === 'selective' ? (
                      <View style={styles.backupSelectiveWrap}>
                        <View style={styles.backupSelectiveHeaderRow}>
                          <Text style={styles.backupSelectiveTitle}>Categories</Text>
                          <View style={styles.backupSelectiveActions}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Select all categories"
                              onPress={() => setBackupCategories(prev => prev.map(c => ({ ...c, included: true })))}
                              hitSlop={10}
                            >
                              <Text style={styles.backupSelectiveActionText}>All</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Select no categories"
                              onPress={() => setBackupCategories(prev => prev.map(c => ({ ...c, included: false })))}
                              hitSlop={10}
                            >
                              <Text style={styles.backupSelectiveActionText}>None</Text>
                            </Pressable>
                          </View>
                        </View>

                        {backupCategories.map((cat) => (
                          <Pressable
                            key={cat.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Toggle ${cat.name}`}
                            onPress={() => setBackupCategories(prev => prev.map(c => (c.id === cat.id ? { ...c, included: !c.included } : c)))}
                            style={({ pressed }) => [
                              styles.backupCategoryRow,
                              cat.included ? styles.backupCategoryRowSelected : null,
                              pressed ? styles.backupCategoryRowPressed : null,
                            ]}
                          >
                            <View style={[styles.backupCategoryCheckbox, cat.included ? styles.backupCategoryCheckboxOn : null]}>
                              {cat.included ? <Feather name="check" size={14} color={COLORS.common.white} /> : null}
                            </View>

                            <View style={styles.backupCategoryContent}>
                              <View style={styles.backupCategoryNameRow}>
                                <View style={styles.backupCategoryNameLeft}>
                                  <Feather name={cat.icon as any} size={16} color={colors.textSecondary} />
                                  <Text style={styles.backupCategoryName}>{cat.name}</Text>
                                </View>
                                <Text style={styles.backupCategorySize}>{cat.dataSize}</Text>
                              </View>
                              <Text style={styles.backupCategoryDesc}>{cat.description}</Text>
                            </View>
                          </Pressable>
                        ))}

                        <View style={styles.backupSelectiveTotalRow}>
                          <Text style={styles.backupSelectiveTotalText}>Total size: ~{backupCategories.filter(c => c.included).length ? '157 MB' : '0 B'}</Text>
                        </View>
                      </View>
                    ) : null}

                    <Text style={styles.backupFieldLabel}>Security</Text>
                    <View style={styles.backupGrid2}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Encrypted"
                        onPress={() => setBackupEncryption('encrypted')}
                        style={({ pressed }) => [
                          styles.backupGridBtn,
                          backupEncryption === 'encrypted' ? styles.backupGridBtnSelectedSuccess : null,
                          pressed ? styles.backupGridBtnPressed : null,
                        ]}
                      >
                        <Feather name="lock" size={20} color={backupEncryption === 'encrypted' ? primary : colors.textSecondary} />
                        <View style={styles.backupGridBtnTextCol}>
                          <Text style={styles.backupGridBtnTitle}>Encrypted</Text>
                          <Text style={styles.backupGridBtnDesc}>AES-256 (Recommended)</Text>
                        </View>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Plain"
                        onPress={() => {
                          setBackupEncryption('plain');
                          setBackupPassword('');
                          setBackupPwShow(false);
                        }}
                        style={({ pressed }) => [
                          styles.backupGridBtn,
                          backupEncryption === 'plain' ? styles.backupGridBtnSelectedWarn : null,
                          pressed ? styles.backupGridBtnPressed : null,
                        ]}
                      >
                        <Feather name="unlock" size={20} color={backupEncryption === 'plain' ? primary : colors.textSecondary} />
                        <View style={styles.backupGridBtnTextCol}>
                          <Text style={styles.backupGridBtnTitle}>Plain</Text>
                          <Text style={styles.backupGridBtnDesc}>No encryption</Text>
                        </View>
                      </Pressable>
                    </View>

                    {backupEncryption === 'encrypted' ? (
                      <View style={styles.backupPasswordInlineWrap}>
                        <Text style={styles.backupFieldLabelSmall}>Encryption Password</Text>
                        <Input
                          label=""
                          value={backupPassword}
                          onChangeText={setBackupPassword}
                          placeholder="Enter password"
                          secureTextEntry={!backupPwShow}
                          rightIcon={
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={backupPwShow ? 'Hide password' : 'Show password'}
                              hitSlop={10}
                              onPress={() => setBackupPwShow(v => !v)}
                            >
                              <Feather name={backupPwShow ? 'unlock' : 'lock'} size={20} color={colors.textSecondary} />
                            </Pressable>
                          }
                        />

                        <View style={styles.backupPasswordHintRow}>
                          <Feather name="alert-circle" size={12} color={colors.textSecondary} />
                          <Text style={styles.backupPasswordHintText}>
                            Remember this password! It’s required to restore encrypted backups.
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    <Text style={styles.backupFieldLabel}>Destination</Text>
                    <View style={styles.backupDestinationList}>
                      {([
                        { id: 'local', icon: 'hard-drive', label: 'Local Storage (Protected)', desc: 'Survives app reinstall' },
                        { id: 'cloud', icon: 'cloud', label: 'Cloud Storage', desc: 'Google Drive, OneDrive' },
                        { id: 'share', icon: 'message-circle', label: 'Share Via', desc: 'Email, WhatsApp, USB' },
                      ] as const).map((opt) => {
                        const selected = backupDestination === opt.id;
                        return (
                          <Pressable
                            key={opt.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Select destination ${opt.label}`}
                            onPress={() => setBackupDestination(opt.id)}
                            style={({ pressed }) => [
                              styles.backupDestinationRow,
                              selected ? styles.backupDestinationRowSelected : null,
                              pressed ? styles.backupDestinationRowPressed : null,
                            ]}
                          >
                            <View style={styles.backupDestinationLeft}>
                              <Feather name={opt.icon as any} size={20} color={selected ? primary : colors.textSecondary} />
                              <View style={styles.backupDestinationTextCol}>
                                <Text style={styles.backupDestinationLabel}>{opt.label}</Text>
                                <Text style={styles.backupDestinationDesc}>{opt.desc}</Text>
                              </View>
                            </View>
                            {selected ? <Feather name="check" size={20} color={primary} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Download Backup"
                  onPress={createBackupFile}
                  disabled={backupBusy}
                  style={({ pressed }) => [
                    styles.backupDownloadBtn,
                    backupBusy ? styles.backupBtnDisabled : null,
                    pressed && !backupBusy ? styles.backupBtnPressed : null,
                  ]}
                >
                  {backupBusy ? (
                    <ActivityIndicator color={COLORS.common.white} />
                  ) : (
                    <View style={styles.backupBtnRow}>
                      <Feather name="download" size={20} color={COLORS.common.white} />
                      <Text style={styles.backupBtnText}>Download Backup</Text>
                    </View>
                  )}
                </Pressable>
              </View>

              {/* Restore */}
              <View style={styles.backupSectionCard}>
                <View style={styles.backupSectionHeaderPad}>
                  <Text style={styles.backupSectionTitleLarge}>Restore from Backup</Text>
                  <Text style={styles.backupSectionDescNoPad}>Import a previously saved backup file to restore your data.</Text>
                </View>

                <View style={styles.backupWarningBanner}>
                  <View style={styles.backupWarningRow}>
                    <Feather name="alert-circle" size={20} color={colors.text} style={{ marginTop: 2 }} />
                    <Text style={styles.backupWarningText}>
                      Warning: Restoring will overwrite your current data. Make sure you have a recent backup before proceeding.
                    </Text>
                  </View>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Restore Options"
                  onPress={() => setShowAdvancedRestore(v => !v)}
                  style={({ pressed }) => [styles.backupToggleRow, pressed ? styles.backupToggleRowPressed : null]}
                >
                  <View style={styles.backupToggleLeft}>
                    <Feather name="settings" size={16} color={primary} />
                    <Text style={styles.backupToggleText}>Restore Options</Text>
                  </View>
                  <Feather name="chevron-down" size={16} color={primary} style={{ transform: [{ rotate: showAdvancedRestore ? '180deg' : '0deg' }] }} />
                </Pressable>

                {showAdvancedRestore ? (
                  <View style={styles.backupAdvancedWrap}>
                    <Text style={styles.backupRecentTitle}>Recent Backups</Text>
                    <ScrollView style={styles.backupRecentList} nestedScrollEnabled>
                      {[...deviceBackups, ...localBackups]
                        .sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0))
                        .slice(0, 10)
                        .map((b) => {
                          const encrypted = String(b.name).includes('encrypted');
                          return (
                            <View key={b.path} style={styles.backupRecentItem}>
                              <View style={styles.backupRecentMainRow}>
                                <View style={styles.backupRecentIconBox}>
                                  <Feather name={encrypted ? 'shield' : 'hard-drive'} size={16} color={colors.textSecondary} />
                                </View>
                                <View style={styles.backupRecentContent}>
                                  <Text style={styles.backupRecentFilename} numberOfLines={1}>
                                    {b.name}
                                  </Text>
                                  <View style={styles.backupRecentTagsRow}>
                                    <View style={styles.backupTag}>
                                      <Text style={styles.backupTagText}>{String(b.name).includes('selective') ? 'selective' : 'full'}</Text>
                                    </View>
                                    {encrypted ? (
                                      <View style={styles.backupTag}>
                                        <Text style={styles.backupTagText}>encrypted</Text>
                                      </View>
                                    ) : null}
                                  </View>
                                  <Text style={styles.backupRecentDate}>
                                    {b.mtimeMs ? new Date(b.mtimeMs).toLocaleString() : '—'}
                                  </Text>
                                </View>
                              </View>

                              <View style={styles.backupRecentActionsRow}>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Restore ${b.name}`}
                                  onPress={() => {
                                    if (deviceBackups.some(d => d.path === b.path)) {
                                      void restoreFromDeviceBackup(b.path, b.name);
                                    } else {
                                      void restoreFromLocalBackup(b.path);
                                    }
                                  }}
                                  disabled={backupBusy}
                                  style={({ pressed }) => [styles.backupActionBtn, pressed && !backupBusy ? styles.backupActionBtnPressed : null]}
                                >
                                  <Feather name="upload" size={16} color={primary} />
                                </Pressable>

                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Share ${b.name}`}
                                  onPress={() => shareBackupAtPath(b.path)}
                                  disabled={backupBusy}
                                  style={({ pressed }) => [styles.backupActionBtn, pressed && !backupBusy ? styles.backupActionBtnPressed : null]}
                                >
                                  <Feather name="message-circle" size={16} color={primary} />
                                </Pressable>

                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Delete ${b.name}`}
                                  onPress={() => {
                                    Alert.alert('Delete Backup', `Delete this backup file?\n\n${b.name}`, [
                                      { text: 'Cancel', style: 'cancel' },
                                      {
                                        text: 'Delete',
                                        style: 'destructive',
                                        onPress: () => {
                                          void (async () => {
                                            try {
                                              await RNFS.unlink(b.path);
                                            } catch {
                                              // ignore
                                            }
                                            await loadLocalBackups();
                                            await loadDeviceBackups();
                                          })();
                                        },
                                      },
                                    ]);
                                  }}
                                  disabled={backupBusy}
                                  style={({ pressed }) => [styles.backupActionBtn, pressed && !backupBusy ? styles.backupActionBtnPressed : null]}
                                >
                                  <Feather name="trash-2" size={16} color={colors.textSecondary} />
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                    </ScrollView>
                  </View>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select Backup File"
                  onPress={restoreFromBackup}
                  disabled={backupBusy}
                  style={({ pressed }) => [
                    styles.backupRestoreBtn,
                    backupBusy ? styles.backupBtnDisabled : null,
                    pressed && !backupBusy ? styles.backupBtnPressed : null,
                  ]}
                >
                  <View style={styles.backupBtnRow}>
                    <Feather name="upload" size={20} color={COLORS.common.white} />
                    <Text style={styles.backupBtnText}>Select Backup File</Text>
                  </View>
                </Pressable>
              </View>

              {/* Schedule */}
              <View style={styles.backupCollapseCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Schedule Automatic Backups"
                  onPress={() => setShowSchedule(v => !v)}
                  style={({ pressed }) => [styles.backupCollapseHeader, pressed ? styles.backupToggleRowPressed : null]}
                >
                  <View style={styles.backupCollapseLeft}>
                    <Feather name="calendar" size={20} color={primary} />
                    <View style={styles.backupCollapseTextCol}>
                      <Text style={styles.backupCollapseTitle}>Schedule Automatic Backups</Text>
                      <Text style={styles.backupCollapseSubtitle}>Set up recurring backups</Text>
                    </View>
                  </View>
                  <Feather name="chevron-down" size={20} color={colors.textSecondary} style={{ transform: [{ rotate: showSchedule ? '180deg' : '0deg' }] }} />
                </Pressable>

                {showSchedule ? (
                  <View style={styles.backupCollapseBody}>
                    <View style={styles.backupScheduleRow}>
                      <Text style={styles.backupFieldLabel}>Enable</Text>
                      <Switch
                        value={scheduleEnabled}
                        onValueChange={(v) => {
                          setScheduleEnabled(v);
                          void persistBackupPrefs({ scheduleEnabled: v, scheduleFrequency, retentionPolicy });
                        }}
                      />
                    </View>

                    {scheduleEnabled ? (
                      <>
                        <Text style={styles.backupFieldLabel}>Frequency</Text>
                        <View style={styles.backupGrid3}>
                          {(['daily', 'weekly', 'monthly'] as const).map((f) => {
                            const selected = scheduleFrequency === f;
                            return (
                              <Pressable
                                key={f}
                                accessibilityRole="button"
                                accessibilityLabel={`Select ${f} frequency`}
                                onPress={() => {
                                  setScheduleFrequency(f);
                                  void persistBackupPrefs({ scheduleEnabled, scheduleFrequency: f, retentionPolicy });
                                }}
                                style={({ pressed }) => [
                                  styles.backupFreqBtn,
                                  selected ? styles.backupFreqBtnSelected : null,
                                  pressed ? styles.backupGridBtnPressed : null,
                                ]}
                              >
                                <Feather name="clock" size={16} color={selected ? primary : colors.textSecondary} />
                                <Text style={styles.backupFreqText}>{f}</Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        <View style={styles.backupInfoInline}>
                          <Feather name="info" size={14} color={colors.textSecondary} />
                          <Text style={styles.backupInfoInlineText}>
                            {scheduleFrequency === 'daily'
                              ? 'Backups will run daily at 2:00 AM'
                              : scheduleFrequency === 'weekly'
                                ? 'Backups will run every Sunday at 2:00 AM'
                                : 'Backups will run on the 1st of each month at 2:00 AM'}
                          </Text>
                        </View>

                        <Text style={styles.backupFieldLabel}>Retention</Text>
                        <View style={styles.backupGrid4}>
                          {([1, 3, 5, 10] as const).map((n) => {
                            const selected = retentionPolicy === n;
                            return (
                              <Pressable
                                key={String(n)}
                                accessibilityRole="button"
                                accessibilityLabel={`Keep ${n} backups`}
                                onPress={() => {
                                  setRetentionPolicy(n);
                                  void persistBackupPrefs({ scheduleEnabled, scheduleFrequency, retentionPolicy: n });
                                  void enforceRetentionPolicyNow(n);
                                  void loadLocalBackups();
                                  void loadDeviceBackups();
                                }}
                                style={({ pressed }) => [
                                  styles.backupRetentionBtn,
                                  selected ? styles.backupRetentionBtnSelected : null,
                                  pressed ? styles.backupGridBtnPressed : null,
                                ]}
                              >
                                <Text style={styles.backupRetentionText}>{String(n)}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <Text style={styles.backupRetentionHint}>Older backups will be automatically deleted</Text>
                      </>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {/* Manage Backups */}
              <View style={styles.backupCollapseCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Manage Backups"
                  onPress={() => setShowManageBackups(v => !v)}
                  style={({ pressed }) => [styles.backupCollapseHeader, pressed ? styles.backupToggleRowPressed : null]}
                >
                  <View style={styles.backupCollapseLeft}>
                    <Feather name="folder" size={20} color={primary} />
                    <View style={styles.backupCollapseTextCol}>
                      <Text style={styles.backupCollapseTitle}>Manage Backups</Text>
                      <Text style={styles.backupCollapseSubtitle}>View and delete existing backups</Text>
                    </View>
                  </View>
                  <Feather name="chevron-down" size={20} color={colors.textSecondary} style={{ transform: [{ rotate: showManageBackups ? '180deg' : '0deg' }] }} />
                </Pressable>

                {showManageBackups ? (
                  <View style={styles.backupCollapseBody}>
                    <View style={styles.backupManageHeaderRow}>
                      <Text style={styles.backupRecentTitle}>All Backups</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Delete all backups"
                        onPress={() => {
                          Alert.alert('Delete All Backups', 'This will delete all backup files stored on this device.', [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete All',
                              style: 'destructive',
                              onPress: () => {
                                void (async () => {
                                  try {
                                    for (const b of [...deviceBackups, ...localBackups]) {
                                      try {
                                        await RNFS.unlink(b.path);
                                      } catch {
                                        // ignore
                                      }
                                    }
                                  } finally {
                                    await loadLocalBackups();
                                    await loadDeviceBackups();
                                  }
                                })();
                              },
                            },
                          ]);
                        }}
                        hitSlop={10}
                      >
                        <Text style={styles.backupDeleteAllText}>Delete all</Text>
                      </Pressable>
                    </View>

                    <View style={styles.localBackupList}>
                      {[...deviceBackups, ...localBackups]
                        .sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0))
                        .slice(0, 20)
                        .map((b) => (
                          <View key={b.path} style={styles.localBackupRowWrap}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Restore ${b.name}`}
                              onPress={() => {
                                if (deviceBackups.some(d => d.path === b.path)) {
                                  void restoreFromDeviceBackup(b.path, b.name);
                                } else {
                                  void restoreFromLocalBackup(b.path);
                                }
                              }}
                              disabled={backupBusy}
                              style={({ pressed }) => [styles.localBackupRow, pressed && !backupBusy ? styles.localBackupRowPressed : null]}
                            >
                              <View style={styles.localBackupLeft}>
                                <View style={styles.localBackupIcon}>
                                  <Feather name={String(b.name).includes('encrypted') ? 'shield' : 'file-text'} size={16} color={colors.textSecondary} />
                                </View>
                                <View style={styles.localBackupTextCol}>
                                  <Text style={styles.localBackupName} numberOfLines={1}>
                                    {b.name}
                                  </Text>
                                  <Text style={styles.localBackupMeta} numberOfLines={1}>
                                    {b.mtimeMs ? new Date(b.mtimeMs).toLocaleString() : '—'}
                                  </Text>
                                </View>
                              </View>

                              <View style={styles.backupManageActionsInline}>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Share ${b.name}`}
                                  onPress={() => shareBackupAtPath(b.path)}
                                  disabled={backupBusy}
                                  hitSlop={10}
                                  style={({ pressed }) => [styles.localBackupShareBtn, pressed && !backupBusy ? styles.localBackupSharePressed : null]}
                                >
                                  <Feather name="share-2" size={16} color={colors.text} />
                                </Pressable>

                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Delete ${b.name}`}
                                  onPress={() => {
                                    Alert.alert('Delete Backup', `Delete this backup file?\n\n${b.name}`, [
                                      { text: 'Cancel', style: 'cancel' },
                                      {
                                        text: 'Delete',
                                        style: 'destructive',
                                        onPress: () => {
                                          void (async () => {
                                            try {
                                              await RNFS.unlink(b.path);
                                            } catch {
                                              // ignore
                                            }
                                            await loadLocalBackups();
                                            await loadDeviceBackups();
                                          })();
                                        },
                                      },
                                    ]);
                                  }}
                                  disabled={backupBusy}
                                  hitSlop={10}
                                  style={({ pressed }) => [styles.localBackupShareBtn, pressed && !backupBusy ? styles.localBackupSharePressed : null]}
                                >
                                  <Feather name="trash-2" size={16} color={colors.textSecondary} />
                                </Pressable>
                              </View>
                            </Pressable>
                          </View>
                        ))}
                    </View>
                  </View>
                ) : null}
              </View>

              {/* Best Practices */}
              <View style={styles.bestPracticesCard}>
                <View style={styles.bestPracticesHeader}>
                  <View style={styles.bestPracticesIcon}>
                    <Feather name="database" size={18} color={colors.text} />
                  </View>
                  <Text style={styles.bestPracticesTitle}>Best Practices</Text>
                </View>
                <View style={styles.bestPracticesList}>
                  <Text style={styles.bestPracticesItem}>• Create backups regularly (weekly recommended)</Text>
                  <Text style={styles.bestPracticesItem}>• Store backups in multiple locations (local and cloud)</Text>
                  <Text style={styles.bestPracticesItem}>• Use encryption for sensitive financial data</Text>
                  <Text style={styles.bestPracticesItem}>• Keep your encryption password in a safe place</Text>
                  <Text style={styles.bestPracticesItem}>• Test restore occasionally to ensure backups work</Text>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={closeBackupRestore}
                style={({ pressed }) => [styles.backupCloseBtn, pressed ? styles.backupClosePressed : null]}
              >
                <Text style={styles.backupCloseText}>Close</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Restore Password Modal */}
      <Modal
        isVisible={showRestorePasswordModal}
        onBackdropPress={() => {
          setShowRestorePasswordModal(false);
          setPendingRestorePath(null);
          setRestorePassword('');
          setRestorePwShow(false);
        }}
        onBackButtonPress={() => {
          setShowRestorePasswordModal(false);
          setPendingRestorePath(null);
          setRestorePassword('');
          setRestorePwShow(false);
        }}
        backdropOpacity={0.5}
        style={styles.modal}
        avoidKeyboard
      >
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.modalKbWrap}>
          <View style={styles.backupModalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>Enter Backup Password</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={() => {
                  setShowRestorePasswordModal(false);
                  setPendingRestorePath(null);
                  setRestorePassword('');
                  setRestorePwShow(false);
                }}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.modalClosePressed]}
              >
                <Feather name="x" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.passwordBanner}>
                <Text style={styles.passwordBannerText}>
                  This backup is encrypted. Enter the password to restore your data.
                </Text>
              </View>

              <Input
                label="Backup Password"
                value={restorePassword}
                onChangeText={setRestorePassword}
                placeholder="Enter password"
                secureTextEntry={!restorePwShow}
                rightIcon={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={restorePwShow ? 'Hide password' : 'Show password'}
                    hitSlop={10}
                    onPress={() => setRestorePwShow(v => !v)}
                  >
                    <Feather name={restorePwShow ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
                  </Pressable>
                }
              />

              <View style={{ height: SPACING.xl }} />

              <View style={[styles.row, { gap: 12 }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                  onPress={() => {
                    setShowRestorePasswordModal(false);
                    setPendingRestorePath(null);
                    setRestorePassword('');
                    setRestorePwShow(false);
                  }}
                  disabled={backupBusy}
                  style={({ pressed }) => [
                    styles.backupCloseBtn,
                    { flex: 1, marginTop: 0 },
                    pressed && !backupBusy ? styles.backupClosePressed : null,
                  ]}
                >
                  <Text style={styles.backupCloseText}>Cancel</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Restore"
                  onPress={() => {
                    const path = pendingRestorePath;
                    if (!path) {
                      setShowRestorePasswordModal(false);
                      return;
                    }

                    if (!restorePassword) {
                      Alert.alert('Password Required', 'Enter the password for this encrypted backup.');
                      return;
                    }

                    void (async () => {
                      try {
                        setBackupBusy(true);
                        await restoreRsbFromBackupFile({ filePath: path, password: restorePassword });
                        setShowRestorePasswordModal(false);
                        setPendingRestorePath(null);
                        setRestorePassword('');
                        setRestorePwShow(false);
                        closeBackupRestore();
                        await loadUserData();
                        await loadBackupMeta();
                        await loadLocalBackups();
                        await loadDeviceBackups();
                        Alert.alert('Restore Complete', 'Your data has been restored. Some screens may need to be reopened to refresh.');
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : 'Unable to restore from this backup.';
                        if (msg.toLowerCase().includes('password')) {
                          Alert.alert('Restore Failed', 'Incorrect password for this backup.');
                        } else {
                          Alert.alert('Restore Failed', msg);
                        }
                      } finally {
                        setBackupBusy(false);
                      }
                    })();
                  }}
                  disabled={backupBusy || !restorePassword}
                  style={({ pressed }) => [
                    styles.primaryActionBtn,
                    { flex: 1 },
                    backupBusy || !restorePassword ? styles.primaryActionBtnDisabled : null,
                    pressed && !(backupBusy || !restorePassword) ? styles.primaryActionBtnPressed : null,
                  ]}
                >
                  {backupBusy ? (
                    <ActivityIndicator color={COLORS.common.white} />
                  ) : (
                    <Text style={styles.primaryActionText}>Restore</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        isVisible={showChangePasswordModal}
        onBackdropPress={() => setShowChangePasswordModal(false)}
        onBackButtonPress={() => setShowChangePasswordModal(false)}
        backdropOpacity={0.4}
        style={styles.modal}
        avoidKeyboard
      >
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.modalKbWrap}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>Change Password</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={() => setShowChangePasswordModal(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.modalClosePressed]}
              >
                <Feather name="x" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <KeyboardAwareScrollView
              enableOnAndroid
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
              enableAutomaticScroll
              extraScrollHeight={Platform.OS === 'android' ? 24 : 16}
              contentContainerStyle={[styles.modalContent, { paddingBottom: SPACING['3xl'] }]}
            >
              <View style={styles.passwordBanner}>
                <Text style={styles.passwordBannerText}>
                  Your password must be at least 8 characters long and include letters and numbers.
                </Text>
              </View>

              <View style={styles.passwordStrengthCard}>
                <View style={styles.passwordStrengthRow}>
                  <Text style={styles.passwordStrengthLabel}>Password Strength</Text>
                  <Text
                    style={[
                      styles.passwordStrengthValue,
                      passwordStrength.label === 'Strong'
                        ? styles.passwordStrengthStrong
                        : passwordStrength.label === 'Good'
                          ? styles.passwordStrengthGood
                          : passwordStrength.label === 'Fair'
                            ? styles.passwordStrengthFair
                            : styles.passwordStrengthWeak,
                    ]}
                  >
                    {passwordStrength.label}
                  </Text>
                </View>

                <View style={styles.passwordStrengthBar}>
                  {[0, 1, 2, 3].map(i => {
                    const filled = passwordStrength.score >= i + 1;
                    return (
                      <View
                        // eslint-disable-next-line react/no-array-index-key
                        key={i}
                        style={[
                          styles.passwordStrengthSegment,
                          filled
                            ? passwordStrength.label === 'Strong'
                              ? styles.passwordStrengthSegmentStrong
                              : passwordStrength.label === 'Good'
                                ? styles.passwordStrengthSegmentGood
                                : passwordStrength.label === 'Fair'
                                  ? styles.passwordStrengthSegmentFair
                                  : styles.passwordStrengthSegmentWeak
                            : styles.passwordStrengthSegmentEmpty,
                        ]}
                      />
                    );
                  })}
                </View>

                <View style={styles.passwordReqList}>
                  <View style={styles.passwordReqRow}>
                    <Feather
                      name={passwordRequirementStatus.len ? 'check-circle' : 'circle'}
                      size={16}
                      color={passwordRequirementStatus.len ? '#16a34a' : colors.textTertiary}
                    />
                    <Text style={styles.passwordReqText}>At least 8 characters</Text>
                  </View>
                  <View style={styles.passwordReqRow}>
                    <Feather
                      name={passwordRequirementStatus.mix ? 'check-circle' : 'circle'}
                      size={16}
                      color={passwordRequirementStatus.mix ? '#16a34a' : colors.textTertiary}
                    />
                    <Text style={styles.passwordReqText}>Contains letters and numbers</Text>
                  </View>
                  <View style={styles.passwordReqRow}>
                    <Feather
                      name={passwordRequirementStatus.match ? 'check-circle' : 'circle'}
                      size={16}
                      color={passwordRequirementStatus.match ? '#16a34a' : colors.textTertiary}
                    />
                    <Text style={styles.passwordReqText}>Matches confirmation</Text>
                  </View>
                </View>
              </View>

              <Input
                label="Current Password"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Enter current password"
                secureTextEntry={!pwShowCurrent}
                rightIcon={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={pwShowCurrent ? 'Hide password' : 'Show password'}
                    hitSlop={10}
                    onPress={() => setPwShowCurrent(v => !v)}
                  >
                    <Feather name={pwShowCurrent ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
                  </Pressable>
                }
              />

              <View style={styles.fieldSpacer} />
              <Input
                label="New Password"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Enter new password"
                secureTextEntry={!pwShowNew}
                rightIcon={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={pwShowNew ? 'Hide password' : 'Show password'}
                    hitSlop={10}
                    onPress={() => setPwShowNew(v => !v)}
                  >
                    <Feather name={pwShowNew ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
                  </Pressable>
                }
              />

              <View style={styles.fieldSpacer} />
              <Input
                label="Confirm New Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                secureTextEntry={!pwShowConfirm}
                rightIcon={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={pwShowConfirm ? 'Hide password' : 'Show password'}
                    hitSlop={10}
                    onPress={() => setPwShowConfirm(v => !v)}
                  >
                    <Feather name={pwShowConfirm ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
                  </Pressable>
                }
              />

              <View style={{ height: SPACING.xl }} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change Password"
                onPress={handleSavePassword}
                disabled={!changePasswordEnabled || loading}
                style={({ pressed }) => [
                  styles.primaryActionBtn,
                  !changePasswordEnabled || loading ? styles.primaryActionBtnDisabledHard : null,
                  pressed && changePasswordEnabled && !loading ? styles.primaryActionBtnPressed : null,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.common.white} />
                ) : (
                  <Text
                    style={[
                      styles.primaryActionText,
                      !changePasswordEnabled ? styles.primaryActionTextDisabled : null,
                    ]}
                  >
                    Change Password
                  </Text>
                )}
              </Pressable>
            </KeyboardAwareScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* About Modals */}
      <Modal
        isVisible={aboutModal != null}
        onBackdropPress={() => setAboutModal(null)}
        onBackButtonPress={() => setAboutModal(null)}
        backdropOpacity={0.4}
        style={styles.modal}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalHeaderTitle}>
              {aboutModal === 'help'
                ? 'Help'
                : aboutModal === 'manual'
                  ? 'User Manual'
                  : aboutModal === 'quick'
                    ? 'Quick Reference Guide'
                : aboutModal === 'privacy'
                  ? 'Privacy Policy'
                  : aboutModal === 'terms'
                    ? 'Terms of Service'
                    : ''}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={12}
              onPress={() => setAboutModal(null)}
              style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.modalClosePressed]}
            >
              <Feather name="x" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            {aboutModal === 'help' ? (
              <View>
                <Text style={styles.aboutBodyText}>{HELP_TEXT}</Text>

                <Text style={[styles.sectionTitle, { marginTop: SPACING.lg }]}>FAQ</Text>
                <Card style={styles.sectionCard}>
                  {HELP_FAQ.map((item, idx) => {
                    const open = expandedFaq === idx;
                    return (
                      <Pressable
                        key={item.question}
                        accessibilityRole="button"
                        accessibilityLabel={`FAQ ${item.question}`}
                        onPress={() => setExpandedFaq(prev => (prev === idx ? null : idx))}
                        style={({ pressed }) => [styles.faqRow, pressed && styles.pressed]}
                      >
                        <View style={styles.faqRowTop}>
                          <Text style={styles.faqQ} numberOfLines={2}>
                            {item.question}
                          </Text>
                          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
                        </View>
                        {open ? <Text style={styles.faqA}>{item.answer}</Text> : null}
                      </Pressable>
                    );
                  })}
                </Card>
              </View>
            ) : null}

            {aboutModal === 'manual' ? <Text style={styles.aboutLegalText}>{USER_MANUAL_TEXT}</Text> : null}
            {aboutModal === 'quick' ? <Text style={styles.aboutLegalText}>{QUICK_REFERENCE_TEXT}</Text> : null}

            {aboutModal === 'privacy' ? (
              <Text style={styles.aboutLegalText}>{PRIVACY_POLICY_TEXT}</Text>
            ) : null}

            {aboutModal === 'terms' ? (
              <Text style={styles.aboutLegalText}>{TERMS_OF_SERVICE_TEXT}</Text>
            ) : null}

            {aboutModal === 'help' ? (
              <View style={styles.supportWrap}>
                <Text style={styles.supportLabel}>Support</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Email ${SUPPORT_EMAIL}`}
                  onPress={() => openUrl(`mailto:${SUPPORT_EMAIL}?subject=ReceiptStacker%20Support`)}
                  style={({ pressed }) => [styles.supportEmailBtn, pressed ? styles.aboutActionBtnPressed : null]}
                >
                  <Text style={styles.supportEmailText}>{SUPPORT_EMAIL}</Text>
                </Pressable>
              </View>
            ) : null}

            {aboutModal != null ? (
              <View style={styles.aboutLegalActionsRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Copy text"
                  onPress={() => {
                    if (!aboutDocText) return;
                    Clipboard.setString(aboutDocText);
                    Alert.alert('Copied', 'Text copied to clipboard.');
                  }}
                  style={({ pressed }) => [styles.aboutSecondaryBtn, pressed ? styles.aboutSecondaryBtnPressed : null]}
                >
                  <Text style={styles.aboutSecondaryBtnText}>Copy</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Share text"
                  onPress={async () => {
                    if (!aboutDocText) return;
                    try {
                      await Share.open({
                        title:
                          aboutModal === 'privacy'
                            ? 'Privacy Policy'
                            : aboutModal === 'terms'
                              ? 'Terms of Service'
                              : aboutModal === 'manual'
                                ? 'User Manual'
                                : aboutModal === 'quick'
                                  ? 'Quick Reference Guide'
                                  : 'Help',
                        message: aboutDocText,
                      });
                    } catch {
                      // user cancelled share sheet
                    }
                  }}
                  style={({ pressed }) => [styles.aboutSecondaryBtn, pressed ? styles.aboutSecondaryBtnPressed : null]}
                >
                  <Text style={styles.aboutSecondaryBtnText}>Share</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <GuidedTourModal
        visible={tourVisible}
        stepIndex={tourStep}
        steps={tourSteps}
        onClose={() => {
          void cancelTour();
        }}
        onSkip={() => {
          void cancelTour();
        }}
        onNext={handleTourNext}
      />

      <LoadingOverlay visible={loading} message="Working…" />
    </SafeAreaView>
  );
};

const createStyles = (opts: {
  colors: {
    background: string;
    surface: string;
    border: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
  };
  primary: string;
  isDark: boolean;
}) => {
  const softPrimary = toRgba(opts.primary, 0.12);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: opts.colors.background,
    },
    scrollContent: {
      paddingBottom: SPACING['2xl'],
    },
    closeButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: RADIUS.full,
      backgroundColor: opts.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: opts.colors.border,
    },
    closePressed: {
      opacity: 0.75,
    },
    closeText: {
      ...TYPOGRAPHY.label,
      color: opts.colors.text,
    },

    userCardWrap: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
      marginBottom: 24,
    },
    userCard: {
      padding: 20,
      alignItems: 'center',
      backgroundColor: softPrimary,
    } as ViewStyle,
    avatar: {
      marginBottom: 12,
    },
    userName: {
      ...TYPOGRAPHY.sectionHeading,
      color: opts.colors.text,
      marginBottom: 4,
      textAlign: 'center',
    },
    userEmail: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.textSecondary,
      marginBottom: 16,
      textAlign: 'center',
    },

    sectionTitle: {
      ...TYPOGRAPHY.caption,
      color: opts.isDark ? toRgba(opts.colors.text, 0.55) : opts.colors.textTertiary,
      letterSpacing: 1,
      marginBottom: 8,
      marginHorizontal: SPACING.lg,
    },
    sectionCard: {
      marginHorizontal: SPACING.lg,
      marginBottom: 24,
      paddingVertical: 4,
    },

    valueRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    valueText: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.textSecondary,
    },

    currencyPill: {
      height: 40,
      borderRadius: RADIUS.full,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: opts.colors.surface,
      borderWidth: 2,
      borderColor: opts.primary,
    },
    currencyPillPressed: {
      opacity: 0.85,
    },
    currencyPillText: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.text,
      fontWeight: '700',
    },

    logoutWrap: {
      paddingHorizontal: SPACING.lg,
      marginTop: 8,
    },

    modal: {
      margin: 0,
      justifyContent: 'center',
      paddingHorizontal: 0,
      alignItems: 'stretch',
    },

    currencyModal: {
      margin: 0,
    },
    currencyPopup: {
      position: 'absolute',
      backgroundColor: opts.colors.surface,
      borderRadius: 10,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: toRgba('#000000', 0.12),
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
    currencyHeader: {
      padding: 12,
      paddingBottom: 10,
      gap: 10,
    },
    currencyChips: {
      gap: 8,
      paddingVertical: 2,
      paddingHorizontal: 2,
    },
    currencyChip: {
      borderRadius: RADIUS.full,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: toRgba('#000000', 0.12),
      backgroundColor: opts.colors.surface,
    },
    currencyChipSelected: {
      borderColor: opts.primary,
      backgroundColor: opts.isDark ? toRgba(opts.primary, 0.18) : toRgba(opts.primary, 0.10),
    },
    currencyChipPressed: {
      opacity: 0.85,
    },
    currencyChipText: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.text,
      fontWeight: '700',
    },
    currencyChipTextSelected: {
      color: opts.colors.text,
    },
    currencyDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: opts.colors.border,
    },
    currencyOption: {
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    currencyOptionSelected: {
      backgroundColor: opts.isDark ? toRgba('#ffffff', 0.10) : '#e5e7eb',
    },
    currencyOptionPressed: {
      backgroundColor: opts.isDark ? toRgba('#ffffff', 0.06) : '#f1f5f9',
    },
    currencyOptionText: {
      ...TYPOGRAPHY.bodyNormal,
      color: opts.colors.text,
      fontWeight: '600',
    },
    currencyOptionRow: {
      flexDirection: 'column',
      gap: 2,
    },
    currencyOptionSubText: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
    },
    currencyOptionTextSelected: {
      color: opts.colors.text,
      fontWeight: '700',
    },
    modalKbWrap: {
      flex: 1,
      justifyContent: 'center',
    },
    modalSheet: {
      backgroundColor: opts.colors.surface,
      borderRadius: 24,
      overflow: 'hidden',
      width: '100%',
      maxHeight: '92%',
    },
    modalHeaderRow: {
      paddingHorizontal: 18,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: opts.colors.border,
    },
    modalHeaderTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: opts.colors.text,
    },
    modalCloseBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    modalClosePressed: {
      opacity: 0.7,
    },
    modalCloseIcon: {
      color: opts.colors.textSecondary,
    },
    modalContent: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 22,
    },

    pickerRow: {
      height: 48,
      borderRadius: 14,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: opts.colors.border,
      backgroundColor: opts.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    pickerRowPressed: {
      opacity: 0.85,
    },
    pickerRowText: {
      ...TYPOGRAPHY.bodyNormal,
      color: opts.colors.text,
      fontWeight: '700',
    },

    backupContent: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 20,
      gap: 14,
    },
    backupHeroWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      marginTop: 2,
      marginBottom: 6,
    },
    backupTopIconCircle: {
      width: 112,
      height: 112,
      borderRadius: 56,
      backgroundColor: opts.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        ios: {
          shadowColor: opts.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
        },
        android: {
          elevation: 6,
        },
      }),
    },

    backupModalSheet: {
      backgroundColor: opts.colors.surface,
      borderRadius: 16,
      overflow: 'hidden',
      width: '90%',
      maxWidth: 600,
      maxHeight: '90%',
      alignSelf: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 24,
        },
        android: {
          elevation: 16,
        },
      }),
    },

    backupInfoBannerRow: {
      backgroundColor: opts.isDark ? toRgba(opts.primary, 0.14) : '#eff6ff',
      borderColor: opts.isDark ? toRgba(opts.primary, 0.30) : '#bfdbfe',
      borderWidth: 1,
      borderRadius: 12,
      padding: 16,
      width: '100%',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    backupInfoIcon: {
      color: opts.colors.text,
      marginTop: 2,
    },
    backupInfoBannerTextCol: {
      flex: 1,
    },
    backupInfoText: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.isDark ? opts.colors.text : '#1e40af',
      lineHeight: 20,
    },
    backupInfoMeta: {
      ...TYPOGRAPHY.caption,
      color: opts.isDark ? opts.colors.textSecondary : '#1e3a8a',
      marginTop: 8,
      fontWeight: '700',
    },

    backupSectionCard: {
      backgroundColor: opts.colors.surface,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: opts.colors.border,
      overflow: 'hidden',
    },
    backupSectionHeaderPad: {
      paddingHorizontal: 24,
      paddingVertical: 20,
    },
    backupSectionTitleLarge: {
      ...TYPOGRAPHY.sectionHeading,
      color: opts.colors.text,
      fontWeight: '800',
      marginBottom: 8,
    },
    backupSectionDescNoPad: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.textSecondary,
      lineHeight: 20,
    },
    backupSectionTitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: opts.colors.text,
      fontWeight: '800',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
    },
    backupSectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: opts.colors.border,
    },
    backupSectionDesc: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.textSecondary,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 14,
      lineHeight: 20,
    },

    backupMultiAccountBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: opts.isDark ? toRgba(opts.primary, 0.12) : toRgba(opts.primary, 0.08),
      borderRadius: 12,
      borderWidth: 1,
      borderColor: opts.isDark ? toRgba(opts.primary, 0.30) : toRgba(opts.primary, 0.22),
      padding: 16,
    },
    backupMultiAccountTextCol: {
      flex: 1,
      gap: 4,
    },
    backupMultiAccountTitle: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.text,
      fontWeight: '800',
    },
    backupMultiAccountDesc: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
      lineHeight: 18,
    },

    backupToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: opts.colors.border,
    },
    backupToggleRowPressed: {
      opacity: 0.85,
    },
    backupToggleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    backupToggleText: {
      ...TYPOGRAPHY.caption,
      color: opts.primary,
      fontWeight: '800',
    },
    backupAdvancedWrap: {
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: opts.colors.border,
      gap: 12,
    },
    backupFieldLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.text,
      fontWeight: '800',
    },
    backupFieldLabelSmall: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.text,
      fontWeight: '800',
      marginBottom: 8,
    },
    backupGrid2: {
      flexDirection: 'row',
      gap: 12,
    },
    backupGrid3: {
      flexDirection: 'row',
      gap: 8,
    },
    backupGrid4: {
      flexDirection: 'row',
      gap: 8,
    },
    backupGridBtn: {
      flex: 1,
      minHeight: 80,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: opts.colors.border,
      backgroundColor: 'transparent',
      padding: 12,
      gap: 10,
      justifyContent: 'space-between',
    },
    backupGridBtnPressed: {
      opacity: 0.9,
    },
    backupGridBtnSelected: {
      borderColor: opts.primary,
      backgroundColor: opts.isDark ? toRgba(opts.primary, 0.18) : toRgba(opts.primary, 0.08),
    },
    backupGridBtnSelectedSuccess: {
      borderColor: opts.primary,
      backgroundColor: opts.isDark ? toRgba(opts.primary, 0.14) : toRgba(opts.primary, 0.06),
    },
    backupGridBtnSelectedWarn: {
      borderColor: opts.primary,
      backgroundColor: opts.isDark ? toRgba(opts.primary, 0.10) : toRgba(opts.primary, 0.04),
    },
    backupGridBtnTextCol: {
      gap: 4,
    },
    backupGridBtnTitle: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.text,
      fontWeight: '800',
    },
    backupGridBtnDesc: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
      lineHeight: 16,
    },

    backupSelectiveWrap: {
      marginTop: 4,
      padding: 16,
      borderRadius: 12,
      backgroundColor: opts.isDark ? toRgba(opts.colors.surface, 0.6) : toRgba('#000000', 0.02),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: opts.colors.border,
      gap: 10,
    },
    backupSelectiveHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    backupSelectiveTitle: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.text,
      fontWeight: '800',
    },
    backupSelectiveActions: {
      flexDirection: 'row',
      gap: 10,
    },
    backupSelectiveActionText: {
      ...TYPOGRAPHY.caption,
      color: opts.primary,
      textDecorationLine: 'underline',
      fontWeight: '700',
    },
    backupCategoryRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: 12,
      backgroundColor: opts.colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: opts.colors.border,
      gap: 12,
    },
    backupCategoryRowSelected: {
      borderColor: toRgba(opts.primary, 0.55),
    },
    backupCategoryRowPressed: {
      opacity: 0.92,
    },
    backupCategoryCheckbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: opts.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
      backgroundColor: 'transparent',
    },
    backupCategoryCheckboxOn: {
      borderColor: opts.primary,
      backgroundColor: opts.primary,
    },
    backupCategoryContent: {
      flex: 1,
      gap: 4,
    },
    backupCategoryNameRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    backupCategoryNameLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    backupCategoryName: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.text,
      fontWeight: '800',
      flex: 1,
    },
    backupCategorySize: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
    },
    backupCategoryDesc: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
      lineHeight: 16,
    },
    backupSelectiveTotalRow: {
      marginTop: 6,
      alignItems: 'flex-end',
    },
    backupSelectiveTotalText: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
    },

    backupPasswordInlineWrap: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: opts.isDark ? toRgba(opts.colors.surface, 0.6) : toRgba('#000000', 0.02),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: opts.colors.border,
      gap: 8,
    },
    backupPasswordHintRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
    },
    backupPasswordHintText: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
      flex: 1,
      lineHeight: 16,
    },

    backupDestinationList: {
      gap: 8,
    },
    backupDestinationRow: {
      width: '100%',
      padding: 12,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: opts.colors.border,
      backgroundColor: 'transparent',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backupDestinationRowSelected: {
      borderColor: opts.primary,
      backgroundColor: opts.isDark ? toRgba(opts.primary, 0.18) : toRgba(opts.primary, 0.08),
    },
    backupDestinationRowPressed: {
      opacity: 0.9,
    },
    backupDestinationLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      paddingRight: 12,
    },
    backupDestinationTextCol: {
      flex: 1,
      gap: 2,
    },
    backupDestinationLabel: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.text,
      fontWeight: '800',
    },
    backupDestinationDesc: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
      lineHeight: 16,
    },

    backupRecentTitle: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.text,
      fontWeight: '800',
      marginBottom: 10,
    },
    backupRecentList: {
      maxHeight: 240,
    },
    backupRecentItem: {
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: opts.colors.border,
      backgroundColor: opts.isDark ? toRgba(opts.colors.surface, 0.6) : toRgba('#000000', 0.02),
      marginBottom: 8,
    },
    backupRecentMainRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    backupRecentIconBox: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: opts.isDark ? toRgba(opts.primary, 0.14) : toRgba(opts.primary, 0.08),
      alignItems: 'center',
      justifyContent: 'center',
    },
    backupRecentContent: {
      flex: 1,
      gap: 4,
    },
    backupRecentFilename: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.text,
      fontWeight: '800',
    },
    backupRecentTagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    backupTag: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: opts.isDark ? toRgba(opts.primary, 0.18) : toRgba(opts.primary, 0.10),
    },
    backupTagText: {
      ...TYPOGRAPHY.caption,
      color: opts.primary,
      fontSize: 10,
      fontWeight: '700',
    },
    backupRecentDate: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
      fontSize: 10,
    },
    backupRecentActionsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
    },
    backupActionBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: opts.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: opts.colors.border,
    },
    backupActionBtnPressed: {
      opacity: 0.85,
    },

    backupCollapseCard: {
      backgroundColor: opts.colors.surface,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: opts.colors.border,
      overflow: 'hidden',
    },
    backupCollapseHeader: {
      padding: 24,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backupCollapseLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      paddingRight: 12,
    },
    backupCollapseTextCol: {
      flex: 1,
      gap: 2,
    },
    backupCollapseTitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: opts.colors.text,
      fontWeight: '900',
    },
    backupCollapseSubtitle: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
      lineHeight: 18,
    },
    backupCollapseBody: {
      paddingHorizontal: 24,
      paddingBottom: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: opts.colors.border,
      gap: 12,
    },
    backupScheduleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 10,
    },
    backupFreqBtn: {
      flex: 1,
      minHeight: 64,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: opts.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    backupFreqBtnSelected: {
      borderColor: opts.primary,
      backgroundColor: opts.isDark ? toRgba(opts.primary, 0.18) : toRgba(opts.primary, 0.08),
    },
    backupFreqText: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.text,
      fontWeight: '800',
      textTransform: 'capitalize',
    },
    backupInfoInline: {
      marginTop: 8,
      padding: 12,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: toRgba(opts.primary, 0.30),
      backgroundColor: opts.isDark ? toRgba(opts.primary, 0.14) : toRgba(opts.primary, 0.08),
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    backupInfoInlineText: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
      lineHeight: 18,
      flex: 1,
    },
    backupRetentionBtn: {
      flex: 1,
      minHeight: 40,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: opts.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backupRetentionBtnSelected: {
      borderColor: opts.primary,
      backgroundColor: opts.isDark ? toRgba(opts.primary, 0.18) : toRgba(opts.primary, 0.08),
    },
    backupRetentionText: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.text,
      fontWeight: '900',
    },
    backupRetentionHint: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
      lineHeight: 18,
    },

    backupManageHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      marginBottom: 2,
    },
    backupDeleteAllText: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.text,
      textDecorationLine: 'underline',
      fontWeight: '800',
    },
    backupManageActionsInline: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
    },

    backupDownloadBtn: {
      marginHorizontal: 16,
      marginBottom: 16,
      height: 54,
      borderRadius: 16,
      backgroundColor: '#16a34a',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#16a34a',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 4,
    },
    backupLocalBtn: {
      marginHorizontal: 16,
      height: 54,
      borderRadius: 16,
      backgroundColor: opts.colors.surface,
      borderWidth: 2,
      borderColor: opts.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backupLocalBtnPressed: {
      opacity: 0.88,
    },
    backupLocalBtnText: {
      ...TYPOGRAPHY.buttonText,
      color: opts.colors.text,
      fontWeight: '800',
    },
    backupLocalHint: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 14,
      lineHeight: 18,
    },
    backupRestoreBtn: {
      marginHorizontal: 16,
      marginBottom: 16,
      height: 54,
      borderRadius: 16,
      backgroundColor: opts.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 4,
    },
    backupBtnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    backupBtnText: {
      ...TYPOGRAPHY.buttonText,
      color: COLORS.common.white,
      fontWeight: '800',
    },
    backupBtnDisabled: {
      opacity: 0.65,
    },
    backupBtnPressed: {
      opacity: 0.9,
    },

    localBackupList: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      gap: 10,
    },
    localBackupRowWrap: {
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: opts.colors.border,
      backgroundColor: opts.isDark ? toRgba(opts.colors.surface, 0.55) : '#f8fafc',
    },
    localBackupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    localBackupRowPressed: {
      opacity: 0.9,
    },
    localBackupLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 10,
      paddingRight: 10,
    },
    localBackupIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: opts.isDark ? toRgba(opts.primary, 0.18) : '#e0f2fe',
      alignItems: 'center',
      justifyContent: 'center',
    },
    localBackupTextCol: {
      flex: 1,
    },
    localBackupName: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.text,
      fontWeight: '700',
    },
    localBackupMeta: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
      marginTop: 2,
    },
    localBackupShareBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: opts.isDark ? toRgba(opts.colors.background, 0.35) : '#ffffff',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: opts.colors.border,
    },
    localBackupSharePressed: {
      opacity: 0.85,
    },

    backupWarningBanner: {
      marginHorizontal: 16,
      marginBottom: 14,
      borderRadius: 14,
      backgroundColor: opts.isDark ? toRgba('#f59e0b', 0.14) : '#fffbeb',
      borderWidth: 1,
      borderColor: opts.isDark ? toRgba('#f59e0b', 0.30) : '#fcd34d',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    backupWarningRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    backupWarningText: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.isDark ? opts.colors.text : '#92400e',
      flex: 1,
      lineHeight: 20,
    },

    bestPracticesCard: {
      backgroundColor: opts.isDark ? toRgba('#22c55e', 0.14) : '#ecfdf5',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: opts.isDark ? toRgba('#22c55e', 0.28) : '#bbf7d0',
      padding: 14,
      marginTop: 2,
    },
    bestPracticesHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    bestPracticesIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: opts.isDark ? toRgba('#22c55e', 0.18) : '#d1fae5',
      alignItems: 'center',
      justifyContent: 'center',
    },
    bestPracticesTitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: opts.isDark ? opts.colors.text : '#065f46',
      fontWeight: '900',
    },
    bestPracticesList: {
      gap: 6,
      paddingLeft: 2,
    },
    bestPracticesItem: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.isDark ? opts.colors.textSecondary : '#065f46',
      lineHeight: 20,
    },

    backupCloseBtn: {
      height: 54,
      borderRadius: 16,
      backgroundColor: opts.colors.surface,
      borderWidth: 2,
      borderColor: opts.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    backupClosePressed: {
      opacity: 0.8,
    },
    backupCloseText: {
      ...TYPOGRAPHY.buttonText,
      color: opts.colors.text,
      fontWeight: '800',
    },
    modalAvatarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
      marginBottom: SPACING.lg,
    },
    modalAvatar: {
      borderWidth: 2,
      borderColor: opts.primary,
    },
    fieldSpacer: {
      height: SPACING.md,
    },
    editAvatarWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.lg,
    },
    editAvatarSquare: {
      width: 92,
      height: 92,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    editAvatarImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    editAvatarInitials: {
      ...TYPOGRAPHY.sectionHeading,
      fontSize: 30,
      color: COLORS.common.white,
    },
    cameraBtn: {
      position: 'absolute',
      right: 6,
      bottom: 6,
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: opts.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: opts.colors.surface,
    },
    cameraBtnPressed: {
      opacity: 0.85,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    flex1: {
      flex: 1,
    },
    passwordBanner: {
      backgroundColor: opts.isDark ? toRgba('#f59e0b', 0.14) : '#FEF3C7',
      borderColor: opts.isDark ? toRgba('#f59e0b', 0.30) : '#FCD34D',
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: SPACING.lg,
    },
    passwordBannerText: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.isDark ? opts.colors.text : '#92400E',
      lineHeight: 20,
    },

    passwordStrengthCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: opts.colors.border,
      backgroundColor: opts.colors.surface,
      padding: 14,
      marginBottom: SPACING.lg,
    },
    passwordStrengthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    passwordStrengthLabel: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.text,
      fontWeight: '700',
    },
    passwordStrengthValue: {
      ...TYPOGRAPHY.bodySmall,
      fontWeight: '800',
    },
    passwordStrengthWeak: { color: '#b91c1c' },
    passwordStrengthFair: { color: '#b45309' },
    passwordStrengthGood: { color: '#0369a1' },
    passwordStrengthStrong: { color: '#166534' },
    passwordStrengthBar: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    passwordStrengthSegment: {
      flex: 1,
      height: 8,
      borderRadius: 6,
    },
    passwordStrengthSegmentEmpty: {
      backgroundColor: opts.isDark ? toRgba('#ffffff', 0.10) : '#e5e7eb',
    },
    passwordStrengthSegmentWeak: { backgroundColor: '#ef4444' },
    passwordStrengthSegmentFair: { backgroundColor: '#f59e0b' },
    passwordStrengthSegmentGood: { backgroundColor: '#3b82f6' },
    passwordStrengthSegmentStrong: { backgroundColor: '#22c55e' },
    passwordReqList: {
      gap: 8,
    },
    passwordReqRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    passwordReqText: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.textSecondary,
      lineHeight: 18,
      flex: 1,
    },
    primaryActionBtn: {
      height: 56,
      borderRadius: 18,
      backgroundColor: opts.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 3,
    },
    primaryActionBtnPressed: {
      opacity: 0.9,
    },
    primaryActionBtnDisabled: {
      opacity: 0.75,
    },
    primaryActionBtnDisabledSoft: {
      backgroundColor: toRgba(opts.primary, 0.45),
    },
    primaryActionBtnDisabledHard: {
      backgroundColor: opts.isDark ? '#334155' : '#94a3b8',
      shadowOpacity: 0,
      elevation: 0,
    },
    primaryActionText: {
      ...TYPOGRAPHY.buttonText,
      color: COLORS.common.white,
    },
    primaryActionTextDisabled: {
      color: toRgba(COLORS.common.white, 0.92),
    },

    aboutBodyText: {
      ...TYPOGRAPHY.bodyNormal,
      color: opts.colors.textSecondary,
      lineHeight: 22,
      marginBottom: SPACING.lg,
    },
    faqRow: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: opts.colors.border,
    },
    faqRowTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    faqQ: {
      ...TYPOGRAPHY.bodyNormal,
      color: opts.colors.text,
      fontWeight: '800',
      flex: 1,
    },
    faqA: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.textSecondary,
      lineHeight: 20,
      marginTop: SPACING.sm,
    },
    aboutLegalText: {
      ...TYPOGRAPHY.bodySmall,
      color: opts.colors.textSecondary,
      lineHeight: 20,
      marginBottom: SPACING.lg,
    },
    aboutLegalActionsRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 6,
    },

    supportWrap: {
      marginTop: SPACING.lg,
      alignItems: 'center',
    },
    supportLabel: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
      marginBottom: SPACING.xs,
    },
    supportEmailBtn: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      borderRadius: RADIUS.full,
      borderWidth: 2,
      borderColor: opts.colors.border,
      backgroundColor: opts.colors.surface,
    },
    supportEmailText: {
      ...TYPOGRAPHY.bodyNormal,
      fontWeight: '800',
      color: opts.primary,
    },
    aboutSecondaryBtn: {
      flex: 1,
      height: 50,
      borderRadius: 16,
      backgroundColor: opts.colors.surface,
      borderWidth: 2,
      borderColor: opts.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aboutSecondaryBtnPressed: {
      opacity: 0.85,
    },
    aboutSecondaryBtnText: {
      ...TYPOGRAPHY.buttonText,
      color: opts.colors.text,
      fontWeight: '800',
    },
    aboutActionBtn: {
      height: 52,
      borderRadius: 16,
      backgroundColor: opts.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aboutActionBtnPressed: {
      opacity: 0.9,
    },
    aboutActionText: {
      ...TYPOGRAPHY.buttonText,
      color: COLORS.common.white,
      fontWeight: '800',
    },
  });
};
