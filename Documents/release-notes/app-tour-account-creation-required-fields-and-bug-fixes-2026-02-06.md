# App tour, account creation required fields, and bug fixes (2026-02-06)

**Tag:** App tour account creation required fields and bug fixes

## Summary
- Guided tour now stays on Home (no auto-navigation to other tabs) and highlights remain aligned with their described buttons, even while the Home screen scrolls.
- Account creation enforces required fields and provides clear prompts for missing data and password mismatches.
- Misc. Spend stability and UI refinements: crash fixes plus dropdown/scroll behavior improvements.

## Updated components
- `src/components/tour/GuidedTourModal.tsx`
  - Stabilizes target measurement during scroll/animation so the highlight doesn’t drift to the wrong button.
- `src/screens/main/HomeScreen.tsx`
  - Home-only tour behavior; scrolls targets into view before highlighting.
- `src/screens/auth/SignUpScreen.tsx`
  - Required-field validation and mismatch prompts.
- `src/screens/auth/BiometricSetupScreen.tsx`
  - Hardened signup finalization and atomic session persistence.
- `src/screens/features/MiscSpendScreen.tsx`
  - Crash fix + dropdown/scroll/polish changes.
