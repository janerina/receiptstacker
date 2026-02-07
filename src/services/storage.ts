/*
 * ReceiptStacker AsyncStorage layer.
 *
 * AsyncStorage is used for small key/value data:
 * - auth token
 * - user
 * - onboarding flag
 * - theme + settings
 * - biometric enabled flag
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  AUTH_TOKEN: '@auth_token',
  USER: '@user',
  ONBOARDING_COMPLETED: '@onboarding_completed',
  TOUR_COMPLETED: '@tour_completed',
  TOUR_REQUESTED: '@tour_requested',
  TOUR_STAGE: '@tour_stage',
  THEME: '@theme',
  SETTINGS: '@settings',
  BIOMETRIC_ENABLED: '@biometric_enabled',
  SCAN_ONLY: '@scan_only',
} as const;

export type AppTourStage = 'home' | 'scan' | 'analytics' | 'calendar' | 'profile';

const isValidTourStage = (value: string): value is AppTourStage => {
  return value === 'home' || value === 'scan' || value === 'analytics' || value === 'calendar' || value === 'profile';
};

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface AppSettings {
  notifications: boolean;
  biometricEnabled: boolean;
  currency: string;
  language: string;
}

// --- Scan ---

export const saveScanOnlyPreference = async (scanOnly: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SCAN_ONLY, scanOnly ? 'true' : 'false');
  } catch (error) {
    console.error('Storage error (saveScanOnlyPreference):', error);
    // Non-fatal: do not block scan.
  }
};

export const getScanOnlyPreference = async (): Promise<boolean | null> => {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEYS.SCAN_ONLY);
    if (v === null) return null;
    return v === 'true';
  } catch (error) {
    console.error('Storage error (getScanOnlyPreference):', error);
    return null;
  }
};

const safeJsonParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

// --- Auth ---

export const saveAuthToken = async (token: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
  } catch (error) {
    console.error('Storage error (saveAuthToken):', error);
    throw new Error('Failed to save auth token');
  }
};

export const getAuthToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  } catch (error) {
    console.error('Storage error (getAuthToken):', error);
    return null;
  }
};

export const removeAuthToken = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  } catch (error) {
    console.error('Storage error (removeAuthToken):', error);
    throw new Error('Failed to remove auth token');
  }
};

export const saveUser = async (user: User): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  } catch (error) {
    console.error('Storage error (saveUser):', error);
    throw new Error('Failed to save user');
  }
};

export const getUser = async (): Promise<User | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER);
    return safeJsonParse<User>(raw);
  } catch (error) {
    console.error('Storage error (getUser):', error);
    return null;
  }
};

export const removeUser = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.USER);
  } catch (error) {
    console.error('Storage error (removeUser):', error);
    throw new Error('Failed to remove user');
  }
};

// --- Settings ---

export const saveOnboardingCompleted = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETED, 'true');
  } catch (error) {
    console.error('Storage error (saveOnboardingCompleted):', error);
    throw new Error('Failed to save onboarding state');
  }
};

export const isOnboardingCompleted = async (): Promise<boolean> => {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETED);
    return v === 'true';
  } catch (error) {
    console.error('Storage error (isOnboardingCompleted):', error);
    return false;
  }
};

// --- Tour / Tutorial ---

export const saveTourCompleted = async (completed: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.TOUR_COMPLETED, completed ? 'true' : 'false');
  } catch (error) {
    console.error('Storage error (saveTourCompleted):', error);
    throw new Error('Failed to save tour state');
  }
};

export const isTourCompleted = async (): Promise<boolean> => {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEYS.TOUR_COMPLETED);
    return v === 'true';
  } catch (error) {
    console.error('Storage error (isTourCompleted):', error);
    return false;
  }
};

export const requestTourStart = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.TOUR_REQUESTED, 'true');
  } catch (error) {
    console.error('Storage error (requestTourStart):', error);
    throw new Error('Failed to request tour start');
  }
};

export const consumeTourStartRequest = async (): Promise<boolean> => {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEYS.TOUR_REQUESTED);
    if (v === 'true') {
      await AsyncStorage.removeItem(STORAGE_KEYS.TOUR_REQUESTED);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Storage error (consumeTourStartRequest):', error);
    return false;
  }
};

export const setTourStage = async (stage: AppTourStage): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.TOUR_STAGE, stage);
  } catch (error) {
    console.error('Storage error (setTourStage):', error);
    throw new Error('Failed to set tour stage');
  }
};

export const getTourStage = async (): Promise<AppTourStage | null> => {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEYS.TOUR_STAGE);
    if (!v) return null;
    return isValidTourStage(v) ? v : null;
  } catch (error) {
    console.error('Storage error (getTourStage):', error);
    return null;
  }
};

export const clearTourStage = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.TOUR_STAGE);
  } catch (error) {
    console.error('Storage error (clearTourStage):', error);
    // non-fatal
  }
};

export const startFullAppTour = async (): Promise<void> => {
  await saveTourCompleted(false);
  await setTourStage('home');
  // Keep the existing request flag so Home can start immediately.
  await requestTourStart();
};

export const saveTheme = async (theme: 'light' | 'dark'): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.THEME, theme);
  } catch (error) {
    console.error('Storage error (saveTheme):', error);
    throw new Error('Failed to save theme');
  }
};

export const getTheme = async (): Promise<'light' | 'dark'> => {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEYS.THEME);
    return v === 'dark' ? 'dark' : 'light';
  } catch (error) {
    console.error('Storage error (getTheme):', error);
    return 'light';
  }
};

export const saveSettings = async (settings: AppSettings): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (error) {
    console.error('Storage error (saveSettings):', error);
    throw new Error('Failed to save settings');
  }
};

export const getSettings = async (): Promise<AppSettings | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
    return safeJsonParse<AppSettings>(raw);
  } catch (error) {
    console.error('Storage error (getSettings):', error);
    return null;
  }
};

export const saveBiometricEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.BIOMETRIC_ENABLED, enabled ? 'true' : 'false');
  } catch (error) {
    console.error('Storage error (saveBiometricEnabled):', error);
    throw new Error('Failed to save biometric preference');
  }
};

export const isBiometricEnabled = async (): Promise<boolean> => {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEYS.BIOMETRIC_ENABLED);
    return v === 'true';
  } catch (error) {
    console.error('Storage error (isBiometricEnabled):', error);
    return false;
  }
};

// --- Clear ---

export const clearAllStorage = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
  } catch (error) {
    console.error('Storage error (clearAllStorage):', error);
    throw new Error('Failed to clear storage');
  }
};
