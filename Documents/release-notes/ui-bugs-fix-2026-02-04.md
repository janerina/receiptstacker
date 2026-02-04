# UI bug fixes (2026-02-04)

## Summary
A batch of UI/UX fixes across Tags, Categories, Scanned Receipts, Add Manually (receipt image), Misc Spend, Analytics, and Settings.

## Changes
- Tags & Categories: filter icon updated to funnel-style for consistency.
- Scanned Receipts: filter segment labels and amount chips no longer overflow; text scales down to fit.
- Add Manually: “Camera” now opens device camera directly for attaching a receipt image (better error handling).
- Misc Spend: header “+” reliably opens Quick Add.
- Analytics: month/year dropdown scrolling no longer fights the page scroll (nested scroll handling).
- Settings: removed “Manage security settings” row.

## Tests
- Jest: `npm test -- --runInBand`

## Notes
- Android `assembleRelease` may require local signing config; debug build remains the primary validation gate for this change set.
