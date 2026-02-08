import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVE_USER_ID_KEY = 'receiptstacker.activeUserId' as const;

let cachedActiveUserId: string | null | undefined;

export const setActiveUserIdForStorage = (userId: string | null): void => {
  cachedActiveUserId = userId ?? null;
};

export const getActiveUserIdForStorage = async (): Promise<string | null> => {
  if (cachedActiveUserId !== undefined) return cachedActiveUserId;

  try {
    const v = await AsyncStorage.getItem(ACTIVE_USER_ID_KEY);
    cachedActiveUserId = v ?? null;
    return cachedActiveUserId;
  } catch {
    cachedActiveUserId = null;
    return null;
  }
};

export const makeUserScopedKey = (baseKey: string, userId: string | null): string => {
  if (!userId) return baseKey;
  return `${baseKey}::${userId}`;
};

export const getUserScopedKeyForActiveUser = async (baseKey: string): Promise<string | null> => {
  const userId = await getActiveUserIdForStorage();
  if (!userId) return null;
  return makeUserScopedKey(baseKey, userId);
};

export const migrateLegacyUnscopedKeyToActiveUser = async (baseKey: string): Promise<void> => {
  const userId = await getActiveUserIdForStorage();
  if (!userId) return;

  const scopedKey = makeUserScopedKey(baseKey, userId);
  if (scopedKey === baseKey) return;

  try {
    const [scopedValue, legacyValue] = await AsyncStorage.multiGet([scopedKey, baseKey]).then((pairs) => pairs.map(([, v]) => v));

    if (scopedValue == null && legacyValue != null) {
      await AsyncStorage.multiSet([[scopedKey, legacyValue]]);
      await AsyncStorage.removeItem(baseKey);
    }
  } catch {
    // non-fatal
  }
};
