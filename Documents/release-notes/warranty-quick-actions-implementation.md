# Warranty Quick Actions implementation

## Summary
- Home: Quick Actions opens Warranty & Return Alerts screen; quick action label updated.
- Home: Weekly spend tile is now the blue card; monthly spend remains the second card.
- Home: Added receipt counts to weekly/monthly stat tiles.
- Settings: "Manage security settings" navigation hardened.
- Settings: App Tour is now a toggle to simulate first-time tour replay.
- Add Receipt: Notes textbox (multiline) is now fully tappable/usable.

## Added/Updated components

### Updated
- src/screens/main/HomeScreen.tsx
- src/screens/main/WarrantyAlertsScreen.tsx
- src/screens/main/ProfileScreen.tsx
- src/components/common/Input.tsx
- src/services/database.ts

### Added
- src/utils/warrantyAlerts.ts
- __tests__/warrantyAlerts.test.ts

## Tests
- npm test
