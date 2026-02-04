import type { OcrExtractedData, OcrLayout } from './types';

type ParsedMoney = { value: number; text: string };

type ParsedLineItem = {
  name: string;
  totalPrice: number;
  unitPrice?: number;
  quantity?: number;
  confidence?: number;
};

const normalizeSpaces = (s: string) => s.replace(/\s+/g, ' ').trim();

const toMoneyText = (n: number) => {
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
};

const parseMoney = (raw: string): ParsedMoney | null => {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return { value: n, text: toMoneyText(n) };
};

const likelyMerchantLine = (line: string) => {
  const t = normalizeSpaces(line).toLowerCase();
  if (!t) return false;
  if (t.length < 2) return false;
  if (/\bthank\s*you\b/.test(t)) return false;
  if (/\btotal\b|\bsubtotal\b|\btax\b/.test(t)) return false;
  if (/\$\s*\d/.test(t)) return false;
  if (/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(t)) return false;
  return true;
};

const extractMerchant = (lines: string[]) => {
  for (const l of lines) {
    if (likelyMerchantLine(l)) return normalizeSpaces(l);
  }
  return lines[0] ? normalizeSpaces(lines[0]) : '';
};

const extractDate = (text: string): string => {
  const t = String(text ?? '');

  // Common numeric formats.
  const numeric = t.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/);
  if (numeric?.[1]) {
    const d = new Date(numeric[1]);
    return Number.isNaN(d.getTime()) ? numeric[1] : d.toISOString();
  }

  // Month name formats.
  const monthName = t.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{2,4}\b/i);
  if (monthName?.[0]) {
    const d = new Date(monthName[0]);
    return Number.isNaN(d.getTime()) ? monthName[0] : d.toISOString();
  }

  return '';
};

const extractTotals = (lines: string[]) => {
  const joined = lines.join('\n');

  const findLastMoneyAfterLabel = (label: RegExp) => {
    const candidates = lines
      .slice()
      .reverse()
      .filter((l) => label.test(l) && /\d+\.\d{2}/.test(l));

    for (const line of candidates) {
      const m = line.match(/(-?\$?\s*\d+\.\d{2})/g);
      if (!m?.length) continue;
      const last = m[m.length - 1];
      const money = parseMoney(last);
      if (money) return money;
    }

    return null;
  };

  const total =
    findLastMoneyAfterLabel(/\bgrand\s*total\b/i) ??
    findLastMoneyAfterLabel(/\btotal\b/i) ??
    (() => {
      // Fallback: max amount seen.
      const matches = joined.match(/-?\$?\s*\d+\.\d{2}/g) ?? [];
      const nums = matches
        .map((m) => parseMoney(m)?.value)
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      if (!nums.length) return null;
      const max = Math.max(...nums);
      return { value: max, text: toMoneyText(max) };
    })();

  const subtotal = findLastMoneyAfterLabel(/\bsub\s*total\b|\bsubtotal\b/i);
  const tax = findLastMoneyAfterLabel(/\btax\b/i);

  return { total, subtotal, tax };
};

const isTotalsLike = (t: string) => /\b(total|subtotal|sub\s*total|tax|change|cash|visa|mastercard|amex|debit|credit)\b/i.test(t);

