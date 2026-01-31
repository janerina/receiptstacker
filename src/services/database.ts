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

import SQLite, { type ResultSet, type SQLiteDatabase } from 'react-native-sqlite-storage';

// Enable promise-based API.
SQLite.enablePromise(true);

export interface Receipt {
  id: string;
  merchant: string;
  amount: number;
  date: string; // ISO string
  categoryId: string;
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

type Db = SQLiteDatabase;

const DB_NAME = 'receiptstacker.db' as const;
const DB_LOCATION = 'default' as const;

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
      merchant TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      category_id TEXT NOT NULL,
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

  idxReceiptItemsNormalized: `
    CREATE INDEX IF NOT EXISTS idx_receipt_items_normalized ON receipt_items(item_name_normalized);
  `,
  idxReceiptItemsReceiptId: `
    CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON receipt_items(receipt_id);
  `,
  idxReceiptsDate: `
    CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);
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
      if (version === 0) {
        await exec(SCHEMA.categories);
        await exec(SCHEMA.receipts);
        await exec(SCHEMA.budgets);
        await exec(SCHEMA.tags);
        await exec(SCHEMA.receiptTags);
        await exec(SCHEMA.receiptItems);
        await exec(SCHEMA.ocrData);
        await exec(SCHEMA.receiptImages);
        await exec(SCHEMA.idxReceiptItemsNormalized);
        await exec(SCHEMA.idxReceiptItemsReceiptId);
        await exec(SCHEMA.idxReceiptsDate);
        await seedDefaultCategories();
        await setUserVersion(2);
        return;
      }

      if (version === 1) {
        await exec(SCHEMA.receiptItems);
        await exec(SCHEMA.ocrData);
        await exec(SCHEMA.receiptImages);
        await exec(SCHEMA.idxReceiptItemsNormalized);
        await exec(SCHEMA.idxReceiptItemsReceiptId);
        await exec(SCHEMA.idxReceiptsDate);
        await setUserVersion(2);
        return;
      }

      // Future: handle versioned migrations.
    } catch (error) {
      console.error('Database error (initDatabase):', error);
      throw new Error('Failed to initialize database');
    }
  })();

  return initPromise;
};

// --- Receipts CRUD ---

export const addReceipt = async (receipt: Receipt): Promise<string> => {
  try {
    await initDatabase();
    const createdAt = receipt.createdAt || nowIso();
    const updatedAt = receipt.updatedAt || createdAt;

    await exec(
      `INSERT INTO receipts
        (id, merchant, amount, date, category_id, payment_method, notes, image_uri, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        receipt.id,
        receipt.merchant,
        receipt.amount,
        receipt.date,
        receipt.categoryId,
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
       ORDER BY date DESC, created_at DESC;`,
    );
    return rows as Receipt[];
  } catch (error) {
    console.error('Database error (getReceipts):', error);
    throw new Error('Failed to get receipts');
  }
};

export const getReceiptById = async (id: string): Promise<Receipt | null> => {
  try {
    await initDatabase();
    return await queryOne<Receipt>(
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
       WHERE id = ?
       LIMIT 1;`,
      [id],
    );
  } catch (error) {
    console.error('Database error (getReceiptById):', error);
    throw new Error('Failed to get receipt');
  }
};

export const updateReceipt = async (id: string, receipt: Partial<Receipt>): Promise<void> => {
  try {
    await initDatabase();

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
       SET merchant = ?,
           amount = ?,
           date = ?,
           category_id = ?,
           payment_method = ?,
           notes = ?,
           image_uri = ?,
           updated_at = ?
       WHERE id = ?;`,
      [
        next.merchant,
        next.amount,
        next.date,
        next.categoryId,
        next.paymentMethod ?? null,
        next.notes ?? null,
        next.imageUri ?? null,
        next.updatedAt,
        id,
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
    await exec('DELETE FROM receipts WHERE id = ?;', [id]);
  } catch (error) {
    console.error('Database error (deleteReceipt):', error);
    throw new Error('Failed to delete receipt');
  }
};

export const getReceiptsByDateRange = async (start: Date, end: Date): Promise<Receipt[]> => {
  try {
    await initDatabase();
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
       WHERE date BETWEEN ? AND ?
       ORDER BY date DESC;`,
      [startIso, endIso],
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
       WHERE category_id = ?
       ORDER BY date DESC;`,
      [categoryId],
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

export const searchReceiptItems = async (query: string, limit = 100): Promise<ItemSearchRow[]> => {
  try {
    await initDatabase();

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
      WHERE ri.item_name_normalized LIKE ?
      ORDER BY r.date DESC
      LIMIT ?;`,
      [`%${normalized}%`, limit],
    );

    return rows;
  } catch (error) {
    console.error('Database error (searchReceiptItems):', error);
    throw new Error('Failed to search receipt items');
  }
};
