# Production stabilization — 8 October 2026

Scope: stabilize the existing offline Windows ERP; preserve existing working-tree changes and business data. All automated verification uses disposable databases. No production data migration is run during development.

## Acceptance and work order

- [x] Financial statements honor company, date and cancellation filters; report totals reconcile with operational billing and expenses.
- [x] Counter billing values stock consistently, stores exact line costs and restores original consumed batches on cancellation.
- [x] Payments, returns and cancellations cannot resurrect documents or duplicate stock/refunds; purchase cancellations reverse journals.
- [x] Canonical vehicle registrations are unique; existing collisions stop migration with identities preserved; rejected intake has no side effects.
- [x] Demo maintenance is administrator-only and isolated; exports omit secrets; unsafe JSON replacement and heuristic production cleanup are removed.
- [x] Backup/restore preserves committed WAL rows, checks ERP schema and keeps original data until restore succeeds; demo backups are isolated.
- [x] Full server/frontend tests, lint, formatting and production build pass; dependencies are triaged and a fresh Windows package is built.
- [ ] Desktop workflows are exercised against isolated data; remaining installer/Tally/workshop validation is explicitly recorded.

Independent slices: accounting report/billing/vehicle fixes (main); purchase/payment/return safeguards (financial reviewer); backup/demo/restore safeguards (data reviewer); profit/expense reconciliation (report reviewer). Database migrations are coordinated sequentially by the main agent.

Verification: regression reproductions followed by focused tests, full `npm run check`, dependency audit, fresh `npm run build:win`, runtime workflow checks. Financial fixes must test state before and after reversal, not only response success.

## Final evidence — 9 October 2026

- Full verification: 193 backend tests and 18 renderer tests, no skips; lint, formatting and Vite production build pass. Includes job-card billing/payment/cancellation, purchasing, transfers, return workflows, backup/recovery and Tally XML tests.
- The data-safety slice separately passed 55 focused checks covering Admin-only maintenance, isolated demo operations, atomic switching, WAL restore, audit-failure rollback and interrupted restore startup protection.
- A different model reviewed the financial changes and final posting/export paths. Findings were reproduced and fixed. It confirmed the aggregate purchase reversal fix after both mixed-cost rounding cases and a consumed-value rejection test passed.
- Dependency audit: zero low/moderate/high/critical findings. Stored in `evidence/dependency-audit-after.json`; previous snapshot retained for comparison.
- Fresh NSIS x64 installer: `release/GOLDY AUTOMOBILE ERP Setup 0.1.0.exe`. Electron 44.7.0 / better-sqlite3 13.0.3 shipped Node-API addon verified inside Electron by postinstall. Installer is unsigned.
- Packaged application starts with isolated AppData/database; `/api/v1/health` returns `{"status":"ok"}` and the renderer responds HTTP 200. A fresh packaged EXE passed API onboarding, login, job-card creation, invoice, payment, paid cancellation rejection, receipt reversal and invoice cancellation. No workshop database was used for automated verification. See `evidence/packaged-smoke.txt`.

## Remaining release gates

The browser/desktop connector reported no available surfaces, so visual and click-through workflow verification remains unverified. Packaged startup and service/API workflows are verified; an actual NSIS installation on a clean Windows laptop, TallyPrime import into a test company, and a short workshop trial remain required for production sign-off.

Restore a copy of existing business data before upgrading and reconcile stock value, parties, GST and opening balances. New fixes do not reconstruct missing historical expense journals or shipment costs. Canonical registration collisions intentionally block migration with vehicle IDs; histories are never silently merged.

Shipment invoices deliberately reject counter cancellation because shipment/order reversal has different ownership. Counter sales support full cancellation; partial counter-sale returns and shipment cancellation remain unavailable. Completed returns are immutable. Do not use manual voucher cancellation to bypass an owning document.

Interrupted restore requires administrator recovery of the preserved staged/rollback database before removing its lock. Legacy shared backups are available through explicit verified restore, never automatic demo/workshop cross-recovery. Unsafe JSON replacement and heuristic purging remain disabled.
