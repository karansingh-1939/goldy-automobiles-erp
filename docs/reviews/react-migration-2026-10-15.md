# Unified workshop UI — 15 October 2026

The remaining local UI migration work from the audit is implemented. React now owns the workshop application screens. Historical application HTML/JavaScript files have been retired; authenticated old URLs redirect to canonical React routes. The printable job-card document remains a dedicated output template rather than a second application interface.

## Work completed

- Inventory catalog with category filtering, explicit optional-value handling, opening stock, batch details, bulk counts, stock operations and summary/valuation/movement/low-stock reports.
- Warehouse and reference-master CRUD, plus explicit starter-catalog status/loading controls.
- Single and multi-line physical verification with review/approval and history; fixed-asset register and creation.
- Four charge sections in job cards, original batch selection, custom intake equipment fields and print access. Intake and charge rendering are separate components. Fixed the missing batch ID and labour-charge API fields in the earlier React forms.
- Invoice register/detail, cancellation with confirmation, print layout, amount-in-words and tax breakdown. Service history uses searchable vehicle selection and recorded visit details.
- Purchase receipt entry/detail with multiple lines, warehouse/batch/cost/selling-price/tax/date fields. Supplier ledger includes validated date filters and current party balance.
- Expense date/category filters and complete server-side summaries, including more than one page of records. Existing descriptive payment/notes metadata is retained; it does not change the existing cash voucher behavior.
- Technician details/history and searchable assignment controls.
- GSTR-3B with actual posted input tax components and HSN/SAC summary. No client-side assumption that all purchase tax splits equally between CGST and SGST. Detailed CSV exports quote values and neutralize text formula injection.
- Administrator backup-file upload/restore, explicitly confirmed before sending raw bytes and followed by logout/cache clearing. Existing backup scheduling, verification, external copies and latest-backup restoration remain available.
- Navigation stays inside React. Old invoice links retain record IDs; old master links retain resource selectors. Invalid master selectors resolve to a valid screen.

## Verification

The complete backend suite passed **228 tests** and the final renderer suite passed **69 tests in 21 files**. Formatting, ESLint and production compilation pass. Captured outputs: [backend](evidence/migration-backend-2026-10-15.txt), [renderer](evidence/migration-renderer-2026-10-15.txt).

The real hidden Electron workflow checks setup/recovery/login and persistent sales stock reservation, then opens every migrated route and exercises inventory and GST tabs against the actual disposable SQLite API. It fails on renderer errors or failed API responses. [Desktop smoke](evidence/migration-desktop-smoke-2026-10-15.txt). Retired-page authentication and record-preserving redirects have separate API regressions.

These are local synthetic-data checks, not a claim of exhaustive manual acceptance. The workshop database was not used or changed. No installer is installed automatically.

## Still requires external validation

- A separate clean Windows machine/VM for the NSIS wizard, UAC, uninstall and upgrade from a known previous version.
- A real workshop trial with printed documents, staff permission combinations and accountant reconciliation of historical balances.
- Actual import of generated XML into a disposable TallyPrime company and review by its operator/accountant.
- Signing credentials for a trusted Windows installer signature.
- Human reconciliation of historical documents whose original purchase/return identity is missing or ambiguous. The software rejects guesses that could change the wrong party's accounts.

The frozen-source Windows NSIS build completed: `release/GOLDY AUTOMOBILE ERP Setup 0.2.0.exe`. It is unsigned and has not been installed or published. [Build record](evidence/migration-windows-build-2026-10-15.txt), [SHA-256](evidence/migration-installer-sha256-2026-10-15.txt).

The packaged executable passed the same expanded workflow check, including all migrated routes and inventory/GST tabs with the real temporary database. [Packaged smoke record](evidence/migration-packaged-smoke-2026-10-15.txt). This verifies the bundled runtime; it does not substitute for clean-machine installation or real workshop acceptance.
