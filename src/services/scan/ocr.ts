import TextRecognition from '@react-native-ml-kit/text-recognition';

import type { OcrBoundingBox, OcrLayout, OcrLine, OcrResult, OcrWord } from './types';
import { extractReceiptData } from './receiptParser';

const toNumber = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const toBoundingBox = (maybe: any): OcrBoundingBox | undefined => {
  if (!maybe || typeof maybe !== 'object') return undefined;

  // Common shapes across ML Kit wrappers.
  // - { left, top, right, bottom }
  // - { x, y, width, height }
  // - { origin: {x,y}, size: {width,height} }
  const left = toNumber(maybe.left ?? maybe.x ?? maybe?.origin?.x);
  const top = toNumber(maybe.top ?? maybe.y ?? maybe?.origin?.y);
  const right = toNumber(maybe.right);
  const bottom = toNumber(maybe.bottom);
  const width = toNumber(maybe.width ?? maybe?.size?.width);
  const height = toNumber(maybe.height ?? maybe?.size?.height);

  if (left !== undefined && top !== undefined && right !== undefined && bottom !== undefined) {
    return { left, top, right, bottom };
  }

  if (left !== undefined && top !== undefined && width !== undefined && height !== undefined) {
    return { left, top, right: left + width, bottom: top + height };
  }

  return undefined;
};

const averageConfidence = (values: Array<number | undefined>): number | undefined => {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return undefined;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.max(0, Math.min(1, avg));
};

const tryBuildLayoutFromMlKitResult = (result: any): OcrLayout | undefined => {
  if (!result || typeof result !== 'object') return undefined;

  const blocks: any[] =
    (Array.isArray(result.blocks) && result.blocks) ||
    (Array.isArray(result.textBlocks) && result.textBlocks) ||
    (Array.isArray(result.blocksList) && result.blocksList) ||
    [];

  if (!blocks.length) return undefined;

  const linesOut: OcrLine[] = [];

  for (const b of blocks) {
    const lines: any[] =
      (Array.isArray(b?.lines) && b.lines) ||
      (Array.isArray(b?.line) && b.line) ||
      (Array.isArray(b?.textLines) && b.textLines) ||
      [];

    for (const l of lines) {
      const elements: any[] =
        (Array.isArray(l?.elements) && l.elements) ||
        (Array.isArray(l?.words) && l.words) ||
        (Array.isArray(l?.components) && l.components) ||
        [];

      const words: OcrWord[] = elements
        .map((el) => {
          const text = typeof el?.text === 'string' ? el.text : typeof el?.value === 'string' ? el.value : '';
          if (!text) return null;

          const confidence = toNumber(el?.confidence);
          const box = toBoundingBox(el?.boundingBox ?? el?.frame ?? el?.rect ?? el);
          return { text, confidence, boundingBox: box } satisfies OcrWord;
        })
        .filter(Boolean) as OcrWord[];

      const lineText =
        typeof l?.text === 'string'
          ? l.text
          : words.length
            ? words.map((w) => w.text).join(' ')
            : '';

      if (!lineText.trim()) continue;

      const lineConfidence = toNumber(l?.confidence) ?? averageConfidence(words.map((w) => w.confidence));
      const lineBox = toBoundingBox(l?.boundingBox ?? l?.frame ?? l?.rect ?? l);

      linesOut.push({
        text: lineText,
        words,
        confidence: lineConfidence,
        boundingBox: lineBox,
      });
    }
  }

  return linesOut.length ? { lines: linesOut } : undefined;
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
  const layout = tryBuildLayoutFromMlKitResult(result);
  const confidence = averageConfidence(layout?.lines.map((l) => l.confidence) ?? []);

  try {
    // Keep the original response, but also include a normalized payload so we can
    // restore confidence/layout later without changing DB schema.
    rawResultJson = JSON.stringify({ result, normalized: { layout, confidence } });
  } catch {
    rawResultJson = undefined;
  }

  const extracted = extractReceiptData(text, layout);

  return {
    text,
    rawResultJson,
    engine: 'mlkit',
    processingTimeMs: Date.now() - start,
    confidence,
    layout,
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
