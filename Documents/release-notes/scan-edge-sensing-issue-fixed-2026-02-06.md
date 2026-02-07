# Scan edge sensing issue fixed (2026-02-06)

## Summary
- Restored Edge Sense usability in the scan flow by preventing the captured-pages thumbnail tray from overlapping the capture button in Multi/Long modes.
- Improved native document scanner reliability by fully unmounting VisionCamera while the native Edge Sense scanner is open (avoids Android camera contention).
- Slightly increased the Android camera-release delay before launching the native scanner.

## Updated components
- Scan flow UI + camera/scanner handoff:
  - `src/screens/main/ScanScreen.tsx`

## Notes
- Jest suite passed after changes (`npm test`).
