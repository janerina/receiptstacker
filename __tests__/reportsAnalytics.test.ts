import { buildMockReportData, calculateSummary } from '@/utils/reportsAnalytics';

describe('reportsAnalytics', () => {
  test('mock monthly data matches screenshot totals', () => {
    const data = buildMockReportData('Monthly');
    const summary = calculateSummary(data);

    expect(Math.round(summary.totalSpending)).toBe(9000);
    expect(summary.totalReceipts).toBe(216);
    expect(Math.round(summary.avgSpending)).toBe(1286);

    // Jan vs Dec: (1240-1580)/1580 = -21.518%
    expect(summary.trend.isPositive).toBe(false);
    expect(summary.trend.percentage).toBeCloseTo(21.5, 1);

    expect(summary.topCategory.name).toBe('Groceries');
    expect(summary.topCategory.percentage).toBeCloseTo(38, 0);
  });
});
