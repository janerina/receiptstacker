# Scan & OCR implementation

## Summary
- Completed end-to-end **Scan → OCR → Review/Edit → Save** flow with SQLite persistence.
- Supports **Single**, **Multi-page**, and **Long receipt (multipart)** capture flows with pre-OCR review (reorder/remove/clear).
- ML Kit OCR now carries **confidence + best-effort layout metadata** through to the editor.
- Added receipt-like editor UX with **per-line editing** and **low-confidence highlighting**, plus raw-text fallback.
- Added **structured receipt extraction** (items/subtotal/tax/category) from OCR and prefills Add Receipt so Item Search / Price Comparison has data without manual entry.
- Added **retry OCR**, **copy**, and **export** actions from the editor.
- Improved manual camera UX with **zoom**, **grid overlay**, **long-receipt overlap guide**, and **cancelable processing**.

## Added components / modules
- `src/services/scan/receiptParser.ts` — Best-effort receipt parsing for merchant/date/totals/items/category from OCR text.
- `__tests__/receiptParser.test.ts` — Parser coverage.

## Updated components / screens
- `src/screens/main/ScanScreen.tsx`
  - Multi/Long pre-OCR review modal (reorder/remove/clear).
  - Manual-mode scan aids: zoom control, grid overlay, overlap guide for long receipts.
  - Cancelable OCR processing overlay.
- `src/screens/main/ScanSessionReviewScreen.tsx` — Passes OCR confidence/layout into editor.
- `src/screens/main/ReceiptTextEditorScreen.tsx`
  - Receipt-format editing mode with confidence-based highlighting + raw fallback.
  - Copy / Export / Retry OCR actions.
  - Recomputes extracted data from edited text.
- `src/screens/features/AddManuallyScreen.tsx` — Prefills items + category from OCR extraction and persists to SQLite.

## Updated services / types
- `src/services/scan/ocr.ts` — OCR normalization (layout/confidence) + structured extraction via `receiptParser`.
- `src/services/scan/types.ts` — Expanded OCR/extraction types (layout/confidence + extracted items/totals/category).
- `src/navigation/types.ts` — Updated route params for OCR metadata into editor.

## Tests
- `npm test` (Jest) passes, including `__tests__/receiptParser.test.ts`.
