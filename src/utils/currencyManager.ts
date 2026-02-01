type FormatMoneyOptions = {
  currency?: string;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

let activeCurrency = 'USD';
let activeLocale = 'en-US';

export const setActiveCurrency = (code: string) => {
  activeCurrency = (code ?? '').toUpperCase() || 'USD';
};

export const setActiveLocale = (locale: string) => {
  activeLocale = (locale ?? '').replace('_', '-') || 'en-US';
};

export const getActiveCurrency = () => activeCurrency;
export const getActiveLocale = () => activeLocale;

export const formatMoney = (amount: number, options: FormatMoneyOptions = {}): string => {
  const safe = Number.isFinite(amount) ? amount : 0;
  const currency = (options.currency ?? activeCurrency ?? 'USD').toUpperCase();
  const locale = (options.locale ?? activeLocale ?? 'en-US').replace('_', '-');

  const minimumFractionDigits = options.minimumFractionDigits ?? 2;
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits,
      minimumFractionDigits,
    }).format(safe);
  } catch {
    const sign = safe < 0 ? '-' : '';
    const abs = Math.abs(safe);
    return `${sign}${currency} ${abs.toFixed(maximumFractionDigits)}`;
  }
};
