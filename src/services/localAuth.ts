import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOCAL_AUTH_KEYS = {
  ACCOUNT: '@local_account',
} as const;

export type RecoverySetup = {
  pin?: string; // digits; app UI commonly uses 6 (legacy 4 supported)
  // Legacy single-question fields (kept for backward compatibility)
  securityQuestion?: string;
  securityAnswer?: string;

  // Preferred multi-question setup (Security Setup screen)
  securityQuestions?: Array<{ question: string; answer: string }>;

  // Recovery passphrase/phrase (can be auto-generated or user-defined)
  recoveryPhrase?: string;
};

export type LocalAccount = {
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  password: string;
  recovery: RecoverySetup;
  createdAt: number;
  updatedAt: number;
};

const safeJsonParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const getLocalAccount = async (): Promise<LocalAccount | null> => {
  const raw = await AsyncStorage.getItem(LOCAL_AUTH_KEYS.ACCOUNT);
  return safeJsonParse<LocalAccount>(raw);
};

const saveLocalAccount = async (account: LocalAccount): Promise<void> => {
  await AsyncStorage.setItem(LOCAL_AUTH_KEYS.ACCOUNT, JSON.stringify(account));
};

export const getAccountForEmail = async (email: string): Promise<LocalAccount | null> => {
  const existing = await getLocalAccount();
  if (!existing) return null;
  if (normalizeEmail(existing.user.email) !== normalizeEmail(email)) return null;
  return existing;
};

export const createRecoveryPhrase = (): string => {
  // Local-only, human-copyable; not cryptographically strong.
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RS-${part()}-${part()}-${part()}-${part()}`;
};

export const registerLocalAccount = async (params: {
  name: string;
  email: string;
  password: string;
  recovery?: RecoverySetup;
}): Promise<LocalAccount> => {
  const name = params.name.trim();
  const email = normalizeEmail(params.email);

  const existing = await getLocalAccount();
  if (existing && normalizeEmail(existing.user.email) === email) {
    throw new Error('An account with this email already exists');
  }

  const now = Date.now();
  const account: LocalAccount = {
    user: {
      id: String(now),
      name,
      email,
    },
    password: params.password,
    recovery: {
      ...params.recovery,
    },
    createdAt: now,
    updatedAt: now,
  };

  await saveLocalAccount(account);
  return account;
};

export const verifyLocalLogin = async (email: string, password: string): Promise<LocalAccount> => {
  const account = await getAccountForEmail(email);
  if (!account) throw new Error('No local account found for this email');
  if (account.password !== password) throw new Error('Invalid email or password');
  return account;
};

export const updateLocalPassword = async (email: string, newPassword: string): Promise<void> => {
  const account = await getAccountForEmail(email);
  if (!account) throw new Error('No local account found for this email');

  const updated: LocalAccount = {
    ...account,
    password: newPassword,
    updatedAt: Date.now(),
  };

  await saveLocalAccount(updated);
};

export const updateRecoverySetup = async (email: string, next: RecoverySetup): Promise<LocalAccount> => {
  const account = await getAccountForEmail(email);
  if (!account) throw new Error('No local account found for this email');

  const updated: LocalAccount = {
    ...account,
    recovery: {
      ...account.recovery,
      ...next,
    },
    updatedAt: Date.now(),
  };

  await saveLocalAccount(updated);
  return updated;
};

export const verifyRecoveryPin = async (email: string, pin: string): Promise<void> => {
  const account = await getAccountForEmail(email);
  if (!account) throw new Error('No local account found for this email');

  const saved = account.recovery.pin;
  if (!saved) throw new Error('No recovery PIN is set up for this account');
  if (saved !== pin) throw new Error('Invalid recovery PIN');
};

export const verifyRecoveryAnswer = async (email: string, answer: string): Promise<void> => {
  const account = await getAccountForEmail(email);
  if (!account) throw new Error('No local account found for this email');

  const normalizedAnswer = answer.trim().toLowerCase();
  if (!normalizedAnswer) throw new Error('Please enter your answer');

  const multi = account.recovery.securityQuestions;
  if (multi && multi.length > 0) {
    const anyMatch = multi.some((qa) => qa.answer.trim().toLowerCase() === normalizedAnswer);
    if (!anyMatch) throw new Error('Incorrect answer');
    return;
  }

  const saved = account.recovery.securityAnswer;
  if (!saved) throw new Error('No security answer is set up for this account');

  const normalizedSaved = saved.trim().toLowerCase();
  if (normalizedSaved !== normalizedAnswer) throw new Error('Incorrect answer');
};

export const verifyRecoveryPhrase = async (email: string, phrase: string): Promise<void> => {
  const account = await getAccountForEmail(email);
  if (!account) throw new Error('No local account found for this email');

  const saved = account.recovery.recoveryPhrase;
  if (!saved) throw new Error('No recovery phrase is set up for this account');

  const normalizedSaved = saved.trim().toUpperCase();
  const normalizedPhrase = phrase.trim().toUpperCase();
  if (normalizedSaved !== normalizedPhrase) throw new Error('Invalid recovery phrase');
};
