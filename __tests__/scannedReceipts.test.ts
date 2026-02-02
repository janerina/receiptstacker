import {
  confidenceToPct,
  getAccuracyBucketFromPct,
  getScanModeLabel,
  matchesAccuracyFilter,
  normalizeScanMode,
} from '@/utils/scannedReceipts';

describe('scannedReceipts utils', () => {
  test('confidenceToPct normalizes 0..1 and clamps', () => {
    expect(confidenceToPct(null)).toBeNull();
    expect(confidenceToPct(undefined)).toBeNull();
    expect(confidenceToPct(NaN)).toBeNull();

    expect(confidenceToPct(0.87)).toBeCloseTo(87);
    expect(confidenceToPct(87)).toBeCloseTo(87);
    expect(confidenceToPct(-10)).toBe(0);
    expect(confidenceToPct(999)).toBe(100);
  });

  test('getAccuracyBucketFromPct uses expected thresholds', () => {
    expect(getAccuracyBucketFromPct(null)).toBe('unknown');
    expect(getAccuracyBucketFromPct(100)).toBe('high');
    expect(getAccuracyBucketFromPct(85)).toBe('high');
    expect(getAccuracyBucketFromPct(84.99)).toBe('medium');
    expect(getAccuracyBucketFromPct(70)).toBe('medium');
    expect(getAccuracyBucketFromPct(69.99)).toBe('low');
    expect(getAccuracyBucketFromPct(0)).toBe('low');
  });

  test('matchesAccuracyFilter matches by bucket', () => {
    expect(matchesAccuracyFilter(90, 'all')).toBe(true);
    expect(matchesAccuracyFilter(90, 'high')).toBe(true);
    expect(matchesAccuracyFilter(90, 'medium')).toBe(false);

    expect(matchesAccuracyFilter(80, 'medium')).toBe(true);
    expect(matchesAccuracyFilter(60, 'low')).toBe(true);

    // Unknown bucket should never match high/medium/low
    expect(matchesAccuracyFilter(null, 'all')).toBe(true);
    expect(matchesAccuracyFilter(null, 'high')).toBe(false);
  });

  test('normalizeScanMode falls back to long when partCount exists', () => {
    expect(normalizeScanMode('single', 3)).toBe('single');
    expect(normalizeScanMode(null, 0)).toBeNull();
    expect(normalizeScanMode(undefined, 2)).toBe('long');
    expect(normalizeScanMode('weird', 2)).toBe('long');
  });

  test('getScanModeLabel includes parts for long receipts', () => {
    expect(getScanModeLabel('single', 0)).toBe('Single Page');
    expect(getScanModeLabel('multi', 0)).toBe('Multi-page');
    expect(getScanModeLabel('long', 3)).toBe('Long Receipt (3 parts)');
    expect(getScanModeLabel(undefined, 2)).toBe('Long Receipt (2 parts)');
  });
});
