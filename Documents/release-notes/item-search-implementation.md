# Item Search implementation

## Summary
- Added a dedicated Item Search screen to search receipt line-items across all receipts.
- Supports fuzzy matching, store filtering, sorting (date/price/store/name), and a price comparison summary grouped by store.
- Uses SQLite-backed receipt items via a dedicated query for purchase rows.

## Added components / modules
- `src/screens/features/ItemSearchScreen.tsx` — Full Item Search UI (debounced search, filters, sort controls, comparison card, purchase list, empty/loading states).
- `src/utils/itemSearch.ts` — Normalization + fuzzy ranking, filter/sort utilities, and price comparison aggregation.
- `__tests__/itemSearch.test.ts` — Unit tests for fuzzy matching, sorting/filtering, and price comparison.

## Updated components / modules
- `src/services/database.ts` — Added `searchReceiptItemPurchases()` and `ItemSearchPurchaseRow` for Item Search queries.
- `src/navigation/types.ts` — Added `ItemSearch` route to navigation param lists.
- `src/navigation/HomeStackNavigator.tsx` — Registered the Item Search screen in the Home stack.
- `src/navigation/MainNavigator.tsx` — Registered the Item Search screen in the main stack.
- `src/navigation/AppNavigator.tsx` — Registered the Item Search screen and added deep link path `item-search`.
- `src/screens/main/HomeScreen.tsx` — Updated the Home quick action to open Item Search.

## Notes
- Price comparison is computed from unit price when available; otherwise falls back to `total_price / quantity`.
