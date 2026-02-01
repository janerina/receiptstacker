import { calculateWarrantyStatus } from '../src/utils/warrantyAlerts';

describe('calculateWarrantyStatus', () => {
  test('marks expired when negative days', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    const expiry = '2026-01-09T00:00:00.000Z';
    expect(calculateWarrantyStatus(expiry, now).status).toBe('expired');
  });

  test('marks critical within 7 days', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    const expiry = '2026-01-11T00:00:00.000Z';
    expect(calculateWarrantyStatus(expiry, now).status).toBe('critical');
  });

  test('marks warning within 30 days', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    const expiry = '2026-02-05T00:00:00.000Z';
    expect(calculateWarrantyStatus(expiry, now).status).toBe('warning');
  });

  test('marks active beyond 30 days', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    const expiry = '2026-03-15T00:00:00.000Z';
    expect(calculateWarrantyStatus(expiry, now).status).toBe('active');
  });
});
