import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { STORAGE_KEYS } from '@/services/storage';
import { detectCurrencyCodeFromLocale, DEFAULT_CURRENCY_CODE, isSupportedCurrencyCode } from '@/utils/currencies';
import { formatMoney, setActiveCurrency, setActiveLocale } from '@/utils/currencyManager';

type CurrencyContextValue = {
  currency: string;
  locale: string;
  ready: boolean;
  setCurrency: (code: string) => Promise<void>;
  formatCurrency: (amount: number) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const safeJsonParseObject = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
};

const getDeviceLocale = (): string => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return typeof locale === 'string' && locale ? locale : 'en-US';
  } catch {
    return 'en-US';
  }
};

const patchSettingsCurrency = async (currency: string): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
    const base = safeJsonParseObject(raw) ?? {};
    const next = { ...base, currency };
    await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
  } catch {
    // Non-fatal
  }
};

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<string>(DEFAULT_CURRENCY_CODE);
  const [locale, setLocaleState] = useState<string>('en-US');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const init = async () => {
      const deviceLocale = getDeviceLocale();
      const normalizedLocale = deviceLocale.replace('_', '-');

      setActiveLocale(normalizedLocale);
      if (active) setLocaleState(normalizedLocale);

      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
        const settings = safeJsonParseObject(raw);
        const stored = typeof settings?.currency === 'string' ? settings.currency : null;
        const storedNormalized = stored ? stored.toUpperCase() : null;

        const detected = detectCurrencyCodeFromLocale(normalizedLocale);
        const chosen = storedNormalized && isSupportedCurrencyCode(storedNormalized) ? storedNormalized : detected;

        setActiveCurrency(chosen);
        if (active) setCurrencyState(chosen);

        if (!storedNormalized || storedNormalized !== chosen) {
          await patchSettingsCurrency(chosen);
        }
      } catch {
        const detected = detectCurrencyCodeFromLocale(normalizedLocale);
        setActiveCurrency(detected);
        if (active) setCurrencyState(detected);
      } finally {
        if (active) setReady(true);
      }
    };

    init().catch(() => {
      setActiveCurrency(DEFAULT_CURRENCY_CODE);
      setActiveLocale('en-US');
      if (active) {
        setCurrencyState(DEFAULT_CURRENCY_CODE);
        setLocaleState('en-US');
        setReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const setCurrency = useCallback(async (code: string) => {
    const normalized = (code ?? '').toUpperCase();
    if (!normalized) return;

    const next = isSupportedCurrencyCode(normalized) ? normalized : DEFAULT_CURRENCY_CODE;

    setCurrencyState(next);
    setActiveCurrency(next);
    await patchSettingsCurrency(next);
  }, []);

  const formatCurrency = useCallback(
    (amount: number) => {
      return formatMoney(amount, { currency, locale });
    },
    [currency, locale],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      locale,
      ready,
      setCurrency,
      formatCurrency,
    }),
    [currency, formatCurrency, locale, ready, setCurrency],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

export const useCurrency = (): CurrencyContextValue => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
};
