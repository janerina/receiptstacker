export type AccuracyLevelFilter = 'all' | 'high' | 'medium' | 'low';

export type AccuracyBucket = 'high' | 'medium' | 'low' | 'unknown';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export const confidenceToPct = (c?: number | null): number | null => {
  if (typeof c !== 'number' || !Number.isFinite(c)) return null;
  // Some engines return 0..1, some 0..100. Normalize.
  const pct = c <= 1 ? c * 100 : c;
  return clamp(pct, 0, 100);
};

export const getAccuracyBucketFromPct = (pct?: number | null): AccuracyBucket => {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return 'unknown';
  if (pct >= 85) return 'high';
  if (pct >= 70) return 'medium';
  return 'low';
};

export const matchesAccuracyFilter = (pct: number | null, filter: AccuracyLevelFilter): boolean => {
  if (filter === 'all') return true;
  const bucket = getAccuracyBucketFromPct(pct);
  return bucket === filter;
};

export const getAccuracyIconForBucket = (bucket: AccuracyBucket): string => {
  switch (bucket) {
    case 'high':
      return '✅';
    case 'medium':
      return '⚠️';
    case 'low':
      return '❌';
    case 'unknown':
    default:
      return '—';
  }
};

export const getAccuracyLabelForBucket = (bucket: AccuracyBucket): string => {
  switch (bucket) {
    case 'high':
      return 'High Confidence';
    case 'medium':
      return 'Medium Confidence';
    case 'low':
      return 'Low Confidence';
    case 'unknown':
    default:
      return 'Unknown';
  }
};

export type ScanModeFilter = 'all' | 'single' | 'multi' | 'long';

export const normalizeScanMode = (scanMode?: string | null, partCount?: number): 'single' | 'multi' | 'long' | null => {
  if (scanMode === 'single' || scanMode === 'multi' || scanMode === 'long') return scanMode;
  if (typeof partCount === 'number' && partCount > 0) return 'long';
  return null;
};

export const getScanModeLabel = (scanMode?: string | null, partCount?: number): string => {
  const mode = normalizeScanMode(scanMode, partCount);
  if (mode === 'long') return `Long Receipt${partCount && partCount > 0 ? ` (${partCount} parts)` : ''}`;
  if (mode === 'multi') return 'Multi-page';
  if (mode === 'single') return 'Single Page';
  return 'Scan Mode Unknown';
};
