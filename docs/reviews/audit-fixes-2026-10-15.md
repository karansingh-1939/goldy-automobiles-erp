# Audit fixes and release checks — 15 October 2026

This follows the [14 October audit](edge-case-audit-2026-10-14.md). Changes use disposable databases for verification; the workshop database has not been migrated or rewritten by this work.

## Implemented fixes

| Audit finding                   | Change                                                                                                              | Regression evidence                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1–2: password recovery          | Display rotated recovery code; revoke sessions atomically with password reset                                       | `auth-recovery-safety.test.js`, renderer `login.test.jsx`    |
| 3: orders cannot confirm        | Required warehouse selector sends the warehouse for each line                                                       | renderer `workflow-gaps.test.jsx`, desktop smoke             |
| 4: inclusive prices change      | Store tax basis, retain it through revisions/conversion/invoicing; infer old basis only from matching stored lines  | `sales-workflow-regression.test.js`                          |
| 5: credit notes leave full debt | Apply completed credits to document dues/allocation ceilings and release excess allocations to the original receipt | `audit-financial-edges.test.js`                              |
| 6: supplier return ownership    | Verify originating supplier/purchase and use purchase snapshots                                                     | `audit-financial-edges.test.js`                              |
| 7: repeated SKU returns         | Identify the original invoice line; reject ambiguous old requests                                                   | `audit-financial-edges.test.js`, renderer `returns.test.jsx` |
| 8: direct billing credit limits | Share the ledger-based limit rule across job, sales and direct billing                                              | `audit-financial-edges.test.js`                              |
| 9–10: backup interruption/retry | Recover only proven orphan locks; retain active/ambiguous locks; delay failed interval retries                      | `backup-recovery-safety.test.js`                             |
| 11: first-page-only dropdowns   | Searchable paginated selector, including selected-record lookup                                                     | renderer `workflow-gaps.test.jsx`                            |
| 12: optional field clears       | Send explicit nulls for cleared editable fields and close successful edit dialogs                                   | renderer `workflow-gaps.test.jsx`                            |
| 13: sales search                | Parameterized order/customer search and reachable page metadata                                                     | `sales-workflow-regression.test.js`                          |
| 14: purchasing false empty      | Distinct loading/error/empty states with pagination                                                                 | renderer `workflow-gaps.test.jsx`                            |

Additional fixes guard intake lookup identity and remove fabricated dashboard chart fallbacks. Empty operational data now stays empty instead of displaying invented revenue/jobs. These behaviors have renderer regressions.

## Portfolio improvements

- Added a reproducible hidden Electron workflow check with disposable data. Screenshot output is actual application rendering, not an illustration.
- Added a packaged-runtime smoke command and CI packaging gate. This exercises the bundled app; it does not establish that NSIS installation works on a clean laptop.
- Split quotation and shipment-invoice responsibilities from the large sales service and moved its SQL into the repository.
- Extracted intake lookup state from the job-card component.
- Removed the duplicate audit/Tally HTML implementations after preserving their filters/export capabilities. Old authenticated URLs redirect to React.
- Recorded [UI workflow ownership](../ui-workflow-ownership.md) and the unique features that prevent retiring the remaining specialist tools safely.

## Data and upgrade behavior

New migrations add return invoice-line references, purchase return snapshots and sales tax basis. They do not change original invoice totals or posted cash/journals. Existing excess payment allocations are released to the originating receipt's unallocated balance, rather than inventing a cash refund. A real refund still needs an explicit accounting transaction.

Historical return lines are linked only where the original line is unique. Missing or ambiguous supplier provenance requires an administrator to reconcile the originating purchase; the application does not guess ownership or reconstruct historical tax from today's item master. Review older affected documents with the accountant before collecting balances.

## Checks requiring external evidence

- Clean Windows installation and uninstall/upgrade testing on a separate machine or VM with a known previous release.
- A real workshop acceptance trial, including printed documents, staffing/permissions and opening-balance reconciliation.
- XML import into an actual disposable TallyPrime company and accountant confirmation of the result.
- Trusted installer signing requires the owner's certificate or signing-service access.
- The remaining specialist UI migration was subsequently completed locally; see the [unified UI verification](react-migration-2026-10-15.md). Operator acceptance still requires a workshop trial.

## Local verification

- Full backend suite: **225 passed**, zero failures or skipped tests. [Captured output](evidence/fixes-backend-2026-10-15.txt).
- Full renderer suite: **50 passed in 16 files**. [Captured output](evidence/fixes-renderer-2026-10-15.txt).
- Formatting, ESLint and production renderer compilation passed.
- Real hidden Electron workflow passed setup, recovery-code rotation, login, synthetic inventory creation, React sales draft/confirmation and persisted stock reservation. The smoke marker tests reject an existing database or paths outside its owned temporary workspace.

The screenshots in `docs/images/` come from that disposable workflow. Their dashboard stock value was checked against the real API at 1,000 rupees. A configured CI step is not a claim that a remote GitHub run has completed.

The newly bundled Windows executable also passed setup/recovery/login, sales draft/confirmation, persisted stock reservations and renderer runtime checks. [Packaged smoke output](evidence/fixes-packaged-smoke-2026-10-15.txt). This runs the bundled executable with disposable AppData; it does not install it or verify the NSIS wizard, UAC or upgrades on a clean machine.

`npm run build:win` completed and produced `release/GOLDY AUTOMOBILE ERP Setup 0.2.0.exe`. The installer remains unsigned. [Build output](evidence/fixes-windows-build-2026-10-15.txt) and [SHA-256](evidence/fixes-installer-sha256-2026-10-15.txt) identify the local artifact; no installer was published or installed.
