# Workshop readiness review — 11 October 2026

Scope: fix reproducible problems in the current working tree, preserve existing changes, and verify the offline Windows ERP with disposable data. No workshop database was migrated or altered.

## Fixes

- Reporting now uses the backend's ledger names and closing debit/credit balances. Retained earnings are displayed/exported once, from the actual equity entries.
- The React GST register and CSV include IGST, document type and the original invoice for credit notes. The final amount is correctly labelled as a line total. Broken rupee symbols in reports, inventory and customer credit limits are repaired.
- Failed reports show their error and disable CSV/printing rather than allowing exports of empty fallback values. Tally downloads use the shared authenticated client and release download URLs.
- Session changes clear query caches; expiry closes pending confirmation callbacks. An old request cannot sign out a newer session. Caller cancellation and request timeouts both work; rejected HTTP requests are not replayed.
- Calendar defaults use the laptop's local day throughout the browser and server. Monthly reporting starts on the actual first day. Stored UTC workshop timestamps are converted to local dates for job filtering and today's dashboard counts. Audit timestamps remain UTC. Existing historical document dates are not rewritten.
- Customer returns select completed jobs, resolve their actual invoice IDs, and offer the sold parts with original batch identity. Searching reaches older completed jobs. The backend remains responsible for quantity limits, prior returns, valuation and tax reversals. Counter-sale returns remain outside this workshop-invoice workflow.
- Inventory editing preserves zero costs, zero tax rates and zero minimum stock instead of substituting defaults. Price fields accept paise and prevent repeated submission while saving.

## Verification

Initial baseline: 193 server tests and 18 renderer tests passed; formatting, lint and the renderer build passed. New regressions reproduced report, return, inventory, session, timeout and local-day dashboard failures before their fixes.

Final `npm run check`: formatting, lint, production renderer build, 196 server tests and 27 renderer tests all pass, with no skipped tests. `git diff --check` passes. Dependency audit on 11 October 2026: zero known vulnerabilities reported by npm.

`npm run build:win` produces `release/GOLDY AUTOMOBILE ERP Setup 0.1.0.exe`. All 4,959 packed ASAR files match their integrity hashes; packaged desktop/server entry points match current source. Running the packaged EXE's embedded Node runtime with disposable AppData verifies API startup, administrator setup/login, 14 module read endpoints, compiled renderer assets, six protected static pages with their module scripts, job intake and a SQLite backup. This checks packaged backend/assets, not visual desktop interaction.

An initial package overlapped with HTML formatting and contained invalid offsets. Its smoke check failed; the replacement was built sequentially from stable files and passed archive/runtime checks. Freeze source and build output until packaging finishes on future releases.

## Highest-value improvements for this workshop

| Priority | Improvement                                                                                                                                                                  | Workshop benefit                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Add a backup destination outside the laptop, with a visible last successful copy and a periodic restore drill.                                                               | Local backups protect against many mistakes but do not survive loss or failure of the laptop.                                                              |
| 1        | Run a full workshop trial: intake, estimate, parts issue, labour, invoice, payment, return, day close and restore. Reconcile a copied existing database with the accountant. | Confirms the software matches actual workshop procedures and existing balances.                                                                            |
| 1        | Verify exported XML in a disposable TallyPrime company and sign the Windows installer before wider distribution.                                                             | Validates the actual accounting handoff and installation experience.                                                                                       |
| 2        | Add an editable, validated company profile and consistent permissions/error states on every screen.                                                                          | Staff see the actions available to their role; printed documents use verified workshop details.                                                            |
| 2        | Bring billing, expenses, warehouse transfers, technicians, service history and backup tools into the React interface.                                                        | These workflows currently span React and maintained static screens; one interface reduces training and navigation friction.                                |
| 2        | Add an estimate approval record, promised-delivery queue, mechanic time tracking and delivery checklist. Surface the existing service-reminder backend in the UI.            | Makes repair progress, customer approval and follow-up visible during a busy day.                                                                          |
| 2        | Add party ageing, a daily cash/bank reconciliation screen and clearly recorded job-specific outside expenses.                                                                | Explains outstanding collections and each job's contribution. Period overhead should be reported separately unless a documented allocation rule is chosen. |
| 3        | Complete document-owned shipment reversal and partial counter-sale returns with matching stock, payment and journal reversals.                                               | These are known missing workflows; users should not bypass them through manual voucher cancellation.                                                       |
| 3        | Expand real renderer/API contract tests to every module, including denied permissions, decimal quantities, multi-batch parts and more than one result page.                  | The previous passing backend suite did not detect several broken React workflows found in this review.                                                     |

## Limits

The UI connector reports no available browser or desktop surfaces. Automated renderer tests and backend workflows provide evidence, but visual inspection, actual NSIS installation on a clean Windows laptop, actual TallyPrime import and a workshop trial still need completion. A passing test suite is not proof that every possible business workflow is finished.

The calendar rule follows Windows' configured timezone, which should match the workshop. Historical UTC-derived document dates are preserved; review them when reconciling older data. The existing installer version remains 0.1.0 and is unsigned.
