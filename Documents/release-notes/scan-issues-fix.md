# Scan issues fix

Date: 2026-02-03

## Summary
Improves the single-scan workflow completion so users can reliably exit scanning and continue scanning without getting “stuck” in the receipt flow.

## Added / updated components
- Receipt Details: adds clear workflow CTAs:
  - **Done**: completes the scan flow and returns to **Home**.
  - **Scan More**: returns to **Scan** so user can choose Single / Multi / Long.
- Receipt Details: adds an in-screen bottom menu (tab-like) for consistent navigation:
  - Home / Analytics / Scan / Calendar / Settings
- Navigation safety: prompts to discard unsaved edits before leaving Receipt Details.

## Files changed
- Receipt Details screen UI/navigation changes.
