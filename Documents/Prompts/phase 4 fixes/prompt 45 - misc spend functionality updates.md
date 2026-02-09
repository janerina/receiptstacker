# Prompt 45 (Phase 4 Fixes) — Misc. Spend functionality updates (React Native)

You are a **GPT-5.2 coding agent** working inside an existing React Native (bare RN, TypeScript) codebase named **ReceiptStacker**.

## Goal
Update the existing **Misc. Spend** feature so it exactly matches the current implemented behavior and UI/UX described below.

This is NOT a greenfield screen. The feature already exists; your job is to **apply/replicate the described changes precisely** without introducing new UX, screens, colors, components, or flows.

## Non‑negotiable constraints
- Do **not** add new pages, extra modals, filters, animations, or “nice-to-have” changes.
- Do **not** change business logic or navigation flows beyond what’s explicitly described.
- Use **existing design tokens and components** where already used.
- Where the spec references literal hex colors, use them exactly (they are part of the current screen styling).
- The app is local/offline-first; Misc Spend data is stored locally.

## Where the implementation lives (must match)
Primary screen:
- `src/screens/features/MiscSpendScreen.tsx`

Supporting utilities/services (must be used as described):
- `src/utils/miscSpendStore` (`listMiscExpenses`, `upsertMiscExpense`, `deleteMiscExpenseById`, `MiscExpense`)
- `src/utils/miscSpendCategoriesStore` (`listMiscSpendCategories`, `MiscSpendCategory`)
- `src/utils/miscSpendUtils` (`normalizeMiscSpendCategoryId`)
- `src/utils/budgetStore` (`listBudgets`)
- `src/services/themedAlert` (`themedAlert`)
- `src/components/modals/DatePickerModal` (single date)
- `src/components/modals/DateRangePickerModal` (custom range)
- `src/contexts/AppContext` (`useApp`, and receipt categories used in dropdown)

UI building blocks already used:
- `Button`, `Card`, `IconButton`, `Input` from `src/components/common`
- `EmptyState`, `LoadingOverlay` from `src/components/compositions`
- `SwipeListView` from `react-native-swipe-list-view`
- `LinearGradient` from `react-native-linear-gradient`
- `Feather` icons
- Tokens: `COLORS`, `ICON_SIZES`, `SPACING`, `TYPOGRAPHY`, `RADIUS`

## Required final UX (exact)

### 1) Header
- Screen title area at the top with:
  - Back button (left): circular 40x40, `backgroundColor: colors.surface`, border hairline, borderColor `colors.border`.
  - Add button (right): circular 40x40, same styling as back.
  - Title text: `Misc. Spend` using `TYPOGRAPHY.pageTitle`, color `colors.text`.
  - Subtitle: `Track small expenses without receipts` using `TYPOGRAPHY.caption`, color `colors.textSecondary`.
- Press feedback: `opacity: 0.85`.

### 2) Summary card (Total)
- Card at top of list header:
  - Margin horizontal `SPACING.lg`, bottom `SPACING.lg`.
  - Rounded `RADIUS.lg`, padding `SPACING.lg`.
  - Gradient background overlay: `LinearGradient` with colors `['#ff0050', '#ff006e']`, start `{x:0,y:0}` end `{x:1,y:1}`.
  - Text:
    - Label: `Total Misc. Spending` (`TYPOGRAPHY.caption`, white, opacity ~0.9, fontWeight 600)
    - Amount: big white (fontSize 30, lineHeight 34, fontWeight 700)
    - Period line: derived from selected period (see “Time Period” logic below), `TYPOGRAPHY.caption`, rgba white 0.85.

### 3) Time Period selector
- A `Card` under the summary:
  - Title `Time Period` using `TYPOGRAPHY.cardTitle`.
  - Four pill buttons across one row with equal width:
    - `This\nMonth`
    - `Last Month`
    - `Weekly`
    - `Custom`
  - Unselected pill style:
    - `backgroundColor: '#f1f5f9'`
    - borderWidth 0
    - borderRadius 16
    - vertical padding 12
    - text uses `TYPOGRAPHY.caption`, color `'#64748b'`, fontWeight 700, centered.
  - Selected pill style:
    - `backgroundColor: primary`
    - text color white.

#### Period behavior
- Period options: `'thisMonth' | 'lastMonth' | 'weekly' | 'custom'`.
- `thisMonth` range = first day of this month through end of today.
- `lastMonth` range = full previous calendar month.
- `weekly` range = Monday → Sunday of the current week.
- `custom` range = user-chosen start/end; if start > end, swap (store corrected order).

#### Range label behavior
- For `thisMonth` and `lastMonth`: show “Month Year” (e.g., “February 2026”).
- For `weekly` and `custom`: show `MM/DD/YY – MM/DD/YY` (use app helper `formatDate(..., 'short')`).

