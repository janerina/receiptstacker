import TextRecognition from '@react-native-ml-kit/text-recognition';

import type { OcrBoundingBox, OcrLayout, OcrLine, OcrResult, OcrWord } from './types';
import { extractReceiptData } from './receiptParser';

const median = (values: number[]): number | undefined => {
  const nums = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!nums.length) return undefined;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
};

const mergeBoxes = (boxes: Array<OcrBoundingBox | undefined>): OcrBoundingBox | undefined => {
  const b = boxes.filter(Boolean) as OcrBoundingBox[];
  if (!b.length) return undefined;
  return {
    left: Math.min(...b.map((x) => x.left)),
    top: Math.min(...b.map((x) => x.top)),
    right: Math.max(...b.map((x) => x.right)),
    bottom: Math.max(...b.map((x) => x.bottom)),
  };
};

const buildReceiptLayoutFromLines = (lines: OcrLine[]): OcrLayout | undefined => {
  if (!Array.isArray(lines) || !lines.length) return undefined;

  const withBox = lines
    .map((l, idx) => {
      const box = l.boundingBox;
      if (!box) return { idx, line: l, hasBox: false as const };
      const height = Math.max(1, box.bottom - box.top);
      const centerY = (box.top + box.bottom) / 2;
      return { idx, line: l, hasBox: true as const, box, height, centerY };
    })
    .filter((x) => x.hasBox) as Array<{
    idx: number;
    line: OcrLine;
    hasBox: true;
    box: OcrBoundingBox;
    height: number;
    centerY: number;
  }>;

  const noBox = lines.filter((l) => !l.boundingBox);

  if (!withBox.length) {
    return { lines };
  }

  const medHeight = median(withBox.map((x) => x.height)) ?? 16;
  const rowThreshold = Math.max(6, medHeight * 0.6);

  const sorted = withBox
    .slice()
    .sort((a, b) => (a.centerY - b.centerY) || (a.box.left - b.box.left) || (a.idx - b.idx));

  type Row = {
    centerY: number;
    height: number;
    parts: Array<{ line: OcrLine; box: OcrBoundingBox; idx: number; height: number; centerY: number }>;
  };

  const rows: Row[] = [];

  for (const s of sorted) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(s.centerY - last.centerY) > rowThreshold) {
      rows.push({
        centerY: s.centerY,
        height: s.height,
        parts: [{ line: s.line, box: s.box, idx: s.idx, height: s.height, centerY: s.centerY }],
      });
      continue;
    }

    // Add to the current row and update row center.
    last.parts.push({ line: s.line, box: s.box, idx: s.idx, height: s.height, centerY: s.centerY });
    const newCenter =
      last.parts.reduce((acc, p) => acc + p.centerY, 0) / Math.max(1, last.parts.length);
    last.centerY = newCenter;
    last.height = median(last.parts.map((p) => p.height)) ?? last.height;
  }

  const mergedLines: OcrLine[] = rows.map((row) => {
    const parts = row.parts
      .slice()
      .sort((a, b) => (a.box.left - b.box.left) || (a.idx - b.idx));

    const text = parts
      .map((p) => (typeof p.line.text === 'string' ? p.line.text.trim() : ''))
      .filter(Boolean)
      .join(' ');

    const words: OcrWord[] = parts
      .flatMap((p) => p.line.words ?? [])
      .slice()
      .sort((a, b) => {
        const ab = a.boundingBox;
        const bb = b.boundingBox;
        if (ab && bb) return (ab.top - bb.top) || (ab.left - bb.left);
        return 0;
      });

    const confidence = averageConfidence([
      ...parts.map((p) => p.line.confidence),
      ...words.map((w) => w.confidence),
    ]);

    return {
      text,
      words,
      confidence,
      boundingBox: mergeBoxes(parts.map((p) => p.line.boundingBox)),
    };
  });

  // Preserve any lines that lack a bounding box (rare), appended in original order.
  const finalLines = mergedLines.concat(noBox);
  return { lines: finalLines };
};

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

const normalizeConfidence01 = (v: number): number => {
  // Some wrappers expose confidence in 0..1, others 0..100.
  const n = v > 1 ? v / 100 : v;
  return Math.max(0, Math.min(1, n));
};

const averageConfidence = (values: Array<number | undefined>): number | undefined => {
  const nums = values
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .map(normalizeConfidence01);
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

          const confidence =
            toNumber(el?.confidence) ??
            toNumber(el?.confidenceScore) ??
            toNumber(el?.score) ??
            toNumber(el?.probability);
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

      const lineConfidence =
        toNumber(l?.confidence) ??
        toNumber(l?.confidenceScore) ??
        toNumber(l?.score) ??
        toNumber(l?.probability) ??
        averageConfidence(words.map((w) => w.confidence));
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

  const rawText =
    typeof result === 'string'
      ? result
      : typeof result?.text === 'string'
        ? result.text
        : Array.isArray(result)
          ? result.join('\n')
          : '';

  let rawResultJson: string | undefined;

  // Build a layout and then derive a "receipt-ordered" version of the text
  // using bounding boxes (top-to-bottom, left-to-right) so the output matches
  // the receipt visually.
  const parsedLayout = tryBuildLayoutFromMlKitResult(result);
  const layout = parsedLayout?.lines?.length ? buildReceiptLayoutFromLines(parsedLayout.lines) : parsedLayout;
  const text = layout?.lines?.length ? layout.lines.map((l) => l.text).join('\n') : rawText;
  const confidence = averageConfidence(layout?.lines.map((l) => l.confidence) ?? []);

  try {
    // Keep the original response, but also include a normalized payload so we can
    // restore confidence/layout later without changing DB schema.
    rawResultJson = JSON.stringify({ result, rawText, normalized: { layout, confidence } });
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
