# Item Search filter inline layout fix (2026-02-04)

## Summary
Fixes the inline layout so the funnel filter button stays visible next to the Item Search box on smaller widths.

## Changes
- Item Search: search bar now flexes/shrinks; filter button no longer gets pushed off-screen.

## Tests
- Jest: `npm test -- --runInBand`
