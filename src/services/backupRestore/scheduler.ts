import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundFetch, { type HeadlessEvent } from 'react-native-background-fetch';
import * as Keychain from 'react-native-keychain';

import { createBackup, defaultBackupCategories } from './index';
import type { BackupCategoryId, BackupStorageLocation, BackupType, Destination, EncryptionMode } from './types';
import { enforceBackupRetention } from './files';
import { enforceDriveBackupRetention } from './googleDrive';

const SCHEDULE_KEY = 'receiptstacker.backupSchedule.v1' as const;
const LAST_RUN_KEY = 'receiptstacker.backupSchedule.lastRunAtMs.v1' as const;
const LAST_OPTIONS_KEY = 'receiptstacker.backupSchedule.lastOptions.v1' as const;
const SCHEDULE_PASSWORD_SERVICE = 'receiptstacker.backupSchedule.password.v1' as const;

export type BackupScheduleFrequency = 'daily' | 'weekly' | 'monthly';
export type BackupRetentionCount = 1 | 3 | 5 | 10;

export interface BackupScheduleConfig {
  enabled: boolean;
  frequency: BackupScheduleFrequency;
  retentionCount: BackupRetentionCount;
}

export interface ScheduledBackupOptions {
  backupType: BackupType;
  categories: Array<{ id: BackupCategoryId; included: boolean }>;
  encryption: EncryptionMode;
  useStoredPassword?: boolean;
  destination: Destination;
  storageLocation?: BackupStorageLocation;
}

export const setScheduledBackupPassword = async (password: string): Promise<void> => {
  await Keychain.setGenericPassword('backup', password, {
    service: SCHEDULE_PASSWORD_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
  });
};

export const clearScheduledBackupPassword = async (): Promise<void> => {
  try {
    await Keychain.resetGenericPassword({ service: SCHEDULE_PASSWORD_SERVICE });
  } catch {
    // ignore
  }
};

const getScheduledBackupPassword = async (): Promise<string | null> => {
  try {
    const creds = await Keychain.getGenericPassword({ service: SCHEDULE_PASSWORD_SERVICE });
    if (!creds) return null;
    return typeof creds.password === 'string' ? creds.password : null;
  } catch {
    return null;
  }
};

