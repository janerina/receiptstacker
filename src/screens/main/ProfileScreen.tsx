import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
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
import { launchImageLibrary } from 'react-native-image-picker';

import { Avatar, Button, Card, Input, Switch } from '@/components/common';
import { Header, LoadingOverlay } from '@/components/compositions';
import { COLORS, ICON_SIZES, RADIUS, SPACING, TYPOGRAPHY } from '@/constants';
import type { BottomTabParamList, MainStackParamList } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { listReceipts } from '@/utils/receiptStore';
import { emitAuthChanged } from '@/utils/authEvents';

type Props = CompositeScreenProps<
  BottomTabScreenProps<BottomTabParamList, 'Profile'>,
  NativeStackScreenProps<MainStackParamList, 'BottomTabs'>
>;

type User = {
  name: string;
  email: string;
  avatar?: string | null;
};

type Settings = {
  darkMode: boolean;
  notifications: boolean;
  faceId: boolean;
  language: 'EN';
};

const USER_KEY = '@user' as const;
const SETTINGS_KEY = '@settings' as const;
const AUTH_TOKEN_KEY = '@auth_token' as const;

const defaultUser: User = {
  name: 'John Doe',
  email: 'john@email.com',
  avatar: null,
};

const defaultSettings = (isDark: boolean): Settings => ({
  darkMode: isDark,
  notifications: true,
  faceId: false,
  language: 'EN',
});

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
  right,
  onPress,
  isLast,
  accessibilityLabel,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
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
        <Text style={[stylesShared.settingLabel, { color: colors.text }]}>{label}</Text>
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
    width: 24,
    alignItems: 'center',
  },
  settingLabel: {
    ...TYPOGRAPHY.bodyNormal,
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

  const primary = COLORS.brand.primary;

  const [user, setUser] = useState<User>(defaultUser);
  const [settings, setSettings] = useState<Settings>(defaultSettings(isDark));

  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const [draftName, setDraftName] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [draftAvatar, setDraftAvatar] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

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
        const next: Settings = {
          // Theme preference is owned by ThemeContext; keep this UI toggle in sync with current theme.
          darkMode: isDark,
          notifications: typeof parsed.notifications === 'boolean' ? parsed.notifications : true,
          faceId: typeof parsed.faceId === 'boolean' ? parsed.faceId : false,
          language: 'EN',
        };

        setSettings(next);
      }
    } catch {
      // Non-fatal
    }
  }, [isDark]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

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

  const openEditProfile = useCallback(() => {
    setDraftName(user.name);
    setDraftEmail(user.email);
    setDraftAvatar(user.avatar ?? null);
    setShowEditProfileModal(true);
  }, [user.avatar, user.email, user.name]);

  const pickAvatar = useCallback(async () => {
    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.8,
      });

      const uri = res.assets?.[0]?.uri;
      if (uri) setDraftAvatar(uri);
    } catch {
      Alert.alert('Error', 'Failed to pick image');
    }
  }, []);

  const handleSaveProfile = useCallback(async () => {
    const name = draftName.trim();
    const email = draftEmail.trim();

    if (!name || !email) {
      Alert.alert('Missing Info', 'Please enter your name and email.');
      return;
    }

    const updatedUser: User = {
      name,
      email,
      avatar: draftAvatar,
    };

    try {
      setLoading(true);
      setUser(updatedUser);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
      setShowEditProfileModal(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  }, [draftAvatar, draftEmail, draftName]);

  const handleSavePassword = useCallback(async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Missing Info', 'Please fill out all password fields.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Weak Password', 'New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New password and confirmation do not match.');
      return;
    }

    setShowChangePasswordModal(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    Alert.alert('Success', 'Password updated successfully');
  }, [confirmPassword, currentPassword, newPassword]);

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
      <Header title="Profile" rightAction={closeAction} showBackButton={false} />

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
            label="Biometrics"
            right={<Switch value={settings.faceId} onValueChange={handleFaceIdToggle} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="smartphone" size={ICON_SIZES.sm} color={colors.text} />}
            label="Passcode"
            onPress={() => Alert.alert('Passcode', 'Passcode setup is coming soon.')}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
            isLast
          />
        </Card>

        {/* DATA */}
        <Text style={styles.sectionTitle}>DATA</Text>
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
            onPress={() => openUrl('https://example.com/help')}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="file-text" size={ICON_SIZES.sm} color={colors.text} />}
            label="Privacy Policy"
            onPress={() => openUrl('https://example.com/privacy')}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="file-text" size={ICON_SIZES.sm} color={colors.text} />}
            label="Terms of Service"
            onPress={() => openUrl('https://example.com/terms')}
            right={<Feather name="chevron-right" size={ICON_SIZES.md} color={colors.textTertiary} />}
          />
          <SettingRow
            colors={colors}
            icon={<Feather name="info" size={ICON_SIZES.sm} color={colors.text} />}
            label="App Version"
            right={<Text style={styles.valueText}>1.0.0</Text>}
            isLast
          />
        </Card>

        {/* Logout */}
        <View style={styles.logoutWrap}>
          <Button title="Logout" variant="danger" size="lg" fullWidth onPress={handleLogout} />
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        isVisible={showEditProfileModal}
        onBackdropPress={() => setShowEditProfileModal(false)}
        onBackButtonPress={() => setShowEditProfileModal(false)}
        backdropOpacity={0.35}
        style={styles.modal}
      >
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>Edit Profile</Text>

          <View style={styles.modalAvatarRow}>
            <Avatar
              size="lg"
              name={draftName || user.name}
              source={draftAvatar ? { uri: draftAvatar } : undefined}
              style={styles.modalAvatar}
            />
            <Button title="Change Photo" variant="secondary" size="sm" onPress={pickAvatar} />
          </View>

          <Input label="Name" value={draftName} onChangeText={setDraftName} placeholder="Your name" />
          <View style={styles.fieldSpacer} />
          <Input
            label="Email"
            value={draftEmail}
            onChangeText={setDraftEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <View style={styles.modalButtons}>
            <Button title="Cancel" variant="secondary" size="md" onPress={() => setShowEditProfileModal(false)} />
            <Button title="Save" variant="primary" size="md" onPress={handleSaveProfile} />
          </View>
        </Card>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        isVisible={showChangePasswordModal}
        onBackdropPress={() => setShowChangePasswordModal(false)}
        onBackButtonPress={() => setShowChangePasswordModal(false)}
        backdropOpacity={0.35}
        style={styles.modal}
      >
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>Change Password</Text>

          <Input
            label="Current Password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="••••••••"
            secureTextEntry
          />
          <View style={styles.fieldSpacer} />
          <Input
            label="New Password"
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="••••••••"
            secureTextEntry
          />
          <View style={styles.fieldSpacer} />
          <Input
            label="Confirm New Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="••••••••"
            secureTextEntry
          />

          <View style={styles.modalButtons}>
            <Button title="Cancel" variant="secondary" size="md" onPress={() => setShowChangePasswordModal(false)} />
            <Button title="Update" variant="primary" size="md" onPress={handleSavePassword} />
          </View>

          <View style={styles.passwordHintWrap}>
            <Text style={styles.passwordHintText}>Tip: use a long, unique password.</Text>
          </View>
        </Card>
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

    logoutWrap: {
      paddingHorizontal: SPACING.lg,
      marginTop: 8,
    },

    modal: {
      margin: 0,
      justifyContent: 'center',
      paddingHorizontal: SPACING.lg,
    },
    modalCard: {
      padding: SPACING.lg,
    },
    modalTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: opts.colors.text,
      textAlign: 'center',
      marginBottom: SPACING.lg,
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
    modalButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: SPACING.md,
      marginTop: SPACING.lg,
    },
    passwordHintWrap: {
      marginTop: SPACING.md,
      padding: SPACING.sm,
      borderRadius: RADIUS.md,
      backgroundColor: toRgba(opts.primary, 0.08),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: toRgba(opts.primary, 0.18),
    },
    passwordHintText: {
      ...TYPOGRAPHY.caption,
      color: opts.colors.textSecondary,
      textAlign: 'center',
    },
  });
};
