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
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import ReactNativeBiometrics from 'react-native-biometrics';
import Share from 'react-native-share';
import { generatePDF } from 'react-native-html-to-pdf';
import { useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import { launchImageLibrary } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import DocumentPicker from 'react-native-document-picker';
import Clipboard from '@react-native-clipboard/clipboard';

import { Avatar, Button, Card, Input, Switch } from '@/components/common';
import { Header, LoadingOverlay } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { BottomTabParamList, MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { listReceipts } from '@/utils/receiptStore';
import { emitAuthChanged } from '@/utils/authEvents';
import { useAuth } from '@/contexts';
import { updateLocalPassword, verifyLocalLogin } from '@/services/localAuth';
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

type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD' | 'CHF' | 'CNY' | 'INR' | 'MXN';

const CURRENCIES: Array<{ code: CurrencyCode; symbol: string; name: string }> = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
];

const currencyMeta = (code: CurrencyCode) => CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0];

type Settings = {
  darkMode: boolean;
  notifications: boolean;
  emailPreferences: boolean;
  faceId: boolean;
  budgetAlerts: boolean;
  celebrationMessages: boolean;
  currency: CurrencyCode;
  language: 'EN';
};

const USER_KEY = '@user' as const;
const SETTINGS_KEY = '@settings' as const;
const AUTH_TOKEN_KEY = '@auth_token' as const;
const PROFILE_KEY = '@user_profile' as const;
const LAST_BACKUP_AT_KEY = 'receiptstacker.lastBackupAt' as const;

const APP_VERSION = (require('../../../package.json') as { version?: string }).version ?? '0.0.0';

const BACKUP_KEYS = [
  USER_KEY,
  PROFILE_KEY,
  SETTINGS_KEY,
  'receiptstacker.receipts',
  'receiptstacker.budgets',
  'receiptstacker.categories',
  'receiptstacker.tags',
  'receiptstacker.miscSpend',
  'receiptstacker.miscSpendCategories',
  'receiptstacker.reports',
] as const;

type BackupPayloadV1 = {
  app: 'ReceiptStacker';
  version: 1;
  exportedAt: string;
  keys: Array<(typeof BACKUP_KEYS)[number]>;
  data: Record<string, string | null>;
};

const normalizeFilePath = (uri: string) => (uri.startsWith('file://') ? uri.replace('file://', '') : uri);

const defaultUser: User = {
  name: 'John Doe',
  email: 'john@email.com',
  avatar: null,
};

