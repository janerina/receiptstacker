# Budget Custom Range + Calendar Picker (2026-02-04)

## Summary
- Replaced the rolling/wheel date picker with a month-grid calendar for date selection (shared DatePickerModal).
- Budget Manager: added a dedicated **Custom Date Range** card (Start/End) for the Custom tab.
- Budget Manager: prevented NaN% by coercing stored budget amounts to numbers and guarding percent math.

## Details
- Date picking
  - `DatePickerModal` now renders a `react-native-calendars` month grid when `mode === "date"`.
  - Time/datetime modes continue using the existing wheel picker.

- Budget Manager (Custom)
  - Shows "Custom Budget" in the summary card and displays the selected custom date range.
  - Provides Start Date / End Date selectors that open the calendar modal.
  - Enforces sensible range behavior (start can’t be after end; end can’t be before start).

## Testing
- `npm test`
- Android `./gradlew assembleRelease`
