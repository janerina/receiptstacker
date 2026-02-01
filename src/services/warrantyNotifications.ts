import {
  addNotification,
  archiveWarrantyAlert,
  getWarrantyAlerts,
  updateWarrantyAlert,
  type NotificationKind,
  type WarrantyAlert,
} from '@/services/database';

const MS_DAY = 24 * 60 * 60 * 1000;

const daysUntil = (iso: string, now = new Date()): number => {
  const t = new Date(iso).getTime();
  return Math.ceil((t - now.getTime()) / MS_DAY);
};

const THRESHOLDS: Array<{ days: number; bit: number }> = [
  { days: 7, bit: 1 },
  { days: 3, bit: 2 },
  { days: 1, bit: 4 },
  { days: 0, bit: 8 },
];

const kindTitle = (alert: WarrantyAlert): { kind: NotificationKind; title: string } => {
  return {
    kind: 'warranty',
    title: alert.alertType === 'return' ? 'Return Window Expiring' : 'Warranty Expiring',
  };
};

const formatMessage = (alert: WarrantyAlert, remainingDays: number): string => {
  const label = alert.alertType === 'return' ? 'Return window' : 'Warranty';
  if (remainingDays <= 0) return `${label} for ${alert.title} expires today`;
  if (remainingDays === 1) return `${label} for ${alert.title} expires in 1 day`;
  return `${label} for ${alert.title} expires in ${remainingDays} days`;
};

/**
 * Creates in-app notifications for warranty/return alerts at 7/3/1/0 days.
 * Also auto-archives expired alerts.
 */
export const syncWarrantyAlertNotifications = async (): Promise<void> => {
  const now = new Date();
  const alerts = await getWarrantyAlerts({ includeInactive: false });

  for (const alert of alerts) {
    const remaining = daysUntil(alert.expiryDate, now);

    // Auto-mark expired as inactive (matches Prompt 34).
    if (remaining < 0) {
      await archiveWarrantyAlert(alert.id);
      continue;
    }

    for (const t of THRESHOLDS) {
      if (remaining !== t.days) continue;
      if ((alert.notifiedMask & t.bit) !== 0) continue;

      const meta = kindTitle(alert);
      await addNotification({
        kind: meta.kind,
        title: meta.title,
        message: formatMessage(alert, remaining),
        route: 'WarrantyAlerts',
        payloadJson: JSON.stringify({ warrantyAlertId: alert.id }),
      });

      await updateWarrantyAlert(alert.id, { notifiedMask: (alert.notifiedMask ?? 0) | t.bit });
    }
  }
};

export const getWarrantyAlertRemainingDays = (alert: WarrantyAlert, now = new Date()): number => {
  return daysUntil(alert.expiryDate, now);
};
