export const normalizeMiscSpendCategoryId = (categoryId: string): string => {
  const raw = String(categoryId ?? '');
  return raw.startsWith('rcpt-') ? raw.slice('rcpt-'.length) : raw;
};
