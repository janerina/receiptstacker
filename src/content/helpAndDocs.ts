export type FaqItem = {
  question: string;
  answer: string;
};

export const HELP_FAQ: FaqItem[] = [
  {
    question: 'Is my data stored online?',
    answer:
      'No. ReceiptStacker is a local-only app. Your receipts, budgets, categories, tags, and settings are stored on your device. Data only leaves your device when you explicitly export/share a file or create a backup and send it somewhere yourself.',
  },
  {
    question: 'How do I re-run the app tour?',
    answer:
      'Go to Settings → Preferences → App Tour. The guided tour will start on the Home screen and you can skip it at any time.',
  },
  {
    question: 'How do I add a receipt?',
    answer:
      'Use the Scan tab to capture a receipt photo and extract text, or use Add Manually to enter receipt details yourself. You can then edit details, add categories/tags, and attach images.',
  },
  {
    question: 'How do I edit or delete a receipt?',
    answer:
      'Open a receipt from the Home list to view details. Use the edit and delete actions on the detail screen. Some lists also support swipe actions for quick delete.',
  },
  {
    question: 'How do Categories and Tags differ?',
    answer:
      'Categories are the main spending buckets (e.g., Groceries, Transport). Tags are flexible labels you can apply across categories (e.g., Work, Warranty, Reimbursable). You can use both together to organize receipts.',
  },
  {
    question: 'How do budgets work?',
    answer:
      'Budgets track spending against limits. Set a budget amount and assign categories (and their limits where supported). Analytics and Reports use these totals to show progress and insights.',
  },
  {
    question: 'How do I back up my data?',
    answer:
      'Go to Settings → Backup & Restore. Choose Backup/Export to save a backup file. Store it somewhere safe (cloud drive, email to yourself, etc.). ReceiptStacker does not upload anything automatically.',
  },
  {
    question: 'How do I restore from a backup?',
    answer:
      'Go to Settings → Backup & Restore → Restore/Import and select a backup file. Restoring overwrites or merges data depending on the restore flow shown in the app—read the confirmation prompts carefully.',
  },
  {
    question: 'How do I export data (CSV/PDF/JSON)?',
    answer:
      'Go to Settings → Export Data. Choose the export type offered by the app. Exports can then be shared through the OS share sheet to another app or saved to storage.',
  },
  {
    question: 'How do I change currency?',
    answer:
      'Go to Settings → Currency and pick your preferred currency. This updates formatting across the app.',
  },
  {
    question: 'I forgot my password. What can I do?',
    answer:
      'ReceiptStacker does not have cloud accounts or password recovery emails. If you forget your local password, recovery options depend on your device and local authentication configuration. Keep backups and consider enabling biometrics where available.',
  },
  {
    question: 'Why do totals not match exactly?',
    answer:
      'Check receipt dates, categories/tags, and filters (date range, category filters, search). Also ensure you selected the expected reporting period in Reports/Analytics.',
  },
  {
    question: 'How do I report a bug?',
    answer:
      'In Settings → About → Help, email support@receiptstacker.com. Include your device model, OS version, app version, and a screenshot or steps to reproduce.',
  },
];

export const HELP_TEXT = `Need help using ReceiptStacker?

Quick tips
- Make backups regularly and keep multiple versions.
- Use Categories for primary organization, and Tags for cross-cutting labels.
- Use Search/Filters/Sort to narrow down lists.

Frequently Asked Questions
(Scroll down to expand answers.)
`;

