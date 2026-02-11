import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

import {
  exportDatabaseDumpV1,
  type BackupDbDumpV1 as DbDump,
  listAllReceiptImagesForBackup,
} from '@/services/database';

import type { BackupCategoryId, BackupFileBlob, BackupPayloadV1, BackupType } from './types';
import { checksumSha256Hex } from './crypto';

const APP_NAME = 'ReceiptStacker' as const;

const isTruthy = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

const normalizeFilePath = (uri: string) => (uri.startsWith('file://') ? uri.replace('file://', '') : uri);

const readFileAsBase64Safe = async (absolutePath: string): Promise<string | null> => {
  try {
    const exists = await RNFS.exists(absolutePath);
    if (!exists) return null;
    return await RNFS.readFile(absolutePath, 'base64');
  } catch {
    return null;
  }
};

const pickCategories = (backupType: BackupType, selected: Array<{ id: BackupCategoryId; included: boolean }>) => {
  if (backupType === 'full') {
    return selected.map((c) => ({ ...c, included: true }));
  }
  return selected;
};

export const gatherBackupPayloadV1 = async (params: {
  backupType: BackupType;
  categories: Array<{ id: BackupCategoryId; included: boolean }>;
  includeFiles: boolean;
}): Promise<BackupPayloadV1> => {
  const categories = pickCategories(params.backupType, params.categories);
  const included = new Set(categories.filter(c => c.included).map(c => c.id));

  // Storage dump: include all ReceiptStacker-owned keys plus auth/account.
  const allKeys = await AsyncStorage.getAllKeys();
  const includeKey = (k: string) =>
    k.startsWith('receiptstacker.') ||
    k === 'receiptstacker.activeUserId' ||
    k === 'receiptstacker.lastBackupAt' ||
    k === '@settings' ||
    k === '@user_profile' ||
    k === '@user' ||
    k === '@auth_token' ||
    k === '@local_account' ||
    k === 'biometricsEnabled' ||
    k === 'receiptstacker.tour.completed' ||
    k === 'receiptstacker.tour.stage';

  const keys = allKeys.filter(includeKey);
  const pairs = await AsyncStorage.multiGet(keys);
  const entries: Array<[string, string]> = pairs.filter(([, v]) => isTruthy(v)) as Array<[string, string]>;

  // DB dump.
  const db: DbDump = await exportDatabaseDumpV1({
    includeReceipts: included.has('scannedReceipts'),
    includeBudgets: included.has('budgets'),
    includeCategories: included.has('categories'),
    includeWarranty: included.has('warranty'),
  });

  const files: BackupFileBlob[] = [];

  if (params.includeFiles) {
    // Receipt images (from DB).
    if (included.has('scannedReceipts')) {
      const imgs = await listAllReceiptImagesForBackup();
      for (const img of imgs) {
        const p = normalizeFilePath(String(img.filePath ?? ''));
        if (!p) continue;
        const b64 = await readFileAsBase64Safe(p);
        if (!b64) continue;

        files.push({
          path: `receipt_images/${img.id}`,
          base64: b64,
          mime: 'image/jpeg',
        });
      }
    }

    // Reports files (PDF/CSV/etc) referenced from AsyncStorage reports store.
    if (included.has('reports')) {
      const reportKey = entries.map(([k]) => k).find(k => k.includes('receiptstacker.reports'));
      if (reportKey) {
        const raw = entries.find(([k]) => k === reportKey)?.[1] ?? '';
        try {
          const parsed = JSON.parse(raw) as any;
          const list = Array.isArray(parsed?.reports) ? parsed.reports : [];
          for (const r of list) {
            const filePath = typeof r?.filePath === 'string' ? normalizeFilePath(r.filePath) : '';
            if (!filePath) continue;
            const b64 = await readFileAsBase64Safe(filePath);
            if (!b64) continue;
            const name = typeof r?.id === 'string' ? r.id : String(Date.now());
            files.push({ path: `reports/${name}`, base64: b64, mime: 'application/octet-stream' });
          }
        } catch {
          // ignore
        }
      }
    }
  }

  const exportedAtIso = new Date().toISOString();

  const payloadNoChecksum: Omit<BackupPayloadV1, 'checksumSha256'> = {
    app: APP_NAME,
    version: 1,
    exportedAtIso,
    platform: Platform.OS,
    backupType: params.backupType,
    encrypted: false,
    categories,
    storage: { entries },
    db,
    files,
  };

  const checksumSha256 = checksumSha256Hex(JSON.stringify(payloadNoChecksum));

  return {
    ...payloadNoChecksum,
    checksumSha256,
  };
};