### 4) Custom range UI (only when period = Custom)
- Under the pills, show a divider and then a row:
  - Start date field (outlined):
    - height 40, borderRadius `RADIUS.full`, borderWidth 1.5
    - `backgroundColor: 'transparent'`
    - `borderColor: colors.text`
    - centered text (uses `TYPOGRAPHY.bodySmall`, fontWeight 600, fontSize 14, letterSpacing -0.2)
    - placeholder text exactly: `mm/dd/yyyy` when not selected
  - “to” caption between fields (`TYPOGRAPHY.caption`, color `colors.textSecondary`).
  - End date field (filled):
    - same base sizing
    - `backgroundColor: primary`, `borderColor: colors.text`
    - text color white
  - Apply button:
    - height 40, borderRadius `RADIUS.full`
    - `backgroundColor: primary`, `borderWidth: 1.5`, `borderColor: colors.text`
    - disabled state: `backgroundColor: colors.disabled`, `borderColor: colors.border`
    - label: `Apply` using `TYPOGRAPHY.caption`, white, fontWeight 700.

#### Custom date picker behavior
- Pressing either date field opens the **DateRangePickerModal** (anchored to the custom range row via a ref).
- `DateRangePickerModal`:
  - `visible` driven by `showRangePicker`.
  - `anchorRef` is the ref on the custom range row.
  - `initialStartDate` = tempStart OR existing customRange.start OR null.
  - `initialEndDate` = tempEnd OR existing customRange.end OR null.
  - `onConfirm` updates temp start/end only.
  - Only when user presses `Apply` do we set the actual `customRange` used for filtering.

### 5) Quick Add Expense (opened from header +)
- Tapping header “+” should open the Quick Add card inside the list header (and scroll to it).
- If Quick Add is already open, tapping header “+” should just scroll to it.
- Close behavior:
  - “X” top-right on the card closes Quick Add and closes the category dropdown.
  - “Cancel” button also closes Quick Add and dropdown.

#### Quick Add card layout
- Card: marginHorizontal `SPACING.lg`, marginBottom `SPACING.lg`, padding `SPACING.lg`, `zIndex: 100`, `elevation: 1`.
- Header row: title `Quick Add Expense` (TYPOGRAPHY.cardTitle) and close X.

Fields (order and labels are exact):
1) Label `Item` (TYPOGRAPHY.bodySmall, color `colors.textSecondary`, fontWeight 700)
   - `Input` for description
   - Placeholder: `Description (e.g., Coffee, Parking)`
   - Validation: required; on change clears `errors.description`.

2) Label `Amount`
   - `Input` for amount
   - Placeholder: `0.00`
   - Left icon is a Text `$` (dollarPrefix style)
   - Keyboard type: iOS `decimal-pad`, Android `numeric`
   - Input normalization: allow digits and `.` only; preserve only one decimal point using existing helper logic.
   - Validation: must be > 0; on change clears `errors.amount`.

3) Label `Date`
   - Pressable “date field” (NOT an Input):
     - height 44, borderRadius 14
     - background `'#f1f5f9'`
     - borderWidth 2, borderColor `colors.border`
     - shows formatted date `formatDate(quickAddDate, 'short')`
     - shows calendar icon right
   - Opens `DatePickerModal` titled exactly: `Expense date`

4) Label `Category`
   - Dropdown field (Pressable-like row):
     - height 56, borderRadius 18
     - background `'#f1f5f9'`
     - borderWidth 2, borderColor `colors.border` (or `primary` when open)
   - When closed:
     - show category icon (Feather icon name or emoji) and selected category name.
   - When open:
     - the value text becomes `All Categories` and icon is hidden.
     - dropdown panel appears below with maxHeight 320.

