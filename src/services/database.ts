/*
 * ReceiptStacker SQLite database layer.
 *
 * Uses react-native-sqlite-storage for structured data:
 * - receipts
 * - budgets
 * - categories
 * - tags
 * - receipt_tags
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import SQLite, { type ResultSet, type SQLiteDatabase } from 'react-native-sqlite-storage';

import { COLORS } from '@/constants';

// Enable promise-based API.
SQLite.enablePromise(true);

export interface Receipt {
  id: string;
  documentId?: string;
  merchant: string;
  amount: number;
  date: string; // ISO string
  categoryId: string;
  scanMode?: 'single' | 'multi' | 'long';
  paymentMethod?: string;
  notes?: string;
  imageUri?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptItem {
  id: string;
  receiptId: string;
  itemName: string;
  itemNameNormalized: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  itemConfidence?: number;
  createdAt: string;
}

export interface OcrData {
  id: string;
  receiptId: string;
  originalText: string;
  editedText?: string;
  rawResultJson?: string;
  engine: 'mlkit' | 'tesseract';
  confidence?: number;
  wordCount?: number;
  characterCount?: number;
  createdAt: string;
}

export interface ReceiptImage {
  id: string;
  receiptId: string;
  imageType: 'original' | 'enhanced' | 'thumbnail' | 'part';
  filePath: string;
  partNumber?: number;
  createdAt: string;
}

export interface ScannedReceiptSummary {
  id: string;
  merchant: string;
  amount: number;
  date: string; // ISO string
  categoryId: string;
  categoryName?: string;
  categoryColor?: string;
  categoryIcon?: string;
  tagsCsv?: string;
  imageUri?: string;
  createdAt: string;
  updatedAt: string;
  scanMode?: 'single' | 'multi' | 'long' | null;
  partCount?: number;
  ocrEngine?: 'mlkit' | 'tesseract';
  ocrConfidence?: number;
  ocrWordCount?: number;
  hasEditedOcr: boolean;
  itemCount: number;
}

export interface Budget {
  id: string;
  categoryId: string;
  amount: number;
  month: string; // YYYY-MM
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export type WarrantyAlertType = 'warranty' | 'return';

export interface WarrantyAlert {
  id: string;
  title: string;
  alertType: WarrantyAlertType;
  store?: string;
  purchaseDate: string; // ISO string
  purchaseAmount?: number;
  expiryDate: string; // ISO string
  warrantyLength?: string;
  category?: string;
  receiptId?: string;
  notes?: string;
  manualEntry?: boolean;
  isActive: boolean;
  notifiedMask: number;
  createdAt: string;
  updatedAt: string;
}

export type NotificationKind = 'warranty' | 'backup' | 'budget' | 'feature' | 'cashback';

export interface InAppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  route?: string;
  payloadJson?: string;
  isRead: boolean;
  createdAt: string;
}

type Db = SQLiteDatabase;

const DB_NAME = 'receiptstacker.db' as const;
const DB_LOCATION = 'default' as const;

const ACTIVE_USER_ID_KEY = 'receiptstacker.activeUserId' as const;

let activeUserId: string | null | undefined = undefined;

export const setActiveUserIdForDb = (userId: string | null): void => {
  activeUserId = userId ?? null;
};

const getActiveUserIdForDb = async (): Promise<string | null> => {
  if (activeUserId !== undefined) return activeUserId;
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_USER_ID_KEY);
    activeUserId = typeof stored === 'string' && stored.length ? stored : null;
    return activeUserId;
  } catch {
    activeUserId = null;
    return null;
  }
};

let dbInstance: Db | null = null;
let initPromise: Promise<void> | null = null;

export const generateId = (): string => {
  // Timestamp-based ID. Safe enough for local-only usage.
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const formatDateForDB = (date: Date): string => date.toISOString();

export const parseDateFromDB = (dateStr: string): Date => {
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

export const getCurrentMonth = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const nowIso = () => new Date().toISOString();

const ensureDb = async (): Promise<Db> => {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabase({ name: DB_NAME, location: DB_LOCATION });
  return dbInstance;
};

const exec = async (sql: string, params: unknown[] = []): Promise<ResultSet> => {
  const db = await ensureDb();
  const [result] = await db.executeSql(sql, params as any);
  return result;
};

const queryAll = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
  const result = await exec(sql, params);
  const out: T[] = [];
  for (let i = 0; i < result.rows.length; i += 1) {
    out.push(result.rows.item(i) as T);
  }
  return out;
};

const queryOne = async <T>(sql: string, params: unknown[] = []): Promise<T | null> => {
  const rows = await queryAll<T>(sql, params);
  return rows[0] ?? null;
};

const SCHEMA = {
  receipts: `
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      document_id TEXT,
      merchant TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      category_id TEXT NOT NULL,
      scan_mode TEXT,
      payment_method TEXT,
      notes TEXT,
      image_uri TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
  budgets: `
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      amount REAL NOT NULL,
      month TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(category_id, month)
    );
  `,
  categories: `
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `,
  tags: `
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `,
  receiptTags: `
    CREATE TABLE IF NOT EXISTS receipt_tags (
      receipt_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (receipt_id, tag_id),
      FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
  `,

  receiptItems: `
    CREATE TABLE IF NOT EXISTS receipt_items (
      id TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL,

      item_name TEXT NOT NULL,
      item_name_normalized TEXT NOT NULL,
      quantity REAL DEFAULT 1,
      unit_price REAL,
      total_price REAL NOT NULL,
      item_confidence REAL,

      created_at TEXT NOT NULL,

      FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
    );
  `,

  ocrData: `
    CREATE TABLE IF NOT EXISTS ocr_data (
      id TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL,

      original_text TEXT NOT NULL,
      edited_text TEXT,
      raw_result_json TEXT,
      engine TEXT NOT NULL,
      confidence REAL,
      word_count INTEGER,
      character_count INTEGER,

      created_at TEXT NOT NULL,

      FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
    );
  `,

  receiptImages: `
    CREATE TABLE IF NOT EXISTS receipt_images (
      id TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL,

      image_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      part_number INTEGER,

      created_at TEXT NOT NULL,

      FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
    );
  `,

  receiptParsed: `
    CREATE TABLE IF NOT EXISTS receipt_parsed (
      receipt_id TEXT PRIMARY KEY,

      parsed_json TEXT,
      subtotal REAL,
      tax REAL,
      total_items INTEGER,

      store_address TEXT,
      store_number TEXT,
      cashier_name TEXT,
      payment_method TEXT,
      date_time TEXT,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,

      FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
    );
  `,

  idxReceiptItemsNormalized: `
    CREATE INDEX IF NOT EXISTS idx_receipt_items_normalized ON receipt_items(item_name_normalized);
  `,
  idxReceiptItemsReceiptId: `
    CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON receipt_items(receipt_id);
  `,
  idxReceiptsDate: `
    CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);
  `,
  idxReceiptsUserDate: `
    CREATE INDEX IF NOT EXISTS idx_receipts_user_date ON receipts(user_id, date);
  `,

  warrantyAlerts: `
    CREATE TABLE IF NOT EXISTS warranty_alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      store TEXT,
      purchase_date TEXT NOT NULL,
      purchase_amount REAL,
      expiry_date TEXT NOT NULL,
      warranty_length TEXT,
      category TEXT NOT NULL DEFAULT 'Electronics',
      receipt_id TEXT,
      notes TEXT,
      manual_entry INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      notified_mask INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
  idxWarrantyAlertsExpiry: `
    CREATE INDEX IF NOT EXISTS idx_warranty_alerts_expiry ON warranty_alerts(expiry_date);
  `,
  idxWarrantyAlertsUserExpiry: `
    CREATE INDEX IF NOT EXISTS idx_warranty_alerts_user_expiry ON warranty_alerts(user_id, expiry_date);
  `,
  idxWarrantyAlertsActive: `
    CREATE INDEX IF NOT EXISTS idx_warranty_alerts_active ON warranty_alerts(is_active);
  `,
  idxWarrantyAlertsUserActive: `
    CREATE INDEX IF NOT EXISTS idx_warranty_alerts_user_active ON warranty_alerts(user_id, is_active);
  `,

  notifications: `
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      route TEXT,
      payload_json TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `,
  idxNotificationsCreated: `
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
  `,
  idxNotificationsUserCreated: `
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at ON notifications(user_id, created_at);
  `,
  idxNotificationsRead: `
    CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
  `,
  idxNotificationsUserRead: `
    CREATE INDEX IF NOT EXISTS idx_notifications_user_is_read ON notifications(user_id, is_read);
  `,
} as const;

const normalizeItemName = (name: string): string =>
  (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const DEFAULT_CATEGORIES: Array<Pick<Category, 'id' | 'name' | 'icon' | 'color'>> = [
  { id: 'food', name: 'Food & Dining', icon: 'coffee', color: '#10b981' },
  { id: 'groceries', name: 'Groceries', icon: 'shopping-cart', color: '#22c55e' },
  { id: 'transport', name: 'Transportation', icon: 'truck', color: '#f59e0b' },
  { id: 'shopping', name: 'Shopping', icon: 'shopping-bag', color: '#3b82f6' },
  { id: 'entertainment', name: 'Entertainment', icon: 'film', color: '#8b5cf6' },
  { id: 'health', name: 'Health', icon: 'heart', color: '#ef4444' },
  { id: 'bills', name: 'Bills', icon: 'file-text', color: '#6b7280' },
  { id: 'travel', name: 'Travel', icon: 'map', color: '#14b8a6' },
  { id: 'other', name: 'Other', icon: 'more-horizontal', color: '#9ca3af' },
] as const;

export const seedDefaultCategories = async (): Promise<void> => {
  try {
    const createdAt = nowIso();
    // Avoid async/await inside a transaction callback: WebSQL-style drivers will finalize
    // the transaction once the callback returns, and awaited work runs too late.
    for (const c of DEFAULT_CATEGORIES) {
      await exec(
        `INSERT OR IGNORE INTO categories (id, name, icon, color, is_default, created_at)
         VALUES (?, ?, ?, ?, 1, ?);`,
        [c.id, c.name, c.icon, c.color, createdAt],
      );
    }
  } catch (error) {
    console.error('Database error (seedDefaultCategories):', error);
    throw new Error('Failed to seed default categories');
  }
};

const getUserVersion = async (): Promise<number> => {
  const row = await queryOne<{ user_version: number }>('PRAGMA user_version;');
  return row?.user_version ?? 0;
};

const setUserVersion = async (version: number): Promise<void> => {
  await exec(`PRAGMA user_version = ${version};`);
};

export const initDatabase = async (): Promise<void> => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await ensureDb();

      // Ensure FK constraints.
      await exec('PRAGMA foreign_keys = ON;');

      // Basic migration using PRAGMA user_version.
      const version = await getUserVersion();

      const migrateToV9 = async (): Promise<void> => {
        // Multi-account privacy: scope user data to the active user.
        // SQLite supports ADD COLUMN (no IF NOT EXISTS), so we guard via try/catch.
        try {
          await exec("ALTER TABLE receipts ADD COLUMN user_id TEXT NOT NULL DEFAULT '';");
        } catch {}

        try {
          await exec(SCHEMA.idxReceiptsUserDate);
        } catch {}

        try {
          await exec("ALTER TABLE warranty_alerts ADD COLUMN user_id TEXT NOT NULL DEFAULT '';");
        } catch {}

        try {
          await exec(SCHEMA.idxWarrantyAlertsUserExpiry);
        } catch {}
        try {
          await exec(SCHEMA.idxWarrantyAlertsUserActive);
        } catch {}

        try {
          await exec("ALTER TABLE notifications ADD COLUMN user_id TEXT NOT NULL DEFAULT '';");
        } catch {}

        try {
          await exec(SCHEMA.idxNotificationsUserCreated);
        } catch {}
        try {
          await exec(SCHEMA.idxNotificationsUserRead);
        } catch {}

        // Best-effort backfill existing rows into the active user.
        try {
          const userId = await getActiveUserIdForDb();
          if (userId) {
            await exec("UPDATE receipts SET user_id = ? WHERE user_id IS NULL OR user_id = '';", [userId]);
            await exec("UPDATE warranty_alerts SET user_id = ? WHERE user_id IS NULL OR user_id = '';", [userId]);
            await exec("UPDATE notifications SET user_id = ? WHERE user_id IS NULL OR user_id = '';", [userId]);
          }
        } catch {}
      };
      if (version === 0) {
        await exec(SCHEMA.categories);
        await exec(SCHEMA.receipts);
        await exec(SCHEMA.budgets);
        await exec(SCHEMA.tags);
        await exec(SCHEMA.receiptTags);
        await exec(SCHEMA.receiptItems);
        await exec(SCHEMA.ocrData);
        await exec(SCHEMA.receiptImages);
        await exec(SCHEMA.receiptParsed);
        await exec(SCHEMA.idxReceiptItemsNormalized);
        await exec(SCHEMA.idxReceiptItemsReceiptId);
        await exec(SCHEMA.idxReceiptsDate);
        await exec(SCHEMA.idxReceiptsUserDate);
        await exec(SCHEMA.warrantyAlerts);
        await exec(SCHEMA.idxWarrantyAlertsExpiry);
        await exec(SCHEMA.idxWarrantyAlertsActive);
        await exec(SCHEMA.idxWarrantyAlertsUserExpiry);
        await exec(SCHEMA.idxWarrantyAlertsUserActive);
        await exec(SCHEMA.notifications);
        await exec(SCHEMA.idxNotificationsCreated);
        await exec(SCHEMA.idxNotificationsRead);
        await exec(SCHEMA.idxNotificationsUserCreated);
        await exec(SCHEMA.idxNotificationsUserRead);
        await seedDefaultCategories();
        await migrateToV9();
        await setUserVersion(9);
        return;
      }

      if (version === 1) {
        await exec(SCHEMA.receiptItems);
        await exec(SCHEMA.ocrData);
        await exec(SCHEMA.receiptImages);
        await exec(SCHEMA.idxReceiptItemsNormalized);
        await exec(SCHEMA.idxReceiptItemsReceiptId);
        await exec(SCHEMA.idxReceiptsDate);
        await exec(SCHEMA.idxReceiptsUserDate);
        await exec(SCHEMA.warrantyAlerts);
        await exec(SCHEMA.idxWarrantyAlertsExpiry);
        await exec(SCHEMA.idxWarrantyAlertsActive);
        await exec(SCHEMA.idxWarrantyAlertsUserExpiry);
        await exec(SCHEMA.idxWarrantyAlertsUserActive);
        await exec(SCHEMA.notifications);
        await exec(SCHEMA.idxNotificationsCreated);
        await exec(SCHEMA.idxNotificationsRead);
        await exec(SCHEMA.idxNotificationsUserCreated);
        await exec(SCHEMA.idxNotificationsUserRead);
        await exec(SCHEMA.receiptParsed);
        await migrateToV9();
        await setUserVersion(9);
        return;
      }

      if (version === 2) {
        await exec(SCHEMA.warrantyAlerts);
        await exec(SCHEMA.idxWarrantyAlertsExpiry);
        await exec(SCHEMA.idxWarrantyAlertsActive);
        await exec(SCHEMA.idxWarrantyAlertsUserExpiry);
        await exec(SCHEMA.idxWarrantyAlertsUserActive);
        await exec(SCHEMA.notifications);
        await exec(SCHEMA.idxNotificationsCreated);
        await exec(SCHEMA.idxNotificationsRead);
        await exec(SCHEMA.idxNotificationsUserCreated);
        await exec(SCHEMA.idxNotificationsUserRead);
        await exec(SCHEMA.receiptParsed);
        await migrateToV9();
        await setUserVersion(9);
        return;
      }

      if (version === 3) {
        // Prompt 34A: add manual entry fields for warranty alerts.
        // SQLite supports ADD COLUMN (no IF NOT EXISTS), so we guard via try/catch.
        try {
          await exec('ALTER TABLE warranty_alerts ADD COLUMN purchase_amount REAL;');
        } catch {}
        try {
          await exec('ALTER TABLE warranty_alerts ADD COLUMN warranty_length TEXT;');
        } catch {}
        try {
          await exec("ALTER TABLE warranty_alerts ADD COLUMN category TEXT NOT NULL DEFAULT 'Electronics';");
        } catch {}
        try {
          await exec('ALTER TABLE warranty_alerts ADD COLUMN manual_entry INTEGER NOT NULL DEFAULT 0;');
        } catch {}

        await exec(SCHEMA.receiptParsed);
        await migrateToV9();
        await setUserVersion(9);
        return;
      }

      if (version === 4) {
        // Prompt 43: store scan mode metadata for scanned receipts.
        // SQLite supports ADD COLUMN (no IF NOT EXISTS), so we guard via try/catch.
        try {
          await exec('ALTER TABLE receipts ADD COLUMN scan_mode TEXT;');
        } catch {}

        // Best-effort backfill:
        // - If a receipt has part images, treat it as a long scan.
        // - Otherwise default to single.
        try {
          await exec(
            `UPDATE receipts
             SET scan_mode = 'long'
             WHERE id IN (
               SELECT DISTINCT receipt_id
               FROM receipt_images
               WHERE image_type = 'part'
             );`,
          );
        } catch {}

        try {
          await exec("UPDATE receipts SET scan_mode = COALESCE(scan_mode, 'single');");
        } catch {}

        await exec(SCHEMA.receiptParsed);
        await migrateToV9();
        await setUserVersion(9);
        return;
      }

      if (version === 5) {
        // Prompt 46: persist parsed OCR metadata alongside raw OCR.
        await exec(SCHEMA.receiptParsed);
        await migrateToV9();
        await setUserVersion(9);
        return;
      }

      if (version === 6) {
        // Scan documents: link pages under a single documentId.
        // SQLite supports ADD COLUMN (no IF NOT EXISTS), so we guard via try/catch.
        try {
          await exec('ALTER TABLE receipts ADD COLUMN document_id TEXT;');
        } catch {}
        await migrateToV9();
        await setUserVersion(9);
        return;
      }

      if (version === 7) {
        // Multi-account privacy: scope receipts to the active user.
        // SQLite supports ADD COLUMN (no IF NOT EXISTS), so we guard via try/catch.
        try {
          await exec("ALTER TABLE receipts ADD COLUMN user_id TEXT NOT NULL DEFAULT '';");
        } catch {}

        try {
          await exec(SCHEMA.idxReceiptsUserDate);
        } catch {}

        // Best-effort backfill existing receipts into the active user.
        try {
          const userId = await getActiveUserIdForDb();
          if (userId) {
            await exec("UPDATE receipts SET user_id = ? WHERE user_id IS NULL OR user_id = '';", [userId]);
          }
        } catch {}

        await migrateToV9();
        await setUserVersion(9);
        return;
      }

      // Always ensure default categories exist (safe via INSERT OR IGNORE).
      // This allows us to add new seeded defaults over time without requiring a full reset.
      try {
        await seedDefaultCategories();
      } catch {
        // ignore
      }

      if (version === 8) {
        await migrateToV9();
        await setUserVersion(9);
      }

      // Future: handle versioned migrations.
    } catch (error) {
      console.error('Database error (initDatabase):', error);
      throw new Error('Failed to initialize database');
    }
  })();

  return initPromise;
};

// --- Warranty Alerts CRUD ---

type WarrantyAlertRow = {
  id: string;
  title: string;
  alertType: WarrantyAlertType;
  store?: string | null;
  purchaseDate: string;
  purchaseAmount?: number | null;
  expiryDate: string;
  warrantyLength?: string | null;
  category?: string | null;
  receiptId?: string | null;
  notes?: string | null;
  manualEntry?: number | null;
  isActive: number;
  notifiedMask: number;
  createdAt: string;
  updatedAt: string;
};

const mapWarrantyAlertRow = (r: WarrantyAlertRow): WarrantyAlert => {
  return {
    id: r.id,
    title: r.title,
    alertType: r.alertType,
    store: r.store ?? undefined,
    purchaseDate: r.purchaseDate,
    purchaseAmount: typeof r.purchaseAmount === 'number' ? r.purchaseAmount : undefined,
    expiryDate: r.expiryDate,
    warrantyLength: r.warrantyLength ?? undefined,
    category: r.category ?? undefined,
    receiptId: r.receiptId ?? undefined,
    notes: r.notes ?? undefined,
    manualEntry: Boolean(r.manualEntry ?? 0),
    isActive: Boolean(r.isActive),
    notifiedMask: typeof r.notifiedMask === 'number' ? r.notifiedMask : 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
};

export const addWarrantyAlert = async (
  input: Omit<WarrantyAlert, 'id' | 'createdAt' | 'updatedAt' | 'isActive' | 'notifiedMask'> & {
    id?: string;
    isActive?: boolean;
    notifiedMask?: number;
  },
): Promise<string> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) throw new Error('No active user');
    const createdAt = nowIso();
    const updatedAt = createdAt;
    const id = input.id ?? generateId();

    await exec(
      `INSERT INTO warranty_alerts (
        id, user_id, title, alert_type, store, purchase_date, purchase_amount, expiry_date, warranty_length, category,
        receipt_id, notes, manual_entry, is_active, notified_mask, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        userId,
        input.title.trim(),
        input.alertType,
        input.store ?? null,
        input.purchaseDate,
        typeof input.purchaseAmount === 'number' ? input.purchaseAmount : null,
        input.expiryDate,
        input.warrantyLength ?? null,
        input.category ?? 'Electronics',
        input.receiptId ?? null,
        input.notes ?? null,
        input.manualEntry ? 1 : 0,
        input.isActive === false ? 0 : 1,
        input.notifiedMask ?? 0,
        createdAt,
        updatedAt,
      ],
    );

    return id;
  } catch (error) {
    console.error('Database error (addWarrantyAlert):', error);
    throw new Error('Failed to add warranty alert');
  }
};

export const getWarrantyAlerts = async (opts?: {
  includeInactive?: boolean;
  limit?: number;
}): Promise<WarrantyAlert[]> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return [];
    const includeInactive = Boolean(opts?.includeInactive);
    const limit = opts?.limit;

    const where = includeInactive ? 'WHERE user_id = ?' : 'WHERE user_id = ? AND is_active = 1';
    const params: any[] = [userId];
    if (typeof limit === 'number') params.push(limit);

    const rows = await queryAll<WarrantyAlertRow>(
      `SELECT
         id,
         title,
         alert_type as alertType,
         store,
         purchase_date as purchaseDate,
         purchase_amount as purchaseAmount,
         expiry_date as expiryDate,
         warranty_length as warrantyLength,
         category,
         receipt_id as receiptId,
         notes,
         manual_entry as manualEntry,
         is_active as isActive,
         notified_mask as notifiedMask,
         created_at as createdAt,
         updated_at as updatedAt
       FROM warranty_alerts
       ${where}
       ORDER BY expiry_date ASC, created_at DESC
       ${typeof limit === 'number' ? 'LIMIT ?' : ''};`,
      params,
    );

    return rows.map(mapWarrantyAlertRow);
  } catch (error) {
    console.error('Database error (getWarrantyAlerts):', error);
    throw new Error('Failed to get warranty alerts');
  }
};

export const updateWarrantyAlert = async (id: string, patch: Partial<WarrantyAlert>): Promise<void> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return;
    const existing = await queryOne<WarrantyAlertRow>(
      `SELECT
         id,
         title,
         alert_type as alertType,
         store,
         purchase_date as purchaseDate,
         purchase_amount as purchaseAmount,
         expiry_date as expiryDate,
         warranty_length as warrantyLength,
         category,
         receipt_id as receiptId,
         notes,
         manual_entry as manualEntry,
         is_active as isActive,
         notified_mask as notifiedMask,
         created_at as createdAt,
         updated_at as updatedAt
       FROM warranty_alerts
       WHERE id = ? AND user_id = ?
       LIMIT 1;`,
      [id, userId],
    );
    if (!existing) return;

    const next = {
      ...mapWarrantyAlertRow(existing),
      ...patch,
      id,
      updatedAt: nowIso(),
    } as WarrantyAlert;

    await exec(
      `UPDATE warranty_alerts
       SET title = ?,
           alert_type = ?,
           store = ?,
           purchase_date = ?,
           purchase_amount = ?,
           expiry_date = ?,
           warranty_length = ?,
           category = ?,
           receipt_id = ?,
           notes = ?,
           manual_entry = ?,
           is_active = ?,
           notified_mask = ?,
           updated_at = ?
       WHERE id = ? AND user_id = ?;`,
      [
        next.title.trim(),
        next.alertType,
        next.store ?? null,
        next.purchaseDate,
        typeof next.purchaseAmount === 'number' ? next.purchaseAmount : null,
        next.expiryDate,
        next.warrantyLength ?? null,
        next.category ?? 'Electronics',
        next.receiptId ?? null,
        next.notes ?? null,
        next.manualEntry ? 1 : 0,
        next.isActive ? 1 : 0,
        next.notifiedMask ?? 0,
        next.updatedAt,
        id,
        userId,
      ],
    );
  } catch (error) {
    console.error('Database error (updateWarrantyAlert):', error);
    throw new Error('Failed to update warranty alert');
  }
};

export const archiveWarrantyAlert = async (id: string): Promise<void> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return;
    await exec('UPDATE warranty_alerts SET is_active = 0, updated_at = ? WHERE id = ? AND user_id = ?;', [nowIso(), id, userId]);
  } catch (error) {
    console.error('Database error (archiveWarrantyAlert):', error);
    throw new Error('Failed to archive warranty alert');
  }
};

export const deleteWarrantyAlert = async (id: string): Promise<void> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return;
    await exec('DELETE FROM warranty_alerts WHERE id = ? AND user_id = ?;', [id, userId]);
  } catch (error) {
    console.error('Database error (deleteWarrantyAlert):', error);
    throw new Error('Failed to delete warranty alert');
  }
};

export const clearWarrantyAlerts = async (): Promise<void> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return;
    await exec('DELETE FROM warranty_alerts WHERE user_id = ?;', [userId]);
  } catch (error) {
    console.error('Database error (clearWarrantyAlerts):', error);
    throw new Error('Failed to clear warranty alerts');
  }
};

export const clearReceiptImages = async (): Promise<void> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return;
    await exec(
      `DELETE FROM receipt_images
       WHERE receipt_id IN (
         SELECT id
         FROM receipts
         WHERE user_id = ?
       );`,
      [userId],
    );
  } catch (error) {
    console.error('Database error (clearReceiptImages):', error);
    throw new Error('Failed to clear receipt images');
  }
};

export const getWarrantyAlertUniqueStores = async (): Promise<string[]> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return [];
    const rows = await queryAll<{ store: string }>(
      `SELECT DISTINCT store
       FROM warranty_alerts
       WHERE user_id = ? AND store IS NOT NULL AND TRIM(store) <> ''
       ORDER BY store COLLATE NOCASE ASC;`,
      [userId],
    );
    return rows.map(r => r.store).filter(Boolean);
  } catch (error) {
    console.error('Database error (getWarrantyAlertUniqueStores):', error);
    return [];
  }
};

export const getWarrantyAlertsCounts = async (): Promise<{
  totalActive: number;
  urgent: number;
  expiringSoon: number;
  active: number;
}> => {
  try {
    await initDatabase();
    const alerts = await getWarrantyAlerts({ includeInactive: false });
    const now = new Date();
    const msDay = 24 * 60 * 60 * 1000;

    const daysRemaining = (iso: string) => Math.ceil((new Date(iso).getTime() - now.getTime()) / msDay);

    let urgent = 0;
    let expiringSoon = 0;
    let active = 0;
    for (const a of alerts) {
      const d = daysRemaining(a.expiryDate);
      if (d < 0) continue;
      if (d <= 7) urgent += 1;
      else if (d <= 30) expiringSoon += 1;
      else active += 1;
    }

    return { totalActive: alerts.length, urgent, expiringSoon, active };
  } catch (error) {
    console.error('Database error (getWarrantyAlertsCounts):', error);
    throw new Error('Failed to get warranty alert counts');
  }
};

export const getWarrantyAlertsPreview = async (limit = 2): Promise<WarrantyAlert[]> => {
  try {
    return await getWarrantyAlerts({ includeInactive: false, limit });
  } catch (error) {
    console.error('Database error (getWarrantyAlertsPreview):', error);
    throw new Error('Failed to get warranty alerts preview');
  }
};

// --- In-app Notifications CRUD ---

type NotificationRow = {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  route?: string | null;
  payloadJson?: string | null;
  isRead: number;
  createdAt: string;
};

const mapNotificationRow = (r: NotificationRow): InAppNotification => {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    message: r.message,
    route: r.route ?? undefined,
    payloadJson: r.payloadJson ?? undefined,
    isRead: Boolean(r.isRead),
    createdAt: r.createdAt,
  };
};

export const addNotification = async (
  input: Omit<InAppNotification, 'id' | 'createdAt' | 'isRead'> & {
    id?: string;
    createdAt?: string;
    isRead?: boolean;
  },
): Promise<string> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) throw new Error('No active user');
    const createdAt = input.createdAt ?? nowIso();
    const id = input.id ?? generateId();

    await exec(
      `INSERT INTO notifications (id, user_id, kind, title, message, route, payload_json, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        userId,
        input.kind,
        input.title.trim(),
        input.message.trim(),
        input.route ?? null,
        input.payloadJson ?? null,
        input.isRead ? 1 : 0,
        createdAt,
      ],
    );

    return id;
  } catch (error) {
    console.error('Database error (addNotification):', error);
    throw new Error('Failed to add notification');
  }
};

export const getNotifications = async (limit = 100): Promise<InAppNotification[]> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return [];
    const rows = await queryAll<NotificationRow>(
      `SELECT
         id,
         kind,
         title,
         message,
         route,
         payload_json as payloadJson,
         is_read as isRead,
         created_at as createdAt
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?;`,
      [userId, limit],
    );
    return rows.map(mapNotificationRow);
  } catch (error) {
    console.error('Database error (getNotifications):', error);
    throw new Error('Failed to get notifications');
  }
};

export const markAllNotificationsRead = async (): Promise<void> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return;
    await exec('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0;', [userId]);
  } catch (error) {
    console.error('Database error (markAllNotificationsRead):', error);
    throw new Error('Failed to mark notifications read');
  }
};

export const clearNotifications = async (): Promise<void> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return;
    await exec('DELETE FROM notifications WHERE user_id = ?;', [userId]);
  } catch (error) {
    console.error('Database error (clearNotifications):', error);
    throw new Error('Failed to clear notifications');
  }
};

export const countUnreadNotifications = async (): Promise<number> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return 0;
    const row = await queryOne<{ c: number }>('SELECT COUNT(1) as c FROM notifications WHERE user_id = ? AND is_read = 0;', [userId]);
    return row?.c ?? 0;
  } catch (error) {
    console.error('Database error (countUnreadNotifications):', error);
    return 0;
  }
};

// --- Receipts CRUD ---

export const addReceipt = async (receipt: Receipt): Promise<string> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) throw new Error('No active user');
    const createdAt = receipt.createdAt || nowIso();
    const updatedAt = receipt.updatedAt || createdAt;

    await exec(
      `INSERT INTO receipts
        (id, user_id, document_id, merchant, amount, date, category_id, scan_mode, payment_method, notes, image_uri, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        receipt.id,
        userId,
        receipt.documentId ?? null,
        receipt.merchant,
        receipt.amount,
        receipt.date,
        receipt.categoryId,
        receipt.scanMode ?? null,
        receipt.paymentMethod ?? null,
        receipt.notes ?? null,
        receipt.imageUri ?? null,
        createdAt,
        updatedAt,
      ],
    );

    return receipt.id;
  } catch (error) {
    console.error('Database error (addReceipt):', error);
    throw new Error('Failed to add receipt');
  }
};

export const getReceipts = async (): Promise<Receipt[]> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return [];
    const rows = await queryAll<any>(
      `SELECT
         id,
         document_id as documentId,
         merchant,
         amount,
         date,
         category_id as categoryId,
         scan_mode as scanMode,
         payment_method as paymentMethod,
         notes,
         image_uri as imageUri,
         created_at as createdAt,
         updated_at as updatedAt
       FROM receipts
       WHERE user_id = ?
       ORDER BY date DESC, created_at DESC;`,
      [userId],
    );
    return rows as Receipt[];
  } catch (error) {
    console.error('Database error (getReceipts):', error);
    throw new Error('Failed to get receipts');
  }
};

export const getScannedReceiptSummaries = async (limit = 500): Promise<ScannedReceiptSummary[]> => {
  try {
    await initDatabase();

    const userId = await getActiveUserIdForDb();
    if (!userId) return [];

    const rows = await queryAll<any>(
      `SELECT
         r.id,
         r.merchant,
         r.amount,
         r.date,
         r.category_id as categoryId,
         c.name as categoryName,
         c.color as categoryColor,
         c.icon as categoryIcon,
         tags.tagsCsv as tagsCsv,
         r.image_uri as imageUri,
         r.created_at as createdAt,
         r.updated_at as updatedAt,
         r.scan_mode as scanMode,
         COALESCE(parts.partCount, 0) as partCount,
         od.engine as ocrEngine,
         od.confidence as ocrConfidence,
         od.word_count as ocrWordCount,
         CASE
           WHEN od.edited_text IS NOT NULL AND TRIM(od.edited_text) <> '' THEN 1
           ELSE 0
         END as hasEditedOcr,
         COALESCE(items.itemCount, 0) as itemCount
       FROM receipts r
       LEFT JOIN ocr_data od
         ON od.receipt_id = r.id
        AND od.created_at = (
          SELECT MAX(created_at) FROM ocr_data WHERE receipt_id = r.id
        )
       LEFT JOIN categories c ON c.id = r.category_id
       LEFT JOIN (
         SELECT receipt_id, COUNT(1) as partCount
         FROM receipt_images
         WHERE image_type = 'part'
         GROUP BY receipt_id
       ) parts ON parts.receipt_id = r.id
       LEFT JOIN (
         SELECT rt.receipt_id as receiptId, GROUP_CONCAT(t.name, ',') as tagsCsv
         FROM receipt_tags rt
         INNER JOIN tags t ON t.id = rt.tag_id
         GROUP BY rt.receipt_id
       ) tags ON tags.receiptId = r.id
       LEFT JOIN (
         SELECT receipt_id, COUNT(1) as itemCount
         FROM receipt_items
         GROUP BY receipt_id
       ) items ON items.receipt_id = r.id
       WHERE r.user_id = ?
       ORDER BY r.date DESC, r.created_at DESC
       LIMIT ?;`,
      [userId, limit],
    );

    return (rows as any[]).map((r) => ({
      ...r,
      ocrEngine: typeof r.ocrEngine === 'string' && r.ocrEngine.length ? r.ocrEngine : undefined,
      ocrConfidence: typeof r.ocrConfidence === 'number' && Number.isFinite(r.ocrConfidence) ? r.ocrConfidence : undefined,
      ocrWordCount: typeof r.ocrWordCount === 'number' && Number.isFinite(r.ocrWordCount) ? r.ocrWordCount : undefined,
      hasEditedOcr: Boolean(r.hasEditedOcr),
      itemCount: typeof r.itemCount === 'number' ? r.itemCount : Number(r.itemCount ?? 0),
      partCount: typeof r.partCount === 'number' ? r.partCount : Number(r.partCount ?? 0),
    })) as ScannedReceiptSummary[];
  } catch (error) {
    console.error('Database error (getScannedReceiptSummaries):', error);
    throw new Error('Failed to get scanned receipts');
  }
};

export const getReceiptById = async (id: string): Promise<Receipt | null> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return null;
    return await queryOne<Receipt>(
      `SELECT
         id,
         document_id as documentId,
         merchant,
         amount,
         date,
         category_id as categoryId,
         scan_mode as scanMode,
         payment_method as paymentMethod,
         notes,
         image_uri as imageUri,
         created_at as createdAt,
         updated_at as updatedAt
       FROM receipts
       WHERE id = ? AND user_id = ?
       LIMIT 1;`,
      [id, userId],
    );
  } catch (error) {
    console.error('Database error (getReceiptById):', error);
    throw new Error('Failed to get receipt');
  }
};

export const getReceiptsByDocumentId = async (documentId: string): Promise<Receipt[]> => {
  try {
    if (!documentId || !String(documentId).trim().length) return [];
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return [];
    const rows = await queryAll<any>(
      `SELECT
         id,
         document_id as documentId,
         merchant,
         amount,
         date,
         category_id as categoryId,
         scan_mode as scanMode,
         payment_method as paymentMethod,
         notes,
         image_uri as imageUri,
         created_at as createdAt,
         updated_at as updatedAt
       FROM receipts
       WHERE document_id = ? AND user_id = ?
       ORDER BY created_at ASC;`,
      [documentId, userId],
    );
    return rows as Receipt[];
  } catch (error) {
    console.error('Database error (getReceiptsByDocumentId):', error);
    throw new Error('Failed to get receipts by document');
  }
};

export const updateReceipt = async (id: string, receipt: Partial<Receipt>): Promise<void> => {
  try {
    await initDatabase();

    const userId = await getActiveUserIdForDb();
    if (!userId) return;

    const existing = await getReceiptById(id);
    if (!existing) return;

    const next: Receipt = {
      ...existing,
      ...receipt,
      id,
      updatedAt: nowIso(),
    };

    await exec(
      `UPDATE receipts
       SET document_id = ?,
           merchant = ?,
           amount = ?,
           date = ?,
           category_id = ?,
           scan_mode = ?,
           payment_method = ?,
           notes = ?,
           image_uri = ?,
           updated_at = ?
       WHERE id = ? AND user_id = ?;`,
      [
        next.documentId ?? null,
        next.merchant,
        next.amount,
        next.date,
        next.categoryId,
        next.scanMode ?? null,
        next.paymentMethod ?? null,
        next.notes ?? null,
        next.imageUri ?? null,
        next.updatedAt,
        id,
        userId,
      ],
    );
  } catch (error) {
    console.error('Database error (updateReceipt):', error);
    throw new Error('Failed to update receipt');
  }
};

export const deleteReceipt = async (id: string): Promise<void> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return;
    await exec('DELETE FROM receipts WHERE id = ? AND user_id = ?;', [id, userId]);
  } catch (error) {
    console.error('Database error (deleteReceipt):', error);
    throw new Error('Failed to delete receipt');
  }
};

export const getReceiptsByDateRange = async (start: Date, end: Date): Promise<Receipt[]> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return [];
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const rows = await queryAll<any>(
      `SELECT
         id,
         merchant,
         amount,
         date,
         category_id as categoryId,
         payment_method as paymentMethod,
         notes,
         image_uri as imageUri,
         created_at as createdAt,
         updated_at as updatedAt
       FROM receipts
       WHERE user_id = ? AND date BETWEEN ? AND ?
       ORDER BY date DESC;`,
      [userId, startIso, endIso],
    );
    return rows as Receipt[];
  } catch (error) {
    console.error('Database error (getReceiptsByDateRange):', error);
    throw new Error('Failed to get receipts');
  }
};

export const getReceiptsByCategory = async (categoryId: string): Promise<Receipt[]> => {
  try {
    await initDatabase();
    const userId = await getActiveUserIdForDb();
    if (!userId) return [];
    const rows = await queryAll<any>(
      `SELECT
         id,
         merchant,
         amount,
         date,
         category_id as categoryId,
         payment_method as paymentMethod,
         notes,
         image_uri as imageUri,
         created_at as createdAt,
         updated_at as updatedAt
       FROM receipts
       WHERE user_id = ? AND category_id = ?
       ORDER BY date DESC;`,
      [userId, categoryId],
    );
    return rows as Receipt[];
  } catch (error) {
    console.error('Database error (getReceiptsByCategory):', error);
    throw new Error('Failed to get receipts');
  }
};

// --- Budgets CRUD ---

export const addBudget = async (budget: Budget): Promise<string> => {
  try {
    await initDatabase();
    const createdAt = budget.createdAt || nowIso();
    await exec(
      `INSERT INTO budgets (id, category_id, amount, month, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(category_id, month)
       DO UPDATE SET amount = excluded.amount;`,
      [budget.id, budget.categoryId, budget.amount, budget.month, createdAt],
    );
    return budget.id;
  } catch (error) {
    console.error('Database error (addBudget):', error);
    throw new Error('Failed to add budget');
  }
};

export const getBudgets = async (month?: string): Promise<Budget[]> => {
  try {
    await initDatabase();
    const rows = await queryAll<any>(
      `SELECT id,
              category_id as categoryId,
              amount,
              month,
              created_at as createdAt
       FROM budgets
       ${month ? 'WHERE month = ?' : ''}
       ORDER BY month DESC, created_at DESC;`,
      month ? [month] : [],
    );
    return rows as Budget[];
  } catch (error) {
    console.error('Database error (getBudgets):', error);
    throw new Error('Failed to get budgets');
  }
};

export const getBudgetById = async (id: string): Promise<Budget | null> => {
  try {
    await initDatabase();
    return await queryOne<Budget>(
      `SELECT id,
              category_id as categoryId,
              amount,
              month,
              created_at as createdAt
       FROM budgets
       WHERE id = ?
       LIMIT 1;`,
      [id],
    );
  } catch (error) {
    console.error('Database error (getBudgetById):', error);
    throw new Error('Failed to get budget');
  }
};

export const updateBudget = async (id: string, amount: number): Promise<void> => {
  try {
    await initDatabase();
    await exec('UPDATE budgets SET amount = ? WHERE id = ?;', [amount, id]);
  } catch (error) {
    console.error('Database error (updateBudget):', error);
    throw new Error('Failed to update budget');
  }
};

export const deleteBudget = async (id: string): Promise<void> => {
  try {
    await initDatabase();
    await exec('DELETE FROM budgets WHERE id = ?;', [id]);
  } catch (error) {
    console.error('Database error (deleteBudget):', error);
    throw new Error('Failed to delete budget');
  }
};

export const getBudgetByCategory = async (categoryId: string, month: string): Promise<Budget | null> => {
  try {
    await initDatabase();
    return await queryOne<Budget>(
      `SELECT id,
              category_id as categoryId,
              amount,
              month,
              created_at as createdAt
       FROM budgets
       WHERE category_id = ? AND month = ?
       LIMIT 1;`,
      [categoryId, month],
    );
  } catch (error) {
    console.error('Database error (getBudgetByCategory):', error);
    throw new Error('Failed to get budget');
  }
};

// --- Categories CRUD ---

export const addCategory = async (category: Category): Promise<string> => {
  try {
    await initDatabase();
    const createdAt = category.createdAt || nowIso();
    await exec(
      `INSERT INTO categories (id, name, icon, color, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [category.id, category.name, category.icon, category.color, category.isDefault ? 1 : 0, createdAt],
    );
    return category.id;
  } catch (error) {
    console.error('Database error (addCategory):', error);
    throw new Error('Failed to add category');
  }
};

export const getCategories = async (): Promise<Category[]> => {
  try {
    await initDatabase();
    const rows = await queryAll<any>(
      `SELECT id,
              name,
              icon,
              color,
              is_default as isDefault,
              created_at as createdAt
       FROM categories
       ORDER BY is_default DESC, name ASC;`,
    );
    return (rows as any[]).map((r) => ({ ...r, isDefault: Boolean(r.isDefault) })) as Category[];
  } catch (error) {
    console.error('Database error (getCategories):', error);
    throw new Error('Failed to get categories');
  }
};

export const getCategoryById = async (id: string): Promise<Category | null> => {
  try {
    await initDatabase();
    const row = await queryOne<any>(
      `SELECT id,
              name,
              icon,
              color,
              is_default as isDefault,
              created_at as createdAt
       FROM categories
       WHERE id = ?
       LIMIT 1;`,
      [id],
    );
    if (!row) return null;
    return { ...row, isDefault: Boolean(row.isDefault) } as Category;
  } catch (error) {
    console.error('Database error (getCategoryById):', error);
    throw new Error('Failed to get category');
  }
};

export const updateCategory = async (id: string, category: Partial<Category>): Promise<void> => {
  try {
    await initDatabase();
    const existing = await getCategoryById(id);
    if (!existing) return;

    const next: Category = {
      ...existing,
      ...category,
      id,
      isDefault: existing.isDefault,
    };

    await exec(
      `UPDATE categories
       SET name = ?, icon = ?, color = ?
       WHERE id = ?;`,
      [next.name, next.icon, next.color, id],
    );
  } catch (error) {
    console.error('Database error (updateCategory):', error);
    throw new Error('Failed to update category');
  }
};

export const deleteCategory = async (id: string): Promise<void> => {
  try {
    await initDatabase();
    const existing = await getCategoryById(id);
    if (!existing) return;
    if (existing.isDefault) {
      throw new Error('Cannot delete default category');
    }
    await exec('DELETE FROM categories WHERE id = ?;', [id]);
  } catch (error) {
    console.error('Database error (deleteCategory):', error);
    throw new Error('Failed to delete category');
  }
};

// --- Tags CRUD + Receipt tag linking ---

export const addTag = async (tag: Tag): Promise<string> => {
  try {
    await initDatabase();
    const createdAt = tag.createdAt || nowIso();
    await exec(
      `INSERT INTO tags (id, name, color, created_at)
       VALUES (?, ?, ?, ?);`,
      [tag.id, tag.name.trim(), tag.color, createdAt],
    );
    return tag.id;
  } catch (error) {
    console.error('Database error (addTag):', error);
    throw new Error('Failed to add tag');
  }
};

export const getTags = async (): Promise<Tag[]> => {
  try {
    await initDatabase();
    const rows = await queryAll<Tag>(
      `SELECT id, name, color, created_at as createdAt
       FROM tags
       ORDER BY name ASC;`,
    );
    return rows;
  } catch (error) {
    console.error('Database error (getTags):', error);
    throw new Error('Failed to get tags');
  }
};

export const getTagById = async (id: string): Promise<Tag | null> => {
  try {
    await initDatabase();
    return await queryOne<Tag>(
      `SELECT id, name, color, created_at as createdAt
       FROM tags
       WHERE id = ?
       LIMIT 1;`,
      [id],
    );
  } catch (error) {
    console.error('Database error (getTagById):', error);
    throw new Error('Failed to get tag');
  }
};

export const updateTag = async (id: string, tag: Partial<Tag>): Promise<void> => {
  try {
    await initDatabase();
    const existing = await getTagById(id);
    if (!existing) return;

    const next: Tag = {
      ...existing,
      ...tag,
      id,
    };

    await exec('UPDATE tags SET name = ?, color = ? WHERE id = ?;', [next.name.trim(), next.color, id]);
  } catch (error) {
    console.error('Database error (updateTag):', error);
    throw new Error('Failed to update tag');
  }
};

export const deleteTag = async (id: string): Promise<void> => {
  try {
    await initDatabase();
    await exec('DELETE FROM tags WHERE id = ?;', [id]);
  } catch (error) {
    console.error('Database error (deleteTag):', error);
    throw new Error('Failed to delete tag');
  }
};

export const addTagToReceipt = async (receiptId: string, tagId: string): Promise<void> => {
  try {
    await initDatabase();
    await exec(
      'INSERT OR IGNORE INTO receipt_tags (receipt_id, tag_id) VALUES (?, ?);',
      [receiptId, tagId],
    );
  } catch (error) {
    console.error('Database error (addTagToReceipt):', error);
    throw new Error('Failed to link tag to receipt');
  }
};

export const removeTagFromReceipt = async (receiptId: string, tagId: string): Promise<void> => {
  try {
    await initDatabase();
    await exec('DELETE FROM receipt_tags WHERE receipt_id = ? AND tag_id = ?;', [receiptId, tagId]);
  } catch (error) {
    console.error('Database error (removeTagFromReceipt):', error);
    throw new Error('Failed to unlink tag from receipt');
  }
};

export const getTagsForReceipt = async (receiptId: string): Promise<Tag[]> => {
  try {
    await initDatabase();
    const rows = await queryAll<Tag>(
      `SELECT t.id, t.name, t.color, t.created_at as createdAt
       FROM tags t
       INNER JOIN receipt_tags rt ON rt.tag_id = t.id
       WHERE rt.receipt_id = ?
       ORDER BY t.name ASC;`,
      [receiptId],
    );
    return rows;
  } catch (error) {
    console.error('Database error (getTagsForReceipt):', error);
    throw new Error('Failed to get receipt tags');
  }
};

const normalizeTagName = (name: string): string => (name ?? '').trim().toLowerCase();

export const setTagsForReceiptByName = async (receiptId: string, tagNames: string[]): Promise<void> => {
  try {
    await initDatabase();

    const uniqueNames = Array.from(
      new Set(
        (Array.isArray(tagNames) ? tagNames : [])
          .map((t) => (typeof t === 'string' ? t.trim() : ''))
          .filter((t) => t.length > 0),
      ),
    );

    // Replace links with the provided set.
    await exec('DELETE FROM receipt_tags WHERE receipt_id = ?;', [receiptId]);
    if (uniqueNames.length === 0) return;

    const existing = await queryAll<Tag>('SELECT id, name, color, created_at as createdAt FROM tags;');
    const byNorm = new Map(existing.map((t) => [normalizeTagName(t.name), t]));
    const createdAt = nowIso();

    for (const name of uniqueNames) {
      const norm = normalizeTagName(name);
      let tag = byNorm.get(norm);

      if (!tag) {
        const id = generateId();
        const color = COLORS.brand.primary;
        await exec(
          `INSERT INTO tags (id, name, color, created_at)
           VALUES (?, ?, ?, ?);`,
          [id, name.trim(), color, createdAt],
        );
        tag = { id, name: name.trim(), color, createdAt };
        byNorm.set(norm, tag);
      }

      await exec('INSERT OR IGNORE INTO receipt_tags (receipt_id, tag_id) VALUES (?, ?);', [receiptId, tag.id]);
    }
  } catch (error) {
    console.error('Database error (setTagsForReceiptByName):', error);
    throw new Error('Failed to set receipt tags');
  }
};

// --- OCR + Images + Line Items ---

export const saveReceiptImages = async (
  receiptId: string,
  images: Array<Omit<ReceiptImage, 'id' | 'receiptId' | 'createdAt'>>,
): Promise<void> => {
  try {
    await initDatabase();
    const createdAt = nowIso();

    // Keep it simple: clear existing images then insert.
    await exec('DELETE FROM receipt_images WHERE receipt_id = ?;', [receiptId]);

    for (const img of images) {
      await exec(
        `INSERT INTO receipt_images (id, receipt_id, image_type, file_path, part_number, created_at)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [
          generateId(),
          receiptId,
          img.imageType,
          img.filePath,
          img.partNumber ?? null,
          createdAt,
        ],
      );
    }
  } catch (error) {
    console.error('Database error (saveReceiptImages):', error);
    throw new Error('Failed to save receipt images');
  }
};

export const saveReceiptOcrData = async (
  receiptId: string,
  input: {
    originalText: string;
    editedText?: string;
    rawResultJson?: string;
    engine: 'mlkit' | 'tesseract';
    confidence?: number;
  },
): Promise<void> => {
  try {
    await initDatabase();
    const createdAt = nowIso();
    const originalText = input.originalText ?? '';
    const editedText = input.editedText ?? null;

    const wordCount = originalText.trim() ? originalText.trim().split(/\s+/).length : 0;
    const characterCount = originalText.length;

    await exec(
      `INSERT INTO ocr_data (
        id, receipt_id, original_text, edited_text, raw_result_json,
        engine, confidence, word_count, character_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        generateId(),
        receiptId,
        originalText,
        editedText,
        input.rawResultJson ?? null,
        input.engine,
        input.confidence ?? null,
        wordCount,
        characterCount,
        createdAt,
      ],
    );
  } catch (error) {
    console.error('Database error (saveReceiptOcrData):', error);
    throw new Error('Failed to save OCR data');
  }
};

export const saveReceiptItems = async (
  receiptId: string,
  items: Array<{
    itemName: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice: number;
    itemConfidence?: number;
  }>,
): Promise<void> => {
  try {
    await initDatabase();
    const createdAt = nowIso();

    await exec('DELETE FROM receipt_items WHERE receipt_id = ?;', [receiptId]);

    for (const it of items) {
      const name = (it.itemName ?? '').trim();
      if (!name) continue;
      const quantity = typeof it.quantity === 'number' && Number.isFinite(it.quantity) ? it.quantity : 1;
      const totalPrice = typeof it.totalPrice === 'number' && Number.isFinite(it.totalPrice) ? it.totalPrice : 0;
      const unitPrice =
        typeof it.unitPrice === 'number' && Number.isFinite(it.unitPrice) ? it.unitPrice : totalPrice;

      await exec(
        `INSERT INTO receipt_items (
          id, receipt_id, item_name, item_name_normalized,
          quantity, unit_price, total_price, item_confidence, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          generateId(),
          receiptId,
          name,
          normalizeItemName(name),
          quantity,
          unitPrice,
          totalPrice,
          it.itemConfidence ?? null,
          createdAt,
        ],
      );
    }
  } catch (error) {
    console.error('Database error (saveReceiptItems):', error);
    throw new Error('Failed to save receipt items');
  }
};

export type ItemSearchRow = {
  itemName: string;
  totalPrice: number;
  quantity: number;
  unitPrice: number;
  merchant: string;
  date: string;
  categoryId: string;
};

export type ItemSearchPurchaseRow = {
  itemId: string;
  receiptId: string;
  itemName: string;
  itemNameNormalized: string;
  totalPrice: number;
  quantity: number;
  unitPrice: number;
  merchant: string;
  date: string;
  categoryId: string;
  imageUri?: string | null;
  ocrEngine?: 'mlkit' | 'tesseract' | null;
  ocrConfidence?: number | null;
  hasEditedOcr?: number | 0 | 1;
};

export const searchReceiptItems = async (query: string, limit = 100): Promise<ItemSearchRow[]> => {
  try {
    await initDatabase();

    const userId = await getActiveUserIdForDb();
    if (!userId) return [];

    const normalized = normalizeItemName(query);
    if (!normalized) return [];

    const rows = await queryAll<ItemSearchRow>(
      `SELECT
        ri.item_name as itemName,
        ri.total_price as totalPrice,
        ri.quantity as quantity,
        ri.unit_price as unitPrice,
        r.merchant as merchant,
        r.date as date,
        r.category_id as categoryId
      FROM receipt_items ri
      INNER JOIN receipts r ON r.id = ri.receipt_id
      WHERE r.user_id = ?
        AND ri.item_name_normalized LIKE ?
      ORDER BY r.date DESC
      LIMIT ?;`,
      [userId, `%${normalized}%`, limit],
    );

    return rows;
  } catch (error) {
    console.error('Database error (searchReceiptItems):', error);
    throw new Error('Failed to search receipt items');
  }
};

export const searchReceiptItemPurchases = async (query: string, limit = 250): Promise<ItemSearchPurchaseRow[]> => {
  try {
    await initDatabase();

    const userId = await getActiveUserIdForDb();
    if (!userId) return [];

    const normalized = normalizeItemName(query);
    if (!normalized) return [];

    const rows = await queryAll<ItemSearchPurchaseRow>(
      `SELECT
        ri.id as itemId,
        ri.receipt_id as receiptId,
        ri.item_name as itemName,
        ri.item_name_normalized as itemNameNormalized,
        ri.total_price as totalPrice,
        ri.quantity as quantity,
        ri.unit_price as unitPrice,
        r.merchant as merchant,
        r.date as date,
        r.category_id as categoryId,
        r.image_uri as imageUri,
        od.engine as ocrEngine,
        od.confidence as ocrConfidence,
        CASE
          WHEN od.edited_text IS NOT NULL AND TRIM(od.edited_text) <> '' THEN 1
          ELSE 0
        END as hasEditedOcr
      FROM receipt_items ri
      INNER JOIN receipts r ON r.id = ri.receipt_id
      LEFT JOIN ocr_data od
        ON od.receipt_id = r.id
       AND od.created_at = (
         SELECT MAX(created_at) FROM ocr_data WHERE receipt_id = r.id
       )
      WHERE r.user_id = ?
        AND (ri.item_name_normalized LIKE ? OR ri.item_name LIKE ?)
      ORDER BY r.date DESC
      LIMIT ?;`,
      [userId, `%${normalized}%`, `%${query.trim()}%`, limit],
    );

    return rows;
  } catch (error) {
    console.error('Database error (searchReceiptItemPurchases):', error);
    throw new Error('Failed to search receipt items');
  }
};

export const searchReceiptIdsByItemName = async (query: string, limit = 200): Promise<string[]> => {
  try {
    await initDatabase();

    const userId = await getActiveUserIdForDb();
    if (!userId) return [];

    const normalized = normalizeItemName(query);
    if (!normalized) return [];

    const rows = await queryAll<{ receiptId: string }>(
      `SELECT DISTINCT
        ri.receipt_id as receiptId
      FROM receipt_items ri
      INNER JOIN receipts r ON r.id = ri.receipt_id
      WHERE r.user_id = ?
        AND ri.item_name_normalized LIKE ?
      LIMIT ?;`,
      [userId, `%${normalized}%`, limit],
    );

    return rows.map((r) => r.receiptId).filter((id) => typeof id === 'string' && id.length > 0);
  } catch (error) {
    console.error('Database error (searchReceiptIdsByItemName):', error);
    throw new Error('Failed to search receipt items');
  }
};

export const searchReceiptIdsByOcrText = async (query: string, limit = 200): Promise<string[]> => {
  try {
    await initDatabase();

    const userId = await getActiveUserIdForDb();
    if (!userId) return [];

    const q = (query ?? '').trim().toLowerCase();
    if (q.length < 2) return [];

    const like = `%${q}%`;
    const rows = await queryAll<{ receiptId: string }>(
      `SELECT DISTINCT
        od.receipt_id as receiptId
      FROM ocr_data od
      INNER JOIN receipts r ON r.id = od.receipt_id
      WHERE r.user_id = ?
        AND (
          LOWER(od.original_text) LIKE ?
          OR (od.edited_text IS NOT NULL AND LOWER(od.edited_text) LIKE ?)
        )
      ORDER BY od.created_at DESC
      LIMIT ?;`,
      [userId, like, like, limit],
    );

    return rows.map((r) => r.receiptId).filter((id) => typeof id === 'string' && id.length > 0);
  } catch (error) {
    console.error('Database error (searchReceiptIdsByOcrText):', error);
    throw new Error('Failed to search OCR text');
  }
};

export type LatestReceiptOcr = {
  originalText: string;
  editedText?: string | null;
  rawResultJson?: string | null;
  engine: 'mlkit' | 'tesseract';
  confidence?: number | null;
  createdAt: string;
};

export type ReceiptParsedData = {
  receiptId: string;
  parsedJson?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  totalItems?: number | null;
  storeAddress?: string | null;
  storeNumber?: string | null;
  cashierName?: string | null;
  paymentMethod?: string | null;
  dateTime?: string | null;
  createdAt: string;
  updatedAt: string;
};

const parseNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export const saveReceiptParsedData = async (
  receiptId: string,
  parsed: any,
): Promise<void> => {
  try {
    await initDatabase();
    const now = nowIso();

    let parsedJson: string | null = null;
    try {
      parsedJson = JSON.stringify(parsed ?? null);
    } catch {
      parsedJson = null;
    }

    const subtotal = parseNumber(parsed?.subtotal);
    const tax = parseNumber(parsed?.tax);
    const totalItems = typeof parsed?.totalItems === 'number' && Number.isFinite(parsed.totalItems)
      ? parsed.totalItems
      : parseNumber(parsed?.totalItems);

    const storeAddress = typeof parsed?.storeAddress === 'string' ? parsed.storeAddress : null;
    const storeNumber = typeof parsed?.storeNumber === 'string' ? parsed.storeNumber : null;
    const cashierName = typeof parsed?.cashierName === 'string' ? parsed.cashierName : null;
    const paymentMethod = typeof parsed?.paymentMethod === 'string' ? parsed.paymentMethod : null;
    const dateTime = typeof parsed?.dateTime === 'string' ? parsed.dateTime : null;

    await exec(
      `INSERT INTO receipt_parsed (
         receipt_id, parsed_json, subtotal, tax, total_items,
         store_address, store_number, cashier_name, payment_method, date_time,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(receipt_id) DO UPDATE SET
         parsed_json = excluded.parsed_json,
         subtotal = COALESCE(excluded.subtotal, receipt_parsed.subtotal),
         tax = COALESCE(excluded.tax, receipt_parsed.tax),
         total_items = COALESCE(excluded.total_items, receipt_parsed.total_items),
         store_address = COALESCE(excluded.store_address, receipt_parsed.store_address),
         store_number = COALESCE(excluded.store_number, receipt_parsed.store_number),
         cashier_name = COALESCE(excluded.cashier_name, receipt_parsed.cashier_name),
         payment_method = COALESCE(excluded.payment_method, receipt_parsed.payment_method),
         date_time = COALESCE(excluded.date_time, receipt_parsed.date_time),
         updated_at = excluded.updated_at;`,
      [
        receiptId,
        parsedJson,
        subtotal,
        tax,
        typeof totalItems === 'number' ? totalItems : null,
        storeAddress,
        storeNumber,
        cashierName,
        paymentMethod,
        dateTime,
        now,
        now,
      ],
    );
  } catch (error) {
    console.error('Database error (saveReceiptParsedData):', error);
    throw new Error('Failed to save parsed receipt data');
  }
};

export const getReceiptParsedData = async (receiptId: string): Promise<ReceiptParsedData | null> => {
  try {
    await initDatabase();
    const row = await queryOne<any>(
      `SELECT
         receipt_id as receiptId,
         parsed_json as parsedJson,
         subtotal,
         tax,
         total_items as totalItems,
         store_address as storeAddress,
         store_number as storeNumber,
         cashier_name as cashierName,
         payment_method as paymentMethod,
         date_time as dateTime,
         created_at as createdAt,
         updated_at as updatedAt
       FROM receipt_parsed
       WHERE receipt_id = ?
       LIMIT 1;`,
      [receiptId],
    );
    return row ? (row as ReceiptParsedData) : null;
  } catch (error) {
    console.error('Database error (getReceiptParsedData):', error);
    throw new Error('Failed to get parsed receipt data');
  }
};

export const getLatestReceiptOcr = async (receiptId: string): Promise<LatestReceiptOcr | null> => {
  try {
    await initDatabase();

    const row = await queryOne<any>(
      `SELECT
        original_text as originalText,
        edited_text as editedText,
        raw_result_json as rawResultJson,
        engine,
        confidence,
        created_at as createdAt
      FROM ocr_data
      WHERE receipt_id = ?
      ORDER BY created_at DESC
      LIMIT 1;`,
      [receiptId],
    );

    if (!row) return null;
    return row as LatestReceiptOcr;
  } catch (error) {
    console.error('Database error (getLatestReceiptOcr):', error);
    throw new Error('Failed to get receipt OCR');
  }
};

export const getReceiptImagesByReceiptId = async (receiptId: string): Promise<ReceiptImage[]> => {
  try {
    await initDatabase();

    const rows = await queryAll<any>(
      `SELECT
        id,
        receipt_id as receiptId,
        image_type as imageType,
        file_path as filePath,
        part_number as partNumber,
        created_at as createdAt
      FROM receipt_images
      WHERE receipt_id = ?
      ORDER BY
        CASE image_type
          WHEN 'original' THEN 0
          WHEN 'enhanced' THEN 1
          WHEN 'thumbnail' THEN 2
          WHEN 'part' THEN 3
          ELSE 99
        END,
        COALESCE(part_number, 0) ASC,
        created_at ASC;`,
      [receiptId],
    );

    return rows as ReceiptImage[];
  } catch (error) {
    console.error('Database error (getReceiptImagesByReceiptId):', error);
    throw new Error('Failed to get receipt images');
  }
};

export const getReceiptItemsByReceiptId = async (receiptId: string, limit = 500): Promise<ReceiptItem[]> => {
  try {
    await initDatabase();

    const rows = await queryAll<any>(
      `SELECT
         id,
         receipt_id as receiptId,
         item_name as itemName,
         item_name_normalized as itemNameNormalized,
         quantity,
         unit_price as unitPrice,
         total_price as totalPrice,
         item_confidence as itemConfidence,
         created_at as createdAt
       FROM receipt_items
       WHERE receipt_id = ?
       ORDER BY created_at ASC
       LIMIT ?;`,
      [receiptId, limit],
    );

    return rows as ReceiptItem[];
  } catch (error) {
    console.error('Database error (getReceiptItemsByReceiptId):', error);
    throw new Error('Failed to get receipt items');
  }
};