const parseLineItemsFromLines = (lines: string[], layout?: OcrLayout): ParsedLineItem[] => {
  const clean = lines.map((l) => normalizeSpaces(l)).filter(Boolean);

  // Use a rough range: items are usually after header and before totals.
  const endIdx = (() => {
    const idx = clean.findIndex((l) => /\bsubtotal\b|\btotal\b/i.test(l));
    return idx >= 0 ? idx : clean.length;
  })();

  const itemLines = clean.slice(0, endIdx);

  const items: ParsedLineItem[] = [];

  for (let i = 0; i < itemLines.length; i += 1) {
    const line = itemLines[i];
    if (!line) continue;

    // Skip typical header-ish lines.
    if (/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/.test(line)) continue;
    if (/\b(\d{1,2}:\d{2})\b/.test(line)) continue;
    if (/\b(store|st\.?|ave\.?|road|rd\.?|blvd|suite|phone|tel|cashier|reg|register|trans)\b/i.test(line)) continue;

    // Common: "Item Name    $3.99" or "Item Name 3.99"
    const m = line.match(/^(.+?)\s+(-?\$?\d+\.\d{2})\s*([A-Z])?$/);
    if (!m) continue;

    const nameRaw = m[1] ?? '';
    const moneyRaw = m[2] ?? '';

    const name = normalizeSpaces(nameRaw);
    if (!name || name.length < 2) continue;
    if (isTotalsLike(name)) continue;

    const price = parseMoney(moneyRaw);
    if (!price || price.value <= 0) continue;

    let quantity: number | undefined;
    let unitPrice: number | undefined;

    const next = itemLines[i + 1] ?? '';
    const qtyAt = next.match(/^(\d+)\s*@\s*\$?\s*(\d+\.\d{2})/i);
    if (qtyAt) {
      const q = Number.parseInt(qtyAt[1], 10);
      const u = parseMoney(qtyAt[2])?.value;
      if (Number.isFinite(q) && q > 0) quantity = q;
      if (typeof u === 'number' && Number.isFinite(u) && u > 0) unitPrice = u;
    }

    let confidence: number | undefined;
    if (layout?.lines?.length) {
      // Best-effort: match by exact text.
      const found = layout.lines.find((l) => normalizeSpaces(l.text) === line);
      if (typeof found?.confidence === 'number' && Number.isFinite(found.confidence)) confidence = found.confidence;
    }

    items.push({
      name,
      totalPrice: price.value,
      quantity,
      unitPrice,
      confidence,
    });
  }

  // De-dupe obvious repeats (common in long receipts merging).
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = `${it.name.toLowerCase()}|${toMoneyText(it.totalPrice)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const categorize = (merchant: string, items: ParsedLineItem[]): { id?: string; name?: string } => {
  const m = (merchant ?? '').toLowerCase();
  const all = `${m} ${items.map((i) => i.name.toLowerCase()).join(' ')}`;

  const hasAny = (words: string[]) => words.some((w) => all.includes(w));

  if (hasAny(['walmart', 'kroger', 'safeway', 'costco', 'whole foods', 'trader joe', 'aldi', 'grocery'])) {
    return { id: 'groceries', name: 'Groceries' };
  }
  if (hasAny(['shell', 'chevron', 'exxon', 'bp', 'fuel', 'gas'])) {
    return { id: 'transport', name: 'Transportation' };
  }
  if (hasAny(['restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'grill', 'diner', 'starbucks', 'mcdonald'])) {
    return { id: 'food', name: 'Food & Drink' };
  }
  if (hasAny(['cvs', 'walgreens', 'rite aid', 'pharmacy'])) {
    return { id: 'health', name: 'Healthcare' };
  }
  if (hasAny(['best buy', 'apple', 'electronics'])) {
    return { id: 'shopping', name: 'Shopping' };
  }

  return {};
};

const firstMatch = (lines: string[], re: RegExp): string | undefined => {
  for (const l of lines) {
    const m = l.match(re);
    if (m) return (m[1] ?? m[0]) as string;
  }
  return undefined;
};

const extractStoreNumber = (lines: string[]): string | undefined => {
  const m = firstMatch(lines, /\bstore\s*(?:#|no\.?|number)?\s*[:#-]?\s*(\d{2,8})\b/i);
  return m ? String(m).trim() : undefined;
};

const extractCashierName = (lines: string[]): string | undefined => {
  const m = firstMatch(lines, /\b(?:cashier|clerk|server|associate)\b\s*[:#-]?\s*([a-z][a-z\s.'-]{1,30})$/i);
  return m ? String(m).trim() : undefined;
};

const extractPaymentMethod = (raw: string): string | undefined => {
  const t = String(raw ?? '').toLowerCase();
  if (!t.trim()) return undefined;

  const has = (re: RegExp) => re.test(t);
  if (has(/\bapple\s*pay\b/)) return 'Apple Pay';
  if (has(/\bgoogle\s*pay\b/)) return 'Google Pay';
  if (has(/\bvisa\b/)) return 'Visa';
  if (has(/\bmaster\s*card\b|\bmastercard\b/)) return 'Mastercard';
  if (has(/\bamex\b|\bamerican\s*express\b/)) return 'American Express';
  if (has(/\bdiscover\b/)) return 'Discover';
  if (has(/\bdebit\b/)) return 'Debit';
  if (has(/\bcredit\b/)) return 'Credit';
  if (has(/\bcash\b/)) return 'Cash';
  return undefined;
};

const extractTotalItems = (raw: string): number | undefined => {
  const t = String(raw ?? '').toLowerCase();
  const m = t.match(/\b(\d{1,4})\s*(?:items?|item\s*sold|items\s*sold)\b/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
};

const extractStoreAddress = (lines: string[]): string | undefined => {
  const re = /\b(\d{1,6}\s+[a-z0-9][a-z0-9\s.'-]{2,40}\s+(?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|hwy|highway|pkwy|parkway)\b.*)$/i;
  const m = firstMatch(lines, re);
  return m ? String(m).trim() : undefined;
};

export const extractReceiptData = (text: string, layout?: OcrLayout): OcrExtractedData & {
  items?: Array<{
    name: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice: number;
    confidence?: number;
  }>;
  subtotal?: string;
  tax?: string;
} => {
  const raw = String(text ?? '');
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const merchant = extractMerchant(lines);

  const { total, subtotal, tax } = extractTotals(lines);
  const amount = total?.text ?? '';

  const date = extractDate(raw);

  // Best-effort extended fields.
  const storeAddress = extractStoreAddress(lines);
  const storeNumber = extractStoreNumber(lines);
  const cashierName = extractCashierName(lines);
  const paymentMethod = extractPaymentMethod(raw);
  const totalItems = extractTotalItems(raw);
  const dateTime = date;

  const parsedItems = parseLineItemsFromLines(lines, layout);
  const category = categorize(merchant, parsedItems);

  return {
    merchant,
    amount,
    date,
    dateTime,
    storeAddress,
    storeNumber,
    cashierName,
    paymentMethod,
    totalItems,
    items: parsedItems.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
      confidence: it.confidence,
    })),
    subtotal: subtotal?.text ?? undefined,
    tax: tax?.text ?? undefined,
    categoryId: category.id,
    category: category.name,
  };
};
