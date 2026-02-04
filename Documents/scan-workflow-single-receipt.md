# Single Receipt Scan Workflow (Capture → OCR → Review → Save)

This document describes the **single receipt capture** flow in ReceiptStacker, including what gets persisted, when it becomes searchable, and how to recover/edit OCR later.

## Goals

- Never “lose” a scan after pressing **Next** in the native scanner.
- Always provide an **OCR review/edit** step with an accuracy/confidence indicator.
- Ensure the user can **re-open OCR later** to correct text so items/tax/etc can be made searchable.

## Screens & Responsibilities

- **Scan** ([src/screens/main/ScanScreen.tsx](../src/screens/main/ScanScreen.tsx))
  - Opens the native document scanner (Edge Sense).
  - For **single** mode: creates a **draft** receipt in SQLite immediately, then runs OCR and opens the OCR editor.

- **OCR Editor** ([src/screens/main/ReceiptTextEditorScreen.tsx](../src/screens/main/ReceiptTextEditorScreen.tsx))
  - Displays OCR text (receipt-like view when layout is available).
  - Shows a confidence percentage + highlights low-confidence lines.
  - On **Continue**: persists OCR edits (best-effort) and navigates to Add Receipt.

- **Add Receipt** ([src/screens/features/AddManuallyScreen.tsx](../src/screens/features/AddManuallyScreen.tsx))
  - Final user-facing entry of merchant/date/amount/items.
  - On **Save**: writes to AsyncStorage receipts and mirrors to SQLite (receipt + items + OCR + images).
  - When launched from scanning/OCR, it reuses the existing `receiptId` so the draft becomes the final record.

- **Scanned Receipts** ([src/screens/features/ScannedReceiptsScreen.tsx](../src/screens/features/ScannedReceiptsScreen.tsx))
  - Lists scanned receipts from SQLite.
  - Provides **Open OCR Editor** (reopens OCR for review/edit) using saved `ocr_data` + `receipt_images`.

## Data Persistence (SQLite)

Tables used:

- `receipts` – core receipt row (merchant, amount, date, scan_mode, image_uri, etc.)
- `receipt_images` – stored image paths (original + optional parts)
- `ocr_data` – OCR snapshots (original + edited + confidence + raw JSON)
- `receipt_items` – extracted/confirmed line items (what powers Item Search + comparisons)

### When data is written

1) **Immediately after capture** (single scan)
   - Create draft row in `receipts`
   - Save `receipt_images` (original image)

2) **After OCR completes**
   - Insert a row into `ocr_data` (engine + confidence + raw JSON)

3) **After user reviews text and continues**
   - Insert another `ocr_data` row with `edited_text` (best-effort)

4) **After user saves in Add Receipt**
   - Update/insert `receipts` (merchant/amount/category/payment/notes)
   - Replace `receipt_items` for the receipt
   - Save OCR again if provided (keeps history)
   - Replace `receipt_images`

## Searchability & “Done” criteria

- A receipt becomes visible in **Scanned Receipts** as soon as the draft is created (even before OCR).
- A receipt becomes searchable in **Item Search / price comparison** once `receipt_items` are saved (usually after Add Receipt Save).
- OCR accuracy indicators are available as soon as `ocr_data` exists.

## Recovery / Edit Later

If the user doesn’t finish Add Receipt:

- The receipt still exists as a SQLite draft.
- The user can open **Scanned Receipts → Open OCR Editor** to re-check / edit OCR.
- From OCR Editor, **Continue** takes them back into Add Receipt using the same `receiptId`.

## Common failure handling

- If OCR fails (e.g., emulator missing ML Kit dependencies):
  - The app alerts the user and routes to Add Receipt manual entry.
  - The captured image is still preserved via the draft.
