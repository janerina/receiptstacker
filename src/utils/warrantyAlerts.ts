export type WarrantyStatus = 'critical' | 'warning' | 'active' | 'expired';

export const calculateWarrantyStatus = (
  expiryDateIso: string,
  now: Date = new Date(),
): { status: WarrantyStatus; daysRemaining: number } => {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDateIso);
  expiry.setHours(0, 0, 0, 0);

  const diffTime = expiry.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) return { status: 'expired', daysRemaining };
  if (daysRemaining <= 7) return { status: 'critical', daysRemaining };
  if (daysRemaining <= 30) return { status: 'warning', daysRemaining };
  return { status: 'active', daysRemaining };
};
