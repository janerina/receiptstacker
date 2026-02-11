import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

import type { BackupFileRecord, Destination } from './types';

const BACKUP_HISTORY_KEY = 'receiptstacker.backupHistory.v1' as const;

export const getInAppBackupDir = (): string | null => {
  const base = (RNFS as any)?.DocumentDirectoryPath;
  return typeof base === 'string' && base.length ? `${base}/ReceiptStacker/Backups` : null;
};

export const getUninstallSafeBackupDir = (): string | null => {
  if (Platform.OS !== 'android') return null;
  const downloads = (RNFS as any)?.DownloadDirectoryPath;
  return typeof downloads === 'string' && downloads.length ? `${downloads}/ReceiptStacker/Backups` : null;
};

export const ensureDir = async (dir: string): Promise<void> => {
  const exists = await RNFS.exists(dir);
  if (!exists) await RNFS.mkdir(dir);
};

export const writeUtf8File = async (dir: string, filename: string, contentsUtf8: string): Promise<string> => {
  await ensureDir(dir);
  const path = `${dir}/${filename}`;
  await RNFS.writeFile(path, contentsUtf8, 'utf8');
  return path;
};

export const readUtf8File = async (filePath: string): Promise<string> => {
  return await RNFS.readFile(filePath, 'utf8');
};

export const listBackupsInDir = async (dir: string | null): Promise<BackupFileRecord[]> => {
  if (!dir) return [];
  try {
    const exists = await RNFS.exists(dir);
    if (!exists) return [];

    const entries = await RNFS.readDir(dir);
    const files = entries
      .filter(e => e?.isFile?.() && typeof e.name === 'string' && (e.name.endsWith('.rsb') || e.name.endsWith('.json')))
      .map((e) => {
        const mtimeMs = e.mtime ? new Date(e.mtime).getTime() : 0;
        return {
          id: `${e.path}:${mtimeMs}`,
          filename: e.name,
          createdAtIso: mtimeMs ? new Date(mtimeMs).toISOString() : new Date().toISOString(),
          sizeBytes: typeof e.size === 'number' ? e.size : 0,
          encrypted: e.name.includes('encrypted'),
          backupType: e.name.includes('selective') ? 'selective' : 'full',
          destination: 'local' as Destination,
          filePath: e.path,
        } satisfies BackupFileRecord;
      })
      .sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : -1));

    return files;
  } catch {
    return [];
  }
};

export const backupHistoryKey = BACKUP_HISTORY_KEY;
