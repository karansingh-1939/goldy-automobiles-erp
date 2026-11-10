# Release Notes - GOLDY AUTOMOBILE ERP

## Unreleased — production cleanup, 10 November 2026

- Removed dead code: an unused dashboard KPI component, duplicate dashboard API wrappers and unused validation helpers.
- Removed superseded 3 October analysis/restructure reviews and orphaned evidence files that referenced artefacts no longer in the repository.
- Dropped the unused `autoprefixer` dependency (Tailwind 4 handles prefixing) and applied non-breaking dependency security updates, so the high-severity audit gate passes. Six moderate findings remain in electron-builder's build-time `minimatch` chain and need a breaking upgrade.
- Security: the local API now refuses requests addressed to non-loopback host names, blocking DNS-rebinding access from websites open on the same laptop.
- Privacy: starter-catalog suppliers no longer receive invented phone numbers, emails, addresses or GSTINs in the live database, and a test fixture's realistic phone number was replaced with a fictional one.
- Repository safety: `npm run check` now starts with a guard that fails if databases, backups, private workshop folders, `.env` files or secret keys would be committed to the public repository.
- Click-through fixes: the invoice register shows customer names and registrations instead of record numbers; printed bills show the job card odometer; job cards show the opening time in local time instead of UTC; the job card phone lookup no longer erases a new customer name typed while it runs; posting a job card invoice now asks for confirmation.
- GST invoice numbering: job card bills are numbered `INV/26-27/0001` and counter-sale and shipment bills `CS/26-27/0001`. Each series is consecutive, restarts every April, never reuses a cancelled invoice's number and stays within the 16-character GST limit. Existing invoices keep their old numbers. Customer credit notes and supplier return notes still use the old random style.
- Verification: repository safety, formatting, lint, 234 backend tests, 76 renderer tests, desktop smoke, Windows package and packaged smoke all pass.

## Unreleased — audit fixes, 15 October 2026

The specialist inventory, warehouse, physical-count, asset, purchasing, invoice, service-history, supplier-ledger and staff workflows now use React. Dedicated GST details and raw backup upload restoration are included. Old application URLs redirect with record selectors preserved; duplicate application pages are removed. See [unified UI verification](reviews/react-migration-2026-10-15.md).

- Recovery displays the replacement code and invalidates old sessions. Backup locks recover only proven exited owners, and failed scheduled backups wait before retrying.
- Sales orders include a warehouse; searching and paging work. Tax-inclusive quotes keep their agreed basis through revision, conversion and invoicing.
- Customer returns retain original invoice-line identity. Completed credits reduce document dues; excess receipt allocations return to unallocated credit. Supplier returns require matching purchase provenance and original tax snapshots.
- Direct, job and order billing share the customer credit-limit rule. Clearing optional master fields persists; remote selectors search/page beyond the first twenty records. Purchasing distinguishes failed loads from empty registers.
- Intake ignores stale lookup responses. Dashboard charts no longer invent revenue or jobs when actual values are zero.
- Audit and Tally use the React interface with compatible old links. Added disposable Electron workflow checks and documented specialist UI ownership.

Upgrade/data limitations and current validation are recorded in [audit fixes](reviews/audit-fixes-2026-10-15.md).

## 0.2.0 workshop milestone — 11 October 2026

- Expenses, technician maintenance and job assignment, audit history, and backup scheduling now have React screens in the main application shell. Other maintained static workshop pages remain accessible during migration.

- Current receivable ageing reconciles invoice dues against posted customer ledger balances, applies unmatched credits to the oldest invoice ages for reporting, and shows unaged ledger dues separately. It is a current-state report, not a historical as-of reconstruction.
- Daily cash reconciliation calculates opening cash, inflows, outflows and closing cash from active vouchers. Cash counts retain the book balance, physical count, variance, explanation and staff identity at the time of recording; saving a count does not create a financial adjustment.

- Mechanic timers persist across restarts, prevent concurrent timers for one mechanic and must be stopped before a job is billed. Recorded time is operational data and does not automatically change invoice charges or payroll.
- The React reminder screen schedules vehicle follow-ups and lists overdue reminders with customer contact details. Handled reminders can be dismissed; no messages are sent automatically.

- The React workshop queue lists open jobs by promised delivery, flags overdue work and records revised estimates with customer contact evidence. Requested or rejected estimates block billing; invoices cannot exceed the latest approved tax-inclusive amount. Older jobs without requested estimates keep their existing workflow.

- Manual and scheduled backups can keep a second copy in a configured existing USB or network folder. A disconnected destination reports a failure while retaining the successful local backup. External copies are never removed by local retention.
- Administrators can verify a saved snapshot without restoring it. Verification checks SQLite integrity and foreign keys, then migrates an isolated copy and validates the ERP schema.
- Restoring through React settings clears cached data and requires signing in again.

