import { extractReceiptData } from '@/services/scan/receiptParser';

describe('extractReceiptData', () => {
  test('extracts merchant/date/total and basic line items', () => {
    const text = [
      'WALMART SUPERCENTER',
      '01/15/2026  2:34PM',
      'Milk 3.99',
      'Bread 2.49',
      'Eggs 4.50',
      'SUBTOTAL 10.98',
      'TAX 0.88',
      'TOTAL 11.86',
      'Thank you!',
    ].join('\n');

    const extracted = extractReceiptData(text);

    expect(extracted.merchant).toMatch(/walmart/i);
    expect(typeof extracted.amount).toBe('string');
    expect(extracted.amount).toBe('11.86');

    expect(Array.isArray(extracted.items)).toBe(true);
    expect(extracted.items?.length).toBeGreaterThanOrEqual(2);

    const names = (extracted.items ?? []).map((i) => i.name.toLowerCase());
    expect(names).toEqual(expect.arrayContaining(['milk', 'bread', 'eggs']));

    expect(extracted.subtotal).toBe('10.98');
    expect(extracted.tax).toBe('0.88');
  });

  test('categorizes groceries when merchant matches', () => {
    const text = ['KROGER', 'TOTAL 9.99'].join('\n');
    const extracted = extractReceiptData(text);
    expect(extracted.categoryId).toBe('groceries');
  });
});
