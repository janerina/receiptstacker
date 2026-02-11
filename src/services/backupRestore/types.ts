export type BackupType = 'full' | 'selective';
export type EncryptionMode = 'encrypted' | 'plain';
export type Destination = 'local' | 'cloud' | 'share';

export type BackupCategoryId =
  | 'scannedReceipts'
  | 'manualReceipts'
  | 'miscSpend'
  | 'reports'
  | 'warranty'
  | 'categories'
  | 'budgets'
  | 'settings'
  | 'accounts';

export interface BackupCategory {
  id: BackupCategoryId;
  name: string;
  description: string;
  included: boolean;
  dataSizeLabel: string;
  icon: string; // Feather icon name
  colorToken: 'chart';
  colorIndex: number;
}

export interface BackupFileRecord {
  id: string;
  filename: string;
  createdAtIso: string;
  sizeBytes: number;
  encrypted: boolean;
  backupType: BackupType;
  destination: Destination;
  filePath: string; // absolute
}

export interface BackupStorageDump {
  // Key/value pairs from AsyncStorage.
  // Values are the raw string values.
  entries: Array<[string, string]>;
}

export interface BackupDbDumpV1 {
  // Raw table rows as returned from SQLite SELECT *.
  receipts: any[];
  budgets: any[];
  categories: any[];
  tags: any[];
  receipt_tags: any[];
  receipt_items: any[];
  ocr_data: any[];
  receipt_images: any[];
  receipt_parsed: any[];
  warranty_alerts: any[];
  notifications: any[];
}

export interface BackupFileBlob {
  // Logical path within the backup.
  path: string;
  // Base64 payload.
  base64: string;
  // Optional hint.
  mime?: string;
}

export interface BackupPayloadV1 {
  app: 'ReceiptStacker';
  version: 1;
  exportedAtIso: string;
  platform: 'ios' | 'android' | 'web' | 'windows' | 'macos';
  backupType: BackupType;
  encrypted: boolean;
  categories: Array<{ id: BackupCategoryId; included: boolean }>;

  storage: BackupStorageDump;
  db: BackupDbDumpV1;
  files: BackupFileBlob[];

  checksumSha256: string;
}

export interface EncryptedEnvelopeV1 {
  envelopeVersion: 1;
  algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
  createdAtMs: number;
}

export interface CompressedEnvelopeV1 {
  envelopeVersion: 1;
  algorithm: 'GZIP';
  dataB64: string;
}

export type BackupEnvelopeV1 =
  | { kind: 'plain'; payload: BackupPayloadV1 }
  | { kind: 'compressed'; compressed: CompressedEnvelopeV1 }
  | { kind: 'encrypted'; encrypted: EncryptedEnvelopeV1 };