export const USER_MANUAL_TEXT = `ReceiptStacker — User Manual

1) Overview
ReceiptStacker helps you store receipts, track spending, and manage budgets. The app is designed to run locally on your device. Your data stays on-device unless you explicitly export/share a file or create a backup and move it yourself.

2) Navigation (Bottom Tabs)
Home
- Your main dashboard and receipt list.
- Use search and filters to find receipts quickly.
- Open any receipt to view full details.

Analytics
- Visual summaries of your spending.
- Useful for spotting trends and budget usage.

Scan
- Capture receipt images using your camera.
- The app can extract text and help pre-fill receipt fields.
- Review and correct results before saving.

Calendar
- Browse receipts by date.
- Useful for finding receipts from a specific day/week.

Settings
- Profile, security, currency, data management, and About.

3) Adding Receipts
A) Scan (camera)
- Open Scan.
- Capture a clear photo (good light, flat paper, no glare).
- Review extracted details and fix any mistakes.
- Save the receipt.

B) Add Manually
- Open Add Manually.
- Fill in merchant/store, date, amount, payment method (if available), category, tags, and notes.
- Attach images if supported.
- Save.

4) Receipt Details
When you open a receipt:
- View key info (merchant, date, total, category, tags).
- Edit receipt fields as needed.
- Add/remove tags.
- Update category assignment.
- Delete the receipt if it’s no longer needed.
- Use share/export options when available (PDF/other exports depending on screen).

5) Categories
Categories help group spending (e.g., Groceries, Transport).
- Open Categories from the Features area.
- Create New Category:
  - Name
  - Color (use the color picker to choose any color)
  - Icon (emoji picker)
  - Budget limit (if enabled for categories)
- Edit Category:
  - Change name/color/icon/limit.
- Filters/Sort:
  - Sort by name/spent/receipt count.
  - Use search to quickly find a category.

6) Tags
Tags are flexible labels you can use across categories (e.g., Work, Warranty, Reimbursable).
- Open Tags.
- Create Tag:
  - Name
  - Color (use the color picker)
  - Icon (emoji picker)
- Apply tags to receipts from receipt editing screens.
- Use tag filters (including color filter) to organize and find related receipts.

7) Budgets
Budgets help you stay within spending limits.
- Open Budget.
- Set monthly or period-based limits (depending on the budget screen options).
- Assign categories to budget tracking.
- Review progress bars and insights to see how close you are to limits.

8) Misc. Spend
Misc. Spend is for small expenses without receipts (coffee, parking, tips, etc.).
- Tap the top-right + to open Quick Add Expense.
- Enter description, amount, and category.
- Use filters and date ranges to review spending.
- Swipe actions may be available to quickly delete items.

9) Reports & Insights
Reports
- View spending summaries by time period and category.
- Switch between periods (this month, last month, weekly, custom).
- Use insights screens for deeper breakdowns.

10) Data Management
Export Data
- Export your data in the formats provided by the app.
- Use the system share sheet to save/send the export.

Backup & Restore
- Backup creates a file containing your app data.
- Store backups somewhere safe.
- Restore imports a backup file you select.

Clear Cache
- Clears temporary files and cached data.
- This does not necessarily delete your receipts or database unless the app explicitly warns you.

11) Security
Change Password
- Use Settings → Change Password.
- Follow the password requirements shown in the UI.

Biometrics / Local Authentication (if enabled)
- Enable biometric unlock when available.
- This uses your device’s biometric system (fingerprint/face).

12) Notifications & Warranty Alerts (if enabled)
- Check Notifications for alerts.
- Use Warranty Alerts to track items with warranty/expiry reminders.

13) About
Help
- FAQs, support contact, and troubleshooting tips.
Privacy Policy / Terms
- Full legal text is available in-app.
App Version
- Shows your installed app version.

14) Best Practices
- Back up your data regularly.
- Keep receipt photos clear and readable.
- Use Categories consistently and Tags for cross-cutting organization.
- Review Analytics/Reports monthly to stay on budget.
`;

export const QUICK_REFERENCE_TEXT = `ReceiptStacker — Quick Reference Guide

Add receipt
- Scan tab → capture photo → review → save
- Add Manually screen → enter details → save

Find receipts
- Home → search
- Home → filters/sort (where available)
- Calendar → pick date

Organize
- Categories → create/edit categories
- Tags → create/edit tags
- Receipt Details → assign category and tags

Budgets
- Budget → set limits → review progress

Misc. Spend
- Misc. Spend → top-right + → Quick Add Expense

Reports
- Reports → select period (this month/last month/weekly/custom)
- Reports Insights → deeper breakdown

Backup/Restore
- Settings → Backup & Restore

Export
- Settings → Export Data

Security
- Settings → Change Password
- Enable biometrics if available

Legal / Help
- Settings → About → Help / Privacy Policy / Terms
`;
