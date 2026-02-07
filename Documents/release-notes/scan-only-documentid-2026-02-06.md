# Scan Only + documentId scan flow updates (2026-02-06)

## Summary
- Added a persisted **Scan Only** toggle to the Scan screen, allowing users to save scans without running OCR immediately.
- Linked scanned pages/parts under a shared `documentId` so multi/long scans can be grouped reliably.
- Updated the scan review modals to show **Retake + Done** when Scan Only is enabled, otherwise **Retake + OCR**.
- Repaired a JSX regression in the scan preview modals that was breaking Jest parsing.

## Added and updated components
- Scan UI + flow logic:
  - `src/screens/main/ScanScreen.tsx`
- Storage (Scan Only preference):
  - `src/services/storage.ts`
- Database schema + migration (receipt `document_id`):
  - `src/services/database.ts`

## Notes
- Jest suite passed after changes (`npm test`).
- `npm run lint` currently reports pre-existing lint errors in other files.
