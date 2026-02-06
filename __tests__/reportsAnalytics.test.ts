import { buildReportDataFromReceipts, calculateSummary, type ReceiptLike } from '@/utils/reportsAnalytics';

describe('reportsAnalytics', () => {
  test('empty receipts produce zeroed report data', () => {
    const now = new Date('2026-02-04T12:00:00.000Z');
    const receipts: ReceiptLike[] = [];

    const data = buildReportDataFromReceipts('Monthly', receipts, now);
    const summary = calculateSummary(data);

    expect(data).toHaveLength(7);
    expect(summary.totalSpending).toBe(0);
    expect(summary.totalReceipts).toBe(0);
    expect(summary.avgSpending).toBe(0);
    expect(summary.topCategory.name).toBe('N/A');
  });
});
