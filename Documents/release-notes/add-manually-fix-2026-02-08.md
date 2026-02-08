# Add Manually fix (2026-02-08)

## Summary
- Fixed Add Receipt category dropdown not showing newly created categories by syncing Categories to SQLite and loading category options from SQLite in Add Receipt.
- Fixed missing/duplicate “Groceries” category behavior by ensuring SQLite default categories are always seeded (including Groceries).
- Fixed Receipt Details edit taps (Date/Category) being unreliable while the keyboard is open by allowing taps to persist, and refreshed category options on focus.
- Added a dedicated Add Receipt “Scan Only” camera flow (single-page, no OCR) with a lightweight review screen, plus Android fallback capture for reliability.
- Fixed an Android launch crash caused by an undefined theme variable in the guided tour modal.

## Added and updated components
- Updated: Add Receipt (manual) category selection
- Updated: Categories management → SQLite category sync
- Updated: Receipt Details edit pickers (date/category) reliability
- Updated: SQLite default category seeding
- Added: Add Receipt scan-only screen (no OCR)
- Updated: Guided tour modal crash fix
- Updated: Navigation types/routes for scan-only screen

## Files changed
- src/services/database.ts
- src/screens/features/CategoriesScreen.tsx
- src/screens/features/AddManuallyScreen.tsx
- src/screens/features/AddReceiptScanOnlyScreen.tsx
- src/screens/main/ReceiptDetailScreen.tsx
- src/components/tour/GuidedTourModal.tsx
- src/navigation/types.ts
- src/navigation/MainNavigator.tsx
- src/navigation/HomeStackNavigator.tsx
- Documents/release-notes/add-manually-fix-2026-02-08.md
