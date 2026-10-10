# Release Notes - GOLDY AUTOMOBILE ERP 0.1.0

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

# Workshop improvements

- Manual and scheduled backups can keep a second copy in a configured existing USB or network folder. A disconnected destination reports a failure while retaining the successful local backup. External copies are never removed by local retention.
- Administrators can verify a saved snapshot without restoring it. Verification checks SQLite integrity and foreign keys, then migrates an isolated copy and validates the ERP schema.
- Restoring through React settings clears cached data and requires signing in again.
