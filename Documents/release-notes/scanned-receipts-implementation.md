# Scanned Receipts implementation

## Summary
- Added a dedicated **Scanned Receipts** screen backed by SQLite OCR data.
- Added inline search + filter panel matching the latest design direction.
- Improved search coverage to include tags (aggregated from SQLite receipt tags).
- Wired navigation routes and Home quick action entry.

## Added components / screens
- `src/screens/features/ScannedReceiptsScreen.tsx` — Scanned receipts list with inline filters.

## Updated components / modules
- `src/services/database.ts` — `getScannedReceiptSummaries()` enhanced (includes aggregated tag names via `tagsCsv`).
- `src/screens/main/HomeScreen.tsx` — Home quick action label updated to **Receipts** (routes to scanned receipts).
- `src/navigation/types.ts` — Added `ScannedReceipts` route types.
- `src/navigation/HomeStackNavigator.tsx` — Registered `ScannedReceipts` route.
- `src/navigation/MainNavigator.tsx` / `src/navigation/AppNavigator.tsx` — Registered `ScannedReceipts` modal route.
- `src/utils/reportsAnalytics.ts` and `src/screens/features/ReportsScreen.tsx` — Reports dashboard + analytics/export support (if included in this same merge).

## Tests
- `__tests__/reportsAnalytics.test.ts`
