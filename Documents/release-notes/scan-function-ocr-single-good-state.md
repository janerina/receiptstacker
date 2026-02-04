# Scan function with OCR — single scan (good state)

Date: 2026-02-03

## Summary
This check-in stabilizes the single-receipt scan flow end-to-end:
- Creates a draft receipt immediately after scan so the capture is never “lost”.
- Saves the actual receipt image, raw OCR output, parsed receipt metadata, and extracted line items into local SQLite.
- Adds an industry-standard OCR review flow (accept/reject/edit) and a clear success message guiding users where to find the saved receipt.
- Removes mock/fictitious receipt data paths so the UI reflects real receipts only.

## What’s new / updated (components)

### Scan & OCR flow
- Scan screen: draft persistence, saving image before OCR, improved processing status messaging.
- OCR recognition: better confidence extraction/normalization across ML Kit result shapes.
- OCR editor: accept/reject actions; on accept, saves edited OCR + parsed fields + items and shows success actions.

### Data persistence (SQLite)
- OCR: raw OCR JSON + text stored in `ocr_data` (latest row used for summaries).
- Parsed metadata: stored in `receipt_parsed` (subtotal, tax, store/payment fields, etc.).
- Line items: stored in `receipt_items` and available immediately after scan (best-effort extraction).
- Receipt images: stored in `receipt_images` and displayed in Receipt Details.

### Scanned Receipts list
- Always allows OCR review when OCR exists (even if confidence is unavailable).
- Displays OCR percentage when available and shows an estimated percentage otherwise.
- More accurate status signals: Pending (no OCR), Review (OCR exists), Processed (edited OCR or items saved).

### Receipt Details
- Loads real receipt + image from SQLite.
- Shows “Extracted from OCR” section (accuracy, subtotal, tax, item count, store/payment metadata).
- Shows extracted items list.
- Includes a direct “Review / Edit OCR” action.

### Mock data removal
- Removes mock receipt fallback paths so screens render real stored data only.
- Adds cleanup for legacy mock receipt records in AsyncStorage.

## Files changed (high-level)
- Navigation: registers OCR editor route so it can be reached from scan and from history.
- Screens: Scan, OCR editor, Scanned Receipts, Receipt Details, Analytics.
- Services: SQLite database layer, OCR and receipt parsing.

## How to verify (quick manual test)
1. Scan (single) a receipt.
2. Confirm you see saving/OCR processing status.
3. OCR editor opens: edit text if needed; Reject deletes draft; Accept saves and shows success message.
4. Tap “View Receipt”: Receipt Details shows image + OCR-extracted fields and items.
5. Go to “Scanned Receipts”: entry shows OCR status and allows “Review OCR”.
