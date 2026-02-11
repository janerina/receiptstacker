import { isBackupDue } from '@/services/backupRestore/scheduler';

describe('backup scheduler', () => {
  test('isBackupDue returns true when never run', () => {
    expect(isBackupDue({ nowMs: Date.now(), lastRunAtMs: null, frequency: 'daily' })).toBe(true);
  });

  test('daily is not due on same local day', () => {
    const now = new Date(2026, 0, 15, 10, 0, 0, 0).getTime();
    const last = new Date(2026, 0, 15, 2, 0, 0, 0).getTime();
    expect(isBackupDue({ nowMs: now, lastRunAtMs: last, frequency: 'daily' })).toBe(false);
  });

  test('daily is due on next local day', () => {
    const now = new Date(2026, 0, 16, 1, 0, 0, 0).getTime();
    const last = new Date(2026, 0, 15, 23, 59, 0, 0).getTime();
    expect(isBackupDue({ nowMs: now, lastRunAtMs: last, frequency: 'daily' })).toBe(true);
  });

  test('weekly is not due within same ISO week', () => {
    // Mon and Wed of the same ISO week.
    const last = new Date(2026, 0, 5, 3, 0, 0, 0).getTime(); // Mon
    const now = new Date(2026, 0, 7, 3, 0, 0, 0).getTime(); // Wed
    expect(isBackupDue({ nowMs: now, lastRunAtMs: last, frequency: 'weekly' })).toBe(false);
  });

  test('weekly is due across ISO week boundary', () => {
    const last = new Date(2026, 0, 4, 3, 0, 0, 0).getTime(); // Sun
    const now = new Date(2026, 0, 5, 3, 0, 0, 0).getTime(); // Mon (next ISO week)
    expect(isBackupDue({ nowMs: now, lastRunAtMs: last, frequency: 'weekly' })).toBe(true);
  });

  test('monthly is not due in same month', () => {
    const last = new Date(2026, 0, 2, 3, 0, 0, 0).getTime();
    const now = new Date(2026, 0, 31, 3, 0, 0, 0).getTime();
    expect(isBackupDue({ nowMs: now, lastRunAtMs: last, frequency: 'monthly' })).toBe(false);
  });

  test('monthly is due in next month', () => {
    const last = new Date(2026, 0, 31, 3, 0, 0, 0).getTime();
    const now = new Date(2026, 1, 1, 3, 0, 0, 0).getTime();
    expect(isBackupDue({ nowMs: now, lastRunAtMs: last, frequency: 'monthly' })).toBe(true);
  });
});
