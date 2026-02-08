/**
 * Formatting utilities (currency, date, numbers).
 */

import { formatMoney } from './currencyManager';

/**
 * Currency: 1234.56 → "$1,234.56"
 *
 * Notes:
 * - Uses `Intl.NumberFormat` when available.
 * - Falls back to a safe string format.
 */
export const formatCurrency = (amount: number): string => {
  return formatMoney(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const toDate = (value: Date | string): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  // Handle date-only strings as LOCAL dates (JS otherwise treats YYYY-MM-DD as UTC).
  // This avoids off-by-one-day issues when displaying dates in the device timezone.
  const trimmed = String(value).trim();
  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.exec(trimmed);
  if (dateOnlyMatch) {
    const [yyyy, mm, dd] = trimmed.split('-').map((n) => Number(n));
    if (yyyy && mm && dd) {
      const dLocal = new Date(yyyy, mm - 1, dd);
      return Number.isNaN(dLocal.getTime()) ? null : dLocal;
    }
  }

  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Date: Date → "Jan 15, 2024" or "January 15, 2024"
 */
export const formatDate = (date: Date | string, format: 'short' | 'long' = 'short'): string => {
  const d = toDate(date);
  if (!d) return '';

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: format === 'short' ? 'short' : 'long',
      day: '2-digit',
      year: 'numeric',
    }).format(d);
  } catch {
    // Basic fallback.
    const month = d.toLocaleString('en-US', { month: format === 'short' ? 'short' : 'long' });
    return `${month} ${d.getDate()}, ${d.getFullYear()}`;
  }
};

/**
 * Number abbreviation: 1500 → "1.5K", 1500000 → "1.5M"
 */
export const abbreviateNumber = (num: number): string => {
  if (!Number.isFinite(num)) return '0';

  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);

  const format = (value: number, suffix: string) => {
    const fixed = value >= 10 ? value.toFixed(0) : value.toFixed(1);
    const cleaned = fixed.replace(/\.0$/, '');
    return `${sign}${cleaned}${suffix}`;
  };

  if (abs < 1000) return `${num}`;
  if (abs < 1_000_000) return format(abs / 1000, 'K');
  if (abs < 1_000_000_000) return format(abs / 1_000_000, 'M');
  if (abs < 1_000_000_000_000) return format(abs / 1_000_000_000, 'B');
  return format(abs / 1_000_000_000_000, 'T');
};

/**
 * Relative time: Date → "2 hours ago", "Yesterday"
 */
export const getRelativeTime = (date: Date | string): string => {
  const d = toDate(date);
  if (!d) return '';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);

  // Future dates
  if (diffSec < 0) {
    const ahead = Math.abs(diffSec);
    if (ahead < 60) return 'In a moment';
    const minutes = Math.round(ahead / 60);
    return `In ${minutes} min`;
  }

  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec} sec ago`;

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return diffMin === 1 ? '1 min ago' : `${diffMin} min ago`;

  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  const diffWeeks = Math.round(diffDays / 7);
  if (diffWeeks < 5) return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;

  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;

  const diffYears = Math.round(diffDays / 365);
  return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
};