## Workshop workflow fixes — 11 October 2026

Reports display actual ledger closing balances, include IGST and credit-note identity, and show retained earnings once. Local calendar defaults fix India day/month boundaries; today's workshop counts convert stored UTC timestamps. Session changes clear cached data and pending confirmations, stale requests cannot log out a newer login, and timeout/cancellation handling is corrected. Customer returns resolve actual workshop invoice IDs and sold parts. Inventory edits preserve zero values and accept paise.

Validation: 196 backend tests, 27 renderer tests, formatting, lint and production build pass. A fresh Windows installer passes packaged backend/assets smoke checks and ASAR integrity validation. Visual desktop use, clean-machine installation, actual TallyPrime import and a workshop trial remain unverified. Details and improvement priorities: [workshop readiness review](reviews/workshop-readiness-2026-10-11.md).

## Stabilization candidate — 9 October 2026

Financial statements now apply date/cancellation filters correctly. Counter and shipment billing persist movement costs; cancellation restores the original batches. Payments, allocations and return approval cannot resurrect cancelled documents. Discounted returns, expenses and round-off reconcile across operational profit and journals. Interstate workshop/receipt GST, return notes and input tax reversals are included. Opening inventory posts its capital contribution.

Vehicle registration uniqueness is enforced in SQLite. Existing duplicates stop migration and report vehicle IDs instead of merging their histories. Rejected job-card intake rolls back customer, vehicle and ownership changes.

Administrator-only demo maintenance is isolated from workshop data. Business exports omit credentials and security settings. JSON database replacement and heuristic demo purging are disabled. Backups and retention use isolated database directories; restore/recovery include committed WAL data, verify ERP schema, retain rollback copies and block startup after an interrupted restore.

Electron 44 and better-sqlite3 13 use bundled Node-API binaries, checked in Electron by `npm run postinstall`. The dependency audit reports zero known vulnerabilities at verification time. The Windows NSIS installer builds successfully; packaged API and renderer startup passed with disposable data. The installer is unsigned.

Release evidence and outstanding real-machine checks: [stabilization record](reviews/production-stabilization-2026-10-08.md). This is a release candidate pending a workshop trial, actual Windows installation and TallyPrime import verification. Existing financial data must be reconciled before relying on opening balances or historical profit; fixes do not infer missing historical journals or shipment costs.

## Earlier feature notes (historical, not current verification)

We are excited to announce the v1.0.0-Beta release of Goldy Automobiles ERP, a commercial-grade, offline-first desktop management suite tailored for automobile repair workshops.

## Key Features

1. **Executive Management BI Dashboard**
   - 10 core KPIs including Today's Revenue, Monthly Growth, Average Ticket Value, Active Loyalty Members, and Pending Reminders.
   - Interactive charts (Line, Bar, Doughnut) powered by Chart.js for real-time visualization of monthly revenues, category profits, and technician loads.
   - Live system status alerts and quick action links.

2. **Unified DataTable Framework**
   - High-performance, keyboard-accessible table grids matching professional ERP systems.
   - Keyboard navigation (Up/Down arrow row selection), dynamic page sizing, search filtering, and column sort parameters.
   - Integrated skeleton loaders.

3. **Accounting & Tax compliance**
   - Full Double-Entry Accounting Engine supporting Ledger trees, Trial Balance, Profit & Loss statements, and Balance Sheets.
   - Outward GSTR-1 grids, GSTR-3B tax calculators, and HSN-wise summaries.
   - Tally Prime XML export integration supporting ledger names, alias aliases, voucher imports, and date filters.

4. **Physical Stock Auditing & Verification**
   - Physical count sheets tracking warehouse items, batches, expected vs counted levels, and computed variances.
   - Draft and Approval workflow locks preventing non-admin users from posting journal entry adjustments.

5. **Customer Relationship, Loyalty & Promo Engine**
   - Customer loyalty profiles with tier upgrades (Standard, Silver, Gold, Platinum) and manual adjustment logs.
   - Referral tracking and automatic points payouts.
   - Service reminder triggers checking vehicle mileage and inspection schedules.

## Configuration & Packaging

- **Production Package**: Built using `electron-builder` with ASAR compression enabled for application code security.
- **Native Dependency Handling**: Bundled SQLite Node-API binaries verified in the installed Electron runtime.
- **Local Application Data**: The SQLite database (`database.db`), audit trails, and backup directories map to the local `AppData` directory under user profiles on Windows, ensuring data persistence across uninstalls.
- **UAC Installation**: Installs to `%PROGRAMFILES%` by default via a wizard-based custom installer.

## Verified Release Diagnostics

- Earlier automated checks were superseded by the dated stabilization evidence linked above.
- Vite code chunking is optimized under 200 kB per bundle.
- Pre-migration backup routines run automatically before schema changes, with automatic restoration rollback protocols.