const defaultSettings = (isDark: boolean): Settings => ({
  darkMode: isDark,
  notifications: true,
  emailPreferences: true,
  faceId: false,
  budgetAlerts: true,
  celebrationMessages: true,
  currency: 'USD',
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
  firstName: 'John',
  lastName: 'Doe',
  phone: '+1 (555) 123-4567',
  address: '123 Main St, San Francisco, CA 94102',
  bio: 'Managing my expenses efficiently with ReceiptStacker',
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

  const [aboutModal, setAboutModal] = useState<null | 'help' | 'privacy' | 'terms'>(null);

  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editBio, setEditBio] = useState('');

  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [currencyAnchor, setCurrencyAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );
  const currencyTriggerRef = useRef<any>(null);

  const [showBackupRestoreModal, setShowBackupRestoreModal] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);

  const styles = useMemo(() => createStyles({ colors, primary, isDark }), [colors, isDark, primary]);

  const loadUserData = useCallback(async () => {
    try {
      const [userRaw, settingsRaw] = await Promise.all([
        AsyncStorage.getItem(USER_KEY),
        AsyncStorage.getItem(SETTINGS_KEY),
      ]);

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
        const currency = (CURRENCIES.some(c => c.code === maybeCurrency) ? maybeCurrency : 'USD') as CurrencyCode;
        const next: Settings = {
          // Theme preference is owned by ThemeContext; keep this UI toggle in sync with current theme.
          darkMode: isDark,
          notifications: typeof parsed.notifications === 'boolean' ? parsed.notifications : true,
          emailPreferences:
            typeof (parsed as any).emailPreferences === 'boolean' ? (parsed as any).emailPreferences : true,
          faceId: typeof parsed.faceId === 'boolean' ? parsed.faceId : false,
          budgetAlerts: typeof (parsed as any).budgetAlerts === 'boolean' ? (parsed as any).budgetAlerts : true,
          celebrationMessages:
            typeof (parsed as any).celebrationMessages === 'boolean' ? (parsed as any).celebrationMessages : true,
          currency,
          language: 'EN',
        };

        setSettings(next);
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

  useEffect(() => {
    loadUserData();
    loadBackupMeta();
  }, [loadUserData]);

  useFocusEffect(
    useCallback(() => {
      loadUserData();
      loadBackupMeta();
    }, [loadUserData]),
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
      await persistSettings({ ...settings, currency: code });
      setShowCurrencyPicker(false);
    },
    [persistSettings, settings],
  );

  const openBackupRestore = useCallback(() => {
    setShowBackupRestoreModal(true);
  }, []);

  const createBackupFile = useCallback(async () => {
    try {
      setBackupBusy(true);

      const pairs = await AsyncStorage.multiGet(Array.from(BACKUP_KEYS));
      const data: Record<string, string | null> = {};
      for (const [k, v] of pairs) data[k] = v ?? null;

      const payload: BackupPayloadV1 = {
        app: 'ReceiptStacker',
        version: 1,
        exportedAt: new Date().toISOString(),
        keys: Array.from(BACKUP_KEYS),
        data,
      };

      const stamp = payload.exportedAt
        .replaceAll(':', '')
        .replaceAll('-', '')
        .replaceAll('.', '')
        .replace('T', '-')
        .replace('Z', '');

      const folder = Platform.OS === 'android' ? RNFS.DownloadDirectoryPath : RNFS.DocumentDirectoryPath;
      const backupDir = `${folder}/ReceiptStacker`;
      const filePath = `${backupDir}/receiptstacker-backup-${stamp}.json`;

      const exists = await RNFS.exists(backupDir);
      if (!exists) await RNFS.mkdir(backupDir);

      await RNFS.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');

      await AsyncStorage.setItem(LAST_BACKUP_AT_KEY, payload.exportedAt);
      setLastBackupAt(payload.exportedAt);

      const url = `file://${filePath}`;
      await Share.open({
        title: 'ReceiptStacker Backup',
        url,
        type: 'application/json',
        failOnCancel: false,
      });
    } catch {
      Alert.alert('Backup Failed', 'Unable to create a backup file.');
    } finally {
      setBackupBusy(false);
    }
  }, []);

  const restoreFromBackup = useCallback(async () => {
    try {
      const picked = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.allFiles],
        copyTo: 'cachesDirectory',
        presentationStyle: 'fullScreen',
      } as any);

      const uri: string | undefined = (picked as any).fileCopyUri ?? (picked as any).uri;
      if (!uri) {
        Alert.alert('Restore Failed', 'Unable to read the selected file.');
        return;
      }

      const path = normalizeFilePath(uri);
      const raw = await RNFS.readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as Partial<BackupPayloadV1>;

      if (parsed?.app !== 'ReceiptStacker' || parsed?.version !== 1 || typeof parsed?.data !== 'object' || !parsed.data) {
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
            onPress: async () => {
              try {
                setBackupBusy(true);

                const entries: Array<[string, string]> = [];
                const removals: string[] = [];

                for (const key of BACKUP_KEYS) {
                  const value = (parsed.data as any)[key];
                  if (typeof value === 'string') entries.push([key, value]);
                  else removals.push(key);
                }

                if (removals.length) await AsyncStorage.multiRemove(removals);
                if (entries.length) await AsyncStorage.multiSet(entries);

                setShowBackupRestoreModal(false);
                await loadUserData();
                await loadBackupMeta();
                Alert.alert('Restore Complete', 'Your data has been restored. Some screens may need to be reopened to refresh.');
              } catch {
                Alert.alert('Restore Failed', 'Unable to restore from this backup.');
              } finally {
                setBackupBusy(false);
              }
            },
          },
        ],
      );
    } catch (e) {
      if ((DocumentPicker as any).isCancel?.(e)) return;
      Alert.alert('Restore Failed', 'Unable to select a backup file.');
    }
  }, [loadBackupMeta, loadUserData]);

  const handleFaceIdToggle = useCallback(
    async (value: boolean) => {
      if (value) {
        try {
          setLoading(true);

          const biometrics = new ReactNativeBiometrics();
          const { available } = await biometrics.isSensorAvailable();
          if (!available) {
            Alert.alert('Not Available', 'Biometric authentication is not available on this device');
            return;
          }

          const { success } = await biometrics.simplePrompt({
            promptMessage: 'Authenticate to enable biometrics',
          });

          if (success) {
            await persistSettings({ ...settings, faceId: true });
          }
        } catch {
          Alert.alert('Error', 'Failed to enable biometrics');
        } finally {
          setLoading(false);
        }
      } else {
        await persistSettings({ ...settings, faceId: false });
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

      const rawProfile = await AsyncStorage.getItem(PROFILE_KEY);
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
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
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
  }, [navigation]);

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
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="smartphone" size={ICON_SIZES.sm} color={colors.text} />}
            label="Manage security settings"
            subtitle="Passcode, device security"
            onPress={() => Alert.alert('Security', 'Security settings are coming soon.')}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
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
            icon={<Feather name="credit-card" size={ICON_SIZES.sm} color={colors.text} />}
            label="Currency"
            subtitle={currencyMeta(settings.currency).name}
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
                    {currencyMeta(settings.currency).symbol} {settings.currency}
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

            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
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
            </ScrollView>
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
          const popupWidth = 220;
          const popupMaxHeight = Math.min(360, Math.max(220, window.height * 0.42));
          const anchor = currencyAnchor;

          const left = anchor
            ? Math.max(16, Math.min(window.width - popupWidth - 16, anchor.x + anchor.width - popupWidth))
            : Math.max(16, (window.width - popupWidth) / 2);

          const top = anchor
            ? Math.max(80, Math.min(window.height - popupMaxHeight - 24, anchor.y + anchor.height + 10))
            : Math.max(120, (window.height - popupMaxHeight) / 2);

          return (
            <View style={[styles.currencyPopup, { width: popupWidth, maxHeight: popupMaxHeight, left, top }]}>
              <ScrollView showsVerticalScrollIndicator>
                {CURRENCIES.map(c => {
                  const selected = c.code === settings.currency;
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
                      <Text style={[styles.currencyOptionText, selected ? styles.currencyOptionTextSelected : null]}>
                        {c.symbol} {c.code}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          );
        })()}
      </Modal>

      {/* Backup & Restore Modal (matches Screen 2/3) */}
      <Modal
        isVisible={showBackupRestoreModal}
        onBackdropPress={() => setShowBackupRestoreModal(false)}
        onBackButtonPress={() => setShowBackupRestoreModal(false)}
        backdropOpacity={0.35}
        style={styles.modal}
        avoidKeyboard
      >
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.modalKbWrap}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>Backup & Restore</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={() => setShowBackupRestoreModal(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.modalClosePressed]}
              >
                <Feather name="x" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.backupContent} showsVerticalScrollIndicator={false}>
              <View style={styles.backupTopIconWrap}>
                <View style={styles.backupTopIconCircle}>
                  <Feather name="hard-drive" size={34} color={COLORS.common.white} />
                </View>
              </View>

              <View style={styles.backupInfoBanner}>
                <Text style={styles.backupInfoText}>
                  Keep your data safe by creating regular backups. You can restore your data anytime from a backup file.
                </Text>
                {lastBackupAt ? (
                  <Text style={styles.backupInfoMeta}>Last backup: {new Date(lastBackupAt).toLocaleString()}</Text>
                ) : null}
              </View>

              <View style={styles.backupSectionCard}>
                <Text style={styles.backupSectionTitle}>Create Backup</Text>
                <View style={styles.backupSectionDivider} />
                <Text style={styles.backupSectionDesc}>
                  Export all your data including receipts, budgets, categories, and settings to a secure JSON file.
                </Text>

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

              <View style={styles.backupSectionCard}>
                <Text style={styles.backupSectionTitle}>Restore from Backup</Text>
                <View style={styles.backupSectionDivider} />
                <Text style={styles.backupSectionDesc}>
                  Import a previously saved backup file to restore your data.
                </Text>

                <View style={styles.backupWarningBanner}>
                  <View style={styles.backupWarningRow}>
                    <Feather name="alert-triangle" size={18} color="#b45309" />
                    <Text style={styles.backupWarningText}>
                      Warning: Restoring will overwrite your current data. Make sure you have a recent backup before proceeding.
                    </Text>
                  </View>
                </View>

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

              <View style={styles.bestPracticesCard}>
                <View style={styles.bestPracticesHeader}>
                  <View style={styles.bestPracticesIcon}>
                    <Feather name="database" size={18} color="#047857" />
                  </View>
                  <Text style={styles.bestPracticesTitle}>Best Practices</Text>
                </View>
                <View style={styles.bestPracticesList}>
                  <Text style={styles.bestPracticesItem}>• Create backups regularly (weekly recommended)</Text>
                  <Text style={styles.bestPracticesItem}>• Store backup files in a secure location</Text>
                  <Text style={styles.bestPracticesItem}>• Test your backups occasionally</Text>
                  <Text style={styles.bestPracticesItem}>• Keep multiple backup versions</Text>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setShowBackupRestoreModal(false)}
                style={({ pressed }) => [styles.backupCloseBtn, pressed ? styles.backupClosePressed : null]}
              >
                <Text style={styles.backupCloseText}>Close</Text>
              </Pressable>
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

            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
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
            </ScrollView>
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
              <Text style={styles.aboutBodyText}>
                {'Need help using ReceiptStacker?\n\n• Email support: support@receiptstacker.app\n• Tip: Create backups regularly and keep multiple versions\n• Include a screenshot + device model + app version when reporting an issue'}
              </Text>
            ) : null}

            {aboutModal === 'privacy' ? (
              <Text style={styles.aboutLegalText}>{PRIVACY_POLICY_TEXT}</Text>
            ) : null}

            {aboutModal === 'terms' ? (
              <Text style={styles.aboutLegalText}>{TERMS_OF_SERVICE_TEXT}</Text>
            ) : null}

            {aboutModal === 'help' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Contact Support"
                onPress={() => openUrl('mailto:support@receiptstacker.app?subject=ReceiptStacker%20Support')}
                style={({ pressed }) => [styles.aboutActionBtn, pressed ? styles.aboutActionBtnPressed : null]}
              >
                <Text style={styles.aboutActionText}>Contact Support</Text>
              </Pressable>
            ) : null}

            {aboutModal === 'privacy' || aboutModal === 'terms' ? (
              <View style={styles.aboutLegalActionsRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Copy text"
                  onPress={() => {
                    const text = aboutModal === 'privacy' ? PRIVACY_POLICY_TEXT : TERMS_OF_SERVICE_TEXT;
                    Clipboard.setString(text);
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
                    const text = aboutModal === 'privacy' ? PRIVACY_POLICY_TEXT : TERMS_OF_SERVICE_TEXT;
                    try {
                      await Share.open({
                        title: aboutModal === 'privacy' ? 'Privacy Policy' : 'Terms of Service',
                        message: text,
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
    currencyOption: {
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    currencyOptionSelected: {
      backgroundColor: '#e5e7eb',
    },
    currencyOptionPressed: {
      backgroundColor: '#f1f5f9',
    },
    currencyOptionText: {
      ...TYPOGRAPHY.bodyNormal,
      color: opts.colors.text,
      fontWeight: '600',
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

    backupContent: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 20,
      gap: 14,
    },
    backupTopIconWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
      marginBottom: 6,
    },
    backupTopIconCircle: {
      width: 86,
      height: 86,
      borderRadius: 43,
      backgroundColor: '#0891b2',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },

    backupInfoBanner: {
      backgroundColor: '#eff6ff',
      borderColor: '#bfdbfe',
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    backupInfoText: {
      ...TYPOGRAPHY.bodySmall,
      color: '#1e40af',
      lineHeight: 20,
    },
    backupInfoMeta: {
      ...TYPOGRAPHY.caption,
      color: '#1e3a8a',
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

    backupWarningBanner: {
      marginHorizontal: 16,
      marginBottom: 14,
      borderRadius: 14,
      backgroundColor: '#fffbeb',
      borderWidth: 1,
      borderColor: '#fcd34d',
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
      color: '#92400e',
      flex: 1,
      lineHeight: 20,
    },

    bestPracticesCard: {
      backgroundColor: '#ecfdf5',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#bbf7d0',
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
      backgroundColor: '#d1fae5',
      alignItems: 'center',
      justifyContent: 'center',
    },
    bestPracticesTitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: '#065f46',
      fontWeight: '900',
    },
    bestPracticesList: {
      gap: 6,
      paddingLeft: 2,
    },
    bestPracticesItem: {
      ...TYPOGRAPHY.bodySmall,
      color: '#065f46',
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
      backgroundColor: '#FEF3C7',
      borderColor: '#FCD34D',
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: SPACING.lg,
    },
    passwordBannerText: {
      ...TYPOGRAPHY.bodySmall,
      color: '#92400E',
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
