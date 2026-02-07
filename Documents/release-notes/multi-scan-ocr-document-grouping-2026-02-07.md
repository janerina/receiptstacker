# Multi Scan OCR + grouped document review (2026-02-07)

## Summary
- Fixed Multi Scan persistence so **every scanned page** is saved as its own receipt row immediately.
- When **Scan Only is OFF**, Multi Scan now runs **OCR per page immediately** after each page is saved, ensuring consistent saved OCR data.
- Improved later review/edit by showing all pages in the same scan “document” group from the Receipt Details screen.

## Added and updated components
- Scan flow (Multi Scan save + per-page OCR + stable document grouping):
  - `src/screens/main/ScanScreen.tsx`
- Receipt details (show pages for the same `documentId`):
  - `src/screens/main/ReceiptDetailScreen.tsx`
- Database helper (fetch receipts by `document_id`):
  - `src/services/database.ts`

## Notes
- Jest suite passed after changes (`npm test`).
