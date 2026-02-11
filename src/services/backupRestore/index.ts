import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Share from 'react-native-share';
import DocumentPicker from 'react-native-document-picker';

import {
  compressJsonToEnvelope,
  decompressEnvelopeToJson,
  decryptEnvelopeToPayload,
  encryptPayloadToEnvelope,
  checksumSha256Hex,
} from './crypto';
import type {
  BackupEnvelopeV1,
  BackupPayloadV1,
  BackupType,
  BackupCategoryId,
  EncryptionMode,
  Destination,
  BackupStorageLocation,
} from './types';
import { gatherBackupPayloadV1 } from './data';
import { getInAppBackupDir, getUninstallSafeBackupDir, listBackupsInDir, readUtf8File, writeUtf8File } from './files';
import { restoreDatabaseDumpV1, restoreReceiptImagesFromBackupFiles, restoreReportsFromBackupFiles } from '@/services/database';

const LAST_BACKUP_AT_KEY = 'receiptstacker.lastBackupAt' as const;

const normalizeFilePath = (uri: string) => (uri.startsWith('file://') ? uri.replace('file://', '') : uri);

export const defaultBackupCategories = (): Array<{ id: BackupCategoryId; included: boolean }> => [
  { id: 'scannedReceipts', included: true },
  { id: 'manualReceipts', included: true },
  { id: 'miscSpend', included: true },
  { id: 'reports', included: true },
  { id: 'warranty', included: true },
  { id: 'categories', included: true },
  { id: 'budgets', included: true },
  { id: 'settings', included: true },
  { id: 'accounts', included: true },
];

export const generateBackupFilename = (backupType: BackupType, encrypted: boolean): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const prefix = 'receiptstacker';
  const typeStr = backupType === 'full' ? 'full' : 'selective';
  const encStr = encrypted ? 'encrypted' : 'plain';
  return `${prefix}_${typeStr}_${encStr}_${timestamp}.rsb`;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const createBackup = async (params: {
  backupType: BackupType;
  categories: Array<{ id: BackupCategoryId; included: boolean }>;
  encryption: EncryptionMode;
  password?: string;
  destination: Destination;
  storageLocation?: BackupStorageLocation;
}): Promise<{ filename: string; filePath: string; sizeBytes: number }> => {
  const wantEncrypted = params.encryption === 'encrypted';

  const payload = await gatherBackupPayloadV1({
    backupType: params.backupType,
    categories: params.categories,
    includeFiles: true,
  });

  const payloadWithEnc: BackupPayloadV1 = {
    ...payload,
    encrypted: wantEncrypted,
  };

  let envelope: BackupEnvelopeV1;

  // Always compress the payload before optional encryption.
  const compressed = compressJsonToEnvelope(payloadWithEnc);
  if (wantEncrypted) {
    if (!params.password) throw new Error('Password is required for encrypted backups.');
    const encrypted = encryptPayloadToEnvelope(decompressEnvelopeToJson(compressed), params.password);
    envelope = { kind: 'encrypted', encrypted };
  } else {
    envelope = { kind: 'compressed', compressed };
  }

  const filename = generateBackupFilename(params.backupType, wantEncrypted);
  const json = JSON.stringify(envelope, null, 2);

  // Destination implementation:
  // - local: write to uninstall-safe dir on Android, otherwise in-app dir.
  // - cloud/share: write to temp in-app dir then open share sheet.
  const inAppDir = getInAppBackupDir();
  const uninstallSafeDir = getUninstallSafeBackupDir();

  const localDir = (() => {
    if (params.storageLocation === 'inApp') return inAppDir;
    if (params.storageLocation === 'uninstallSafe') return uninstallSafeDir ?? inAppDir;
    return Platform.OS === 'android' ? uninstallSafeDir ?? inAppDir : inAppDir;
  })();
  if (!localDir) throw new Error('Backup directory is not available.');

  const filePath = await writeUtf8File(localDir, filename, json);

  // For cloud/share, use share sheet (user chooses Drive/OneDrive/etc).
  if (params.destination === 'cloud' || params.destination === 'share') {
    const url = Platform.OS === 'ios' ? filePath : `file://${filePath}`;
    await Share.open({
      title: 'ReceiptStacker Backup',
      url,
      type: 'application/json',
      filename,
      failOnCancel: false,
      ...(Platform.OS === 'ios' ? { saveToFiles: true } : null),
    });
  }

  await AsyncStorage.setItem(LAST_BACKUP_AT_KEY, payload.exportedAtIso);

  return { filename, filePath, sizeBytes: json.length };
};

export const pickBackupFile = async (): Promise<{ path: string; name: string }> => {
  const picked = await DocumentPicker.pickSingle({
    type: [DocumentPicker.types.allFiles],
    copyTo: 'cachesDirectory',
    presentationStyle: 'fullScreen',
  } as any);

  const uri: string | undefined = (picked as any).fileCopyUri ?? (picked as any).uri;
  if (!uri) throw new Error('Unable to read the selected file.');
  return { path: normalizeFilePath(uri), name: String((picked as any).name ?? 'backup.rsb') };
};

const parseEnvelope = (raw: string): BackupEnvelopeV1 => {
  const parsed = JSON.parse(raw) as BackupEnvelopeV1;
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid backup file format.');
  if ((parsed as any).kind !== 'plain' && (parsed as any).kind !== 'compressed' && (parsed as any).kind !== 'encrypted') {
    throw new Error('Invalid backup file format.');
  }
  return parsed;
};

export const decodeEnvelopeToPayload = (env: BackupEnvelopeV1, password?: string): BackupPayloadV1 => {
  if (env.kind === 'plain') return env.payload;
  if (env.kind === 'compressed') return decompressEnvelopeToJson(env.compressed);
  if (env.kind === 'encrypted') {
    if (!password) throw new Error('Password required for encrypted backup.');
    return decryptEnvelopeToPayload(env.encrypted, password);
  }
  throw new Error('Unsupported backup format.');
};

export const validatePayload = (payload: BackupPayloadV1): void => {
  if (payload.app !== 'ReceiptStacker' || payload.version !== 1) throw new Error('Invalid backup file.');

  const { checksumSha256, ...rest } = payload as any;
  const calc = checksumSha256Hex(JSON.stringify(rest));
  if (calc !== checksumSha256) throw new Error('Backup file checksum mismatch (corrupted).');
};

export const restoreFromBackupFile = async (params: { filePath: string; password?: string }): Promise<BackupPayloadV1> => {
  const raw = await readUtf8File(params.filePath);
  const env = parseEnvelope(raw);
  const payload = decodeEnvelopeToPayload(env, params.password);
  validatePayload(payload);

  // Restore: AsyncStorage
  if (payload.storage?.entries?.length) {
    // Overwrite current keys with backup values.
    await AsyncStorage.multiSet(payload.storage.entries);
  }

  // Restore DB tables.
  await restoreDatabaseDumpV1(payload.db);

  // Restore files.
  await restoreReceiptImagesFromBackupFiles(payload.files);
  await restoreReportsFromBackupFiles(payload.storage.entries, payload.files);

  await AsyncStorage.setItem(LAST_BACKUP_AT_KEY, payload.exportedAtIso);

  return payload;
};

export const listInAppBackups = async () => {
  return await listBackupsInDir(getInAppBackupDir());
};

export const listUninstallSafeBackups = async () => {
  return await listBackupsInDir(getUninstallSafeBackupDir());
};