#### Category sources + ordering (must match)
- There are default Misc categories (hard-coded) used as baseline:
  - Social (#f97316, coffee)
  - Food (#22c55e, utensils)
  - Entertainment (#a855f7, film)
  - Transport (#3b82f6, dollar-sign)
  - Gifts (#ec4899, gift)
  - Other (#94a3b8, tag)
- Also load **custom misc categories** from `listMiscSpendCategories()` and merge with defaults, de-duping by `id`.
- Also include **receipt categories** from global AppContext (`useApp().categories`), mapped into dropdown first:
  - Each receipt category becomes an entry:
    - `id: 'rcpt-' + category.id`, name/color/icon taken from receipt category.
- Dropdown list is:
  1) receipt categories
  2) misc categories (defaults + custom)
- De-dupe dropdown items by **category name (case-insensitive)**.
- In the dropdown list, filter out items where `id === 'other'`.

#### Quick Add buttons
- Row has two buttons:
  - Primary: `Add Expense`
    - height 54, borderRadius 18, background `primary`
    - disabled when missing fields OR while adding
    - disabled style uses `backgroundColor: rgba(primary, 0.55)` (same helper)
    - if adding: show ActivityIndicator white; else show text `Add Expense`.
  - Secondary: `Cancel`
    - fixed width (`flexBasis: 104`), height 54, radius 18
    - background: dark `'#111827'` when dark mode, else `'#F1F5F9'`
    - border hairline with `colors.border`
    - text: `TYPOGRAPHY.bodyLarge`, fontWeight 800, dark `'#111827'` in light, white in dark.

### 6) Add expense behavior (wiring)
When user taps “Add Expense”:
- Validate:
  - amount must be > 0
  - description required
- Create `MiscExpense`:
  - `id`: `Date.now().toString()`
  - `amount`: parsed amount
  - `description`: trimmed
  - `categoryId`: selected category id
  - `categoryName`: selected category name
  - `date`: `quickAddDate.toISOString()`
- Save via `upsertMiscExpense(expense)`.
- Update UI list state immediately by prepending to local `expenses`.
- Clear amount and description fields; clear errors.
- Show tiny toast (see below).

#### Budget prompt after add (critical)
After a successful add, perform a non-blocking check:
- Normalize the misc category id using `normalizeMiscSpendCategoryId(selectedCategory.id)`.
- Load budgets via `listBudgets()`.
- Determine if any budget exists with `budget.categoryId === normalizedCategoryId`.
- If NOT found, show a themed in-app alert:
  - Title: `No Budget Assigned`
  - Message: `No Budget is assigned for this category. Do you want to add Budget to this category?`
  - Buttons:
    - `No` (cancel)
    - `Yes` navigates to Budget tab:
      - `navigation.navigate('BottomTabs', { screen: 'Home', params: { screen: 'Budget' } })`

### 7) List of recent expenses
- Section title: `Recent Expenses` using `TYPOGRAPHY.sectionHeading`, padded horizontally `SPACING.lg`.
- Render list using `SwipeListView` (right swipe disabled; open delete on right):
  - `rightOpenValue = -92`
  - `disableRightSwipe = true`
  - Close behaviors enabled: closeOnRowPress, closeOnRowOpen, closeOnScroll
  - When dropdown is open, disable list scroll:
    - `scrollEnabled={!categoryDropdownOpen}`
    - `disableScrollViewPanResponder={categoryDropdownOpen}`

#### Row UI
- Each item uses a `Card` with:
  - marginHorizontal `SPACING.lg`, marginBottom `SPACING.md`, padding `SPACING.md`.
- Left icon circle:
  - 48x48, circular
  - background rgba(categoryColor, 0.14)
  - icon may be Feather icon name OR emoji; emoji should render as Text.
- Item text:
  - Description (one line)
  - Meta row: Category pill + date (`formatDate(item.date, 'short')`)
- Right:
  - Amount (`formatCurrency(item.amount)`) bold
  - Trash IconButton (ghost, small)

#### Delete behavior
- Swipe-revealed right action:
  - width 92, red background (`COLORS.semantic.error`)
  - icon `trash-2` and label `Delete` (white)
- Also allow delete by tapping trash icon.
- Confirmation uses themed alert:
  - Title: `Delete Expense`
  - Message: `Are you sure you want to delete this expense?`
  - Buttons: Cancel, Delete (destructive)
  - On delete: `deleteMiscExpenseById(id)` then remove from state.

### 8) Empty state
When there are no filtered expenses:
- Show a Card explaining “What is Misc. Spend?” with the copy:
  - Title: `What is Misc. Spend?`
  - Body: `Track small purchases without receipts like coffee, parking, tips, and other quick expenses that add up over time.`

### 9) Toast
- Tiny toast at top center that shows after adding:
  - Green background `COLORS.semantic.success`
  - Icon check + text `Added`
  - Animates in/out via `Animated.Value` (opacity + translateY)
  - Auto hides after ~1200ms.

### 10) Date clamping behavior (important)
- Whenever period/range changes, clamp `quickAddDate` so it always stays within the active range:
  - if now < range.start → set to range.start
  - if now > range.end → set to range.end
  - else set to now.

### 11) Loading behavior
- On load: call `listMiscExpenses()` and `listMiscSpendCategories()`; show `LoadingOverlay` with message `Loading expenses…`.
- Pull-to-refresh: re-run the same loading and update state.

## Implementation checklist (do these)
- Ensure Quick Add includes **Date selection** (DatePickerModal) and persists that date into saved expense.
- Ensure budget prompt appears only when budget is missing for the normalized category.
- Ensure list filtering correctly matches the selected period/custom range.
- Ensure dropdown scroll works (nested ScrollView inside dropdown panel).
- Ensure no other UX changes are introduced.

## Validation
- Run `npm test` and ensure all tests pass.
- Manually sanity check:
  - Open Misc Spend → header + summary + time period.
  - Open Quick Add from header + → select date → choose category → add.
  - Verify toast appears.
  - Verify expense appears in “Recent Expenses”.
  - Swipe to delete and confirm works.
  - Switch to Custom range and verify quickAddDate clamps within range.

## Output format
- Provide a short implementation summary (files changed).
- Do not paste huge files unless asked.