export const isBackupDue = (params: {
  nowMs: number;
  lastRunAtMs: number | null;
  frequency: BackupScheduleFrequency;
}): boolean => {
  if (!params.lastRunAtMs) return true;

  const now = new Date(params.nowMs);
  const last = new Date(params.lastRunAtMs);

  if (params.frequency === 'daily') {
    // Once per local day.
    return (
      now.getFullYear() !== last.getFullYear() ||
      now.getMonth() !== last.getMonth() ||
      now.getDate() !== last.getDate()
    );
  }

  if (params.frequency === 'weekly') {
    // Once per ISO week (Mon-based) to avoid multiple runs within the same week.
    const isoWeekKey = (d: Date) => {
      const date = new Date(d.getTime());
      date.setHours(0, 0, 0, 0);
      // Thursday in current week decides the year.
      date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
      const week1 = new Date(date.getFullYear(), 0, 4);
      return (
        date.getFullYear() +
        '-' +
        String(
          1 +
            Math.round(
              ((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
            ),
        ).padStart(2, '0')
      );
    };

    return isoWeekKey(now) !== isoWeekKey(last);
  }

  if (params.frequency === 'monthly') {
    return now.getFullYear() !== last.getFullYear() || now.getMonth() !== last.getMonth();
  }

  return false;
};

export const getBackupScheduleConfig = async (): Promise<BackupScheduleConfig> => {
  const raw = await AsyncStorage.getItem(SCHEDULE_KEY);
  if (!raw) {
    return { enabled: false, frequency: 'weekly', retentionCount: 3 };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<BackupScheduleConfig>;
    const enabled = Boolean(parsed.enabled);
    const frequency = (parsed.frequency ?? 'weekly') as BackupScheduleFrequency;
    const retentionCount = (parsed.retentionCount ?? 3) as BackupRetentionCount;
    if (!['daily', 'weekly', 'monthly'].includes(frequency)) throw new Error('invalid');
    if (![1, 3, 5, 10].includes(retentionCount)) throw new Error('invalid');
    return { enabled, frequency, retentionCount };
  } catch {
    return { enabled: false, frequency: 'weekly', retentionCount: 3 };
  }
};

export const setBackupScheduleConfig = async (config: BackupScheduleConfig): Promise<void> => {
  await AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(config));

  if (config.enabled) {
    await configureBackgroundFetch();
  } else {
    await stopBackgroundFetch();
  }
};

export const saveScheduledBackupOptions = async (options: ScheduledBackupOptions): Promise<void> => {
  await AsyncStorage.setItem(LAST_OPTIONS_KEY, JSON.stringify(options));
};

export const getScheduledBackupOptions = async (): Promise<ScheduledBackupOptions> => {
  const raw = await AsyncStorage.getItem(LAST_OPTIONS_KEY);
  if (!raw) {
    return {
      backupType: 'full',
      categories: defaultBackupCategories(),
      encryption: 'plain',
      destination: 'local',
    };
  }

  try {
    const parsed = JSON.parse(raw) as ScheduledBackupOptions;
    const categories = Array.isArray(parsed.categories) ? parsed.categories : defaultBackupCategories();
    return {
      backupType: parsed.backupType === 'selective' ? 'selective' : 'full',
      categories,
      encryption: parsed.encryption === 'encrypted' ? 'encrypted' : 'plain',
      useStoredPassword: Boolean((parsed as any).useStoredPassword),
      destination: parsed.destination === 'cloud' || parsed.destination === 'share' ? parsed.destination : 'local',
      storageLocation: parsed.storageLocation,
    };
  } catch {
    return {
      backupType: 'full',
      categories: defaultBackupCategories(),
      encryption: 'plain',
      destination: 'local',
    };
  }
};

export const runScheduledBackupIfDue = async (): Promise<void> => {
  const config = await getBackupScheduleConfig();
  if (!config.enabled) return;

  // Best-effort time window (BackgroundFetch can't guarantee an exact time).
  // Match the UI copy: run around 2:00 AM local time.
  const nowLocal = new Date();
  const hour = nowLocal.getHours();
  const inWindow = hour >= 2 && hour < 6;
  if (!inWindow) return;

  if (config.frequency === 'weekly' && nowLocal.getDay() !== 0) {
    // Sunday
    return;
  }
  if (config.frequency === 'monthly' && nowLocal.getDate() !== 1) {
    // 1st of the month
    return;
  }

  const lastRunRaw = await AsyncStorage.getItem(LAST_RUN_KEY);
  const lastRunAtMs = lastRunRaw ? Number(lastRunRaw) : null;

  if (
    !isBackupDue({
      nowMs: Date.now(),
      lastRunAtMs: Number.isFinite(lastRunAtMs as any) ? (lastRunAtMs as number) : null,
      frequency: config.frequency,
    })
  ) {
    return;
  }

  const options = await getScheduledBackupOptions();

  const password = options.encryption === 'encrypted' && options.useStoredPassword ? await getScheduledBackupPassword() : null;

  // Do not require encryption for scheduled backups unless already configured.
  if (options.encryption === 'encrypted' && !password) {
    // Skip silently: we cannot prompt in background.
    return;
  }

  await createBackup({
    backupType: options.backupType,
    categories: options.categories,
    encryption: options.encryption,
    password: password ?? undefined,
    destination: options.destination === 'share' ? 'local' : options.destination,
    storageLocation: options.storageLocation,
  });

  // Enforce retention best-effort.
  await enforceBackupRetention(config.retentionCount);
  if (options.destination === 'cloud') {
    await enforceDriveBackupRetention(config.retentionCount);
  }

  await AsyncStorage.setItem(LAST_RUN_KEY, String(Date.now()));
};

export const configureBackgroundFetch = async (): Promise<void> => {
  // Avoid repeated configuration if already enabled.
  const status = await BackgroundFetch.status();
  if (status === BackgroundFetch.STATUS_RESTRICTED || status === BackgroundFetch.STATUS_DENIED) {
    return;
  }

  await BackgroundFetch.configure(
    {
      minimumFetchInterval: 15,
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,
      requiredNetworkType: BackgroundFetch.NETWORK_TYPE_NONE,
    },
    async (taskId: string) => {
      try {
        await runScheduledBackupIfDue();
      } finally {
        BackgroundFetch.finish(taskId);
      }
    },
    async (taskId: string) => {
      BackgroundFetch.finish(taskId);
    },
  );

  await BackgroundFetch.start();
};

export const stopBackgroundFetch = async (): Promise<void> => {
  try {
    await BackgroundFetch.stop();
  } catch {
    // ignore
  }
};

export const backupFetchHeadlessTask = async (event: HeadlessEvent) => {
  const { taskId } = event;
  try {
    await runScheduledBackupIfDue();
  } finally {
    BackgroundFetch.finish(taskId);
  }
};
