# UI navigation & layout fixes (2026-02-04)

## Summary
Small UI polish changes for Item Search and Scanned Receipts.

## Changes
- Item Search: funnel-style filter icon; filter button moved inline with the search input.
- Scanned Receipts: removed the duplicate in-screen bottom menu (only the main app tab bar remains).

## Tests
- Jest: `npm test -- --runInBand`
- Android: `cd android; .\\gradlew assembleRelease`
