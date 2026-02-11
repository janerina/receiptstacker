import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { GOOGLE_DRIVE_IOS_CLIENT_ID, GOOGLE_DRIVE_WEB_CLIENT_ID, isGoogleDriveConfigured } from './googleDriveConfig';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

const BACKUP_FOLDER_NAME = 'ReceiptStacker Backups' as const;
const DRIVE_FOLDER_ID_KEY = 'receiptstacker.googleDrive.backupFolderId.v1' as const;

export interface DriveFile {
  id: string;
  name: string;
  size?: string;
  modifiedTime?: string;
}

let configured = false;

export const initGoogleDrive = (): void => {
  if (configured) return;
  configured = true;

  if (!isGoogleDriveConfigured()) return;

  GoogleSignin.configure({
    scopes: ['https://www.googleapis.com/auth/drive.file'],
    webClientId: GOOGLE_DRIVE_WEB_CLIENT_ID,
    ...(Platform.OS === 'ios' && GOOGLE_DRIVE_IOS_CLIENT_ID
      ? {
          iosClientId: GOOGLE_DRIVE_IOS_CLIENT_ID,
        }
      : null),
    // We don't request offlineAccess here (no backend exchange in this app).
    offlineAccess: false,
    forceCodeForRefreshToken: false,
  });
};

const requireConfigured = () => {
  if (!isGoogleDriveConfigured()) {
    throw new Error('Google Drive is not configured for this build.');
  }
};

const getAccessToken = async (): Promise<string> => {
  requireConfigured();

  const currentUser = await GoogleSignin.getCurrentUser();
  if (!currentUser) throw new Error('Please connect Google Drive first.');

  const tokens = await GoogleSignin.getTokens();
  if (!tokens?.accessToken) throw new Error('Unable to obtain Google access token.');
  return tokens.accessToken;
};

export const isDriveSignedIn = async (): Promise<boolean> => {
  if (!isGoogleDriveConfigured()) return false;
  try {
    const currentUser = await GoogleSignin.getCurrentUser();
    return Boolean(currentUser);
  } catch {
    return false;
  }
};

export const connectDrive = async (): Promise<{ email?: string; userId?: string }> => {
  requireConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = (await GoogleSignin.signIn()) as any;
  const user = response?.user ?? response?.data?.user ?? response;
  return { email: user?.email, userId: user?.id };
};

export const disconnectDrive = async (): Promise<void> => {
  if (!isGoogleDriveConfigured()) return;
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore
  }
};

const driveFetchJson = async <T>(url: string, init: RequestInit = {}): Promise<T> => {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Google Drive request failed (${res.status})`);
  }
  return (await res.json()) as T;
};

const driveFetchNoJson = async (url: string, init: RequestInit = {}): Promise<void> => {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Google Drive request failed (${res.status})`);
  }
};

const getOrCreateBackupFolderId = async (): Promise<string> => {
  // Lazy storage via AsyncStorage to avoid extra dependencies.
  // Import locally so this module doesn't become a heavy dependency for non-cloud flows.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AsyncStorage = require('@react-native-async-storage/async-storage').default as typeof import('@react-native-async-storage/async-storage').default;

  const cached = await AsyncStorage.getItem(DRIVE_FOLDER_ID_KEY);
  if (cached) return cached;

  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${BACKUP_FOLDER_NAME.replace(/'/g, "\\'")}' and trashed=false`,
  );

  const list = await driveFetchJson<{ files: Array<{ id: string; name: string }> }>(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name)&pageSize=10`,
  );

  const existing = list.files?.[0]?.id;
  if (existing) {
    await AsyncStorage.setItem(DRIVE_FOLDER_ID_KEY, existing);
    return existing;
  }

  const created = await driveFetchJson<{ id: string }>(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  await AsyncStorage.setItem(DRIVE_FOLDER_ID_KEY, created.id);
  return created.id;
};

export const listDriveBackups = async (): Promise<DriveFile[]> => {
  const folderId = await getOrCreateBackupFolderId();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const data = await driveFetchJson<{ files: DriveFile[] }>(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,size,modifiedTime)&orderBy=modifiedTime desc&pageSize=50`,
  );
  return Array.isArray(data.files) ? data.files : [];
};

export const deleteDriveBackup = async (fileId: string): Promise<void> => {
  await driveFetchNoJson(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
  });
};

export const enforceDriveBackupRetention = async (retainCount: number): Promise<void> => {
  const keep = Number.isFinite(retainCount) ? Math.max(0, Math.floor(retainCount)) : 0;
  if (keep <= 0) return;

  const files = await listDriveBackups();
  if (files.length <= keep) return;

  const toDelete = files.slice(keep);
  for (const f of toDelete) {
    try {
      await deleteDriveBackup(f.id);
    } catch {
      // best-effort
    }
  }
};

export const uploadBackupToDrive = async (params: {
  localFilePath: string;
  filename: string;
}): Promise<{ fileId: string }> => {
  const folderId = await getOrCreateBackupFolderId();
  const token = await getAccessToken();

  // 1) Create a resumable upload session.
  const sessionRes = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/octet-stream',
    },
    body: JSON.stringify({
      name: params.filename,
      parents: [folderId],
    }),
  });

  if (!sessionRes.ok) {
    const text = await sessionRes.text().catch(() => '');
    throw new Error(text || `Google Drive upload session failed (${sessionRes.status})`);
  }

  const uploadUrl = sessionRes.headers.get('Location');
  if (!uploadUrl) throw new Error('Google Drive did not provide an upload URL.');

  // 2) PUT the raw file bytes to the resumable session URL.
  const result = await RNFS.uploadFiles({
    toUrl: uploadUrl,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    binaryStreamOnly: true,
    files: [
      {
        name: 'file',
        filename: params.filename,
        filepath: params.localFilePath,
        filetype: 'application/octet-stream',
      },
    ],
  }).promise;

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(`Google Drive upload failed (${result.statusCode})`);
  }

  try {
    const parsed = JSON.parse(result.body ?? '{}') as { id?: string };
    if (parsed.id) return { fileId: parsed.id };
  } catch {
    // ignore
  }

  // If Drive didn't return JSON for some reason, fall back to listing.
  const files = await listDriveBackups();
  const match = files.find((f) => f.name === params.filename);
  if (!match) throw new Error('Upload completed but file ID could not be determined.');
  return { fileId: match.id };
};

export const downloadDriveBackup = async (params: {
  fileId: string;
  destPath: string;
}): Promise<void> => {
  const token = await getAccessToken();

  await RNFS.mkdir(params.destPath.substring(0, params.destPath.lastIndexOf('/'))).catch(() => null);

  const url = `${DRIVE_API}/files/${encodeURIComponent(params.fileId)}?alt=media`;
  const res = await RNFS.downloadFile({
    fromUrl: url,
    toFile: params.destPath,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).promise;

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`Google Drive download failed (${res.statusCode})`);
  }
};
