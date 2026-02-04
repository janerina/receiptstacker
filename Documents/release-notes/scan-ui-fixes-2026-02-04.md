# Scan UI fixes (2026-02-04)

## Summary
- Date picker calendar modal: Cancel/Done buttons no longer get clipped on smaller screens.
- Scan tab: no longer auto-opens the Google/ML Kit document scanner on Android; the camera view opens normally.
- Scanned Receipts: OCR Accuracy tiles (High/Medium/Low/Long) now fit on one row.

## Details
- `DatePickerModal`
  - Constrains modal card height based on screen + safe areas.
  - Makes calendar area scroll/shrink so action buttons stay visible.

- `ScanScreen`
  - Default to Manual mode on Android.
  - Removed auto-launch of Edge Sense scanner when entering the screen or toggling Edge/Manual.

- `ScannedReceiptsScreen`
  - Tightened tile spacing/padding and enabled text auto-fit so 4 tiles stay in one line.

## Testing
- `npm test`
- Android `./gradlew assembleRelease`
