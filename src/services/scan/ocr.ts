import TextRecognition from '@react-native-ml-kit/text-recognition';

import type { OcrResult } from './types';

const extractReceiptData = (text: string) => {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const merchant = lines[0] || '';

  // Prefer TOTAL-like patterns, fallback to max amount.
  const totalLine = lines
    .slice()
    .reverse()
    .find((l) => /\btotal\b/i.test(l) && /\d+\.\d{2}/.test(l));

  const amountRegex = /\$?\s*(\d+\.\d{2})/g;
  const readAmounts = (s: string) => {
    const matches = s.match(amountRegex) ?? [];
    return matches
      .map((a) => Number.parseFloat(a.replace(/[^0-9.]/g, '')))
      .filter((n) => Number.isFinite(n));
  };

  let amount = '';
  const totals = totalLine ? readAmounts(totalLine) : [];
  if (totals.length) amount = Math.max(...totals).toFixed(2);
  if (!amount) {
    const allAmounts = readAmounts(text);
    if (allAmounts.length) amount = Math.max(...allAmounts).toFixed(2);
  }

  const dateRegex = /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/g;
  const dateMatch = text.match(dateRegex);
  const date = dateMatch?.[0] ?? '';

  return { merchant, amount, date };
};

export const recognizeTextWithMlKit = async (imageUri: string): Promise<OcrResult> => {
  const start = Date.now();
  const result: any = await TextRecognition.recognize(imageUri);

  const text =
    typeof result === 'string'
      ? result
      : typeof result?.text === 'string'
        ? result.text
        : Array.isArray(result)
          ? result.join('\n')
          : '';

  let rawResultJson: string | undefined;
  try {
    rawResultJson = JSON.stringify(result);
  } catch {
    rawResultJson = undefined;
  }

  const extracted = extractReceiptData(text);

  return {
    text,
    rawResultJson,
    engine: 'mlkit',
    processingTimeMs: Date.now() - start,
    extracted,
  };
};

const splitLines = (t: string) =>
  t
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

export const mergeOcrTextsByLineOverlap = (parts: string[]): string => {
  const texts = parts.map((p) => p ?? '').filter(Boolean);
  if (!texts.length) return '';

  let acc = splitLines(texts[0]);

  for (const nextText of texts.slice(1)) {
    const nextLines = splitLines(nextText);

    let bestK = 0;
    const maxK = Math.min(6, acc.length, nextLines.length);
    for (let k = 1; k <= maxK; k += 1) {
      const aTail = acc.slice(-k).join('\n').toLowerCase();
      const bHead = nextLines.slice(0, k).join('\n').toLowerCase();
      if (aTail === bHead) bestK = k;
    }

    acc = acc.concat(nextLines.slice(bestK));
  }

  return acc.join('\n');
};
