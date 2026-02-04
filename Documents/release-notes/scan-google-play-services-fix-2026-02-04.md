# Scan: Google Play services error handling (2026-02-04)

## Summary
- Fixed Android Edge Sense scanner failing with a generic Google Play services "Something went wrong" screen.

## What changed
- Added a Google Play services availability pre-check inside `react-native-document-scanner-plugin` (Android) before launching the ML Kit document scanner.
- When Play services are missing/disabled/updating, the scan now fails fast and can be handled in JS (the app already prompts to use Manual mode).

## Notes
- This change is delivered via `patch-package` so it persists across installs.

## Testing
- `npm test`
- Android `./gradlew assembleRelease`
