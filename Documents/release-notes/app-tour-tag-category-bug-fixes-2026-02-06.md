# App tour + tag/category + bug fixes (2026-02-06)

## Summary
This check-in improves guided tour highlight correctness and reliability on Home, hardens step-to-step highlight transitions, and polishes Category/Tag edit UX (remove actions, correct titles, icon picker reliability, and button label truncation fixes). It also includes form validation improvements around account creation and a set of small UI/flow stability fixes.

## Key changes
- Guided tour highlight reliability improvements (measurement retries/stabilization, scroll-into-view, and step-change highlight reset to avoid stale targets).
- Category edit UX: add Remove/Reset action next to Save, with confirmation.
- Tag edit UX: correct modal title (Edit vs Create) and add Remove action next to Save, with confirmation.
- Icon/emoji picker selection reliability improvements in add/edit Category/Tag flows (keyboard interaction hardening).
- Button labels: prevent truncation for longer labels like “Remove Tag”/“Remove Category”.

## Added and updated components
- Updated: `src/components/tour/GuidedTourModal.tsx`
- Updated: `src/screens/main/HomeScreen.tsx`
- Updated: `src/screens/features/CategoriesScreen.tsx`
- Updated: `src/screens/features/TagsScreen.tsx`
- Updated: `src/components/common/Button.tsx`
- Updated: `src/screens/auth/SignUpScreen.tsx`
- Updated: `src/screens/auth/BiometricSetupScreen.tsx`
- Updated: `src/screens/features/MiscSpendScreen.tsx`
- Added: `Documents/release-notes/app-tour-tag-category-bug-fixes-2026-02-06.md`

## Notes
- Tag for this checkpoint is intended to back up/restore this exact state for “app tour + tag/category + bug fixes”.
