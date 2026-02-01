# Currency implementation

## Summary
- Added app-wide multi-currency support with auto-detection (device locale → best-effort currency mapping).
- Introduced a global Currency context/provider with persisted selection via AsyncStorage.
- Expanded the currency selector in Profile to a 150+ currency database with search and popular quick picks.
- Updated remaining hardcoded `$` displays to use the new global currency formatter.

## Added components / modules
- `src/contexts/CurrencyContext.tsx` — Global currency provider + `useCurrency` hook (auto-detect + persistence).
- `src/utils/currencies.ts` — 150+ currency database + helpers (names, symbols, locale→currency detection).
- `src/utils/currencyManager.ts` — Central active currency/locale state + `formatMoney` helper.

## Updated components / modules
- `src/contexts/index.tsx` — Wired `CurrencyProvider` into `AppProviders` and re-exported the context.
- `src/utils/format.ts` — `formatCurrency()` now formats using the active currency/locale.
- `src/screens/main/ProfileScreen.tsx` — Currency selector upgraded (search + popular picks) and hooked to CurrencyContext.
- `src/screens/main/AnalyticsScreen.tsx` — Removed remaining hardcoded `$` chart labels.
- `src/screens/main/ScanSessionReviewScreen.tsx` — Removed hardcoded `$` and formats parsed OCR amounts.
- `src/screens/main/WarrantyAlertsScreen.tsx` — Purchase amount formatting uses `formatCurrency()`.

## Notes
- If a stored currency is missing/invalid, the app falls back to auto-detect (then to `USD`).
