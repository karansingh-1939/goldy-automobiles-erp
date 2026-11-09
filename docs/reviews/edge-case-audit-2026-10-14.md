# Edge-case and portfolio audit — 14 October 2026

What this repo does: Goldy Automobiles ERP runs vehicle intake, repairs, stock, billing and workshop accounts offline on Windows. This audit assumes one laptop and normal workshop use, including multiple batches, customer returns, password recovery and interrupted backups.

Three review agents independently examined frontend workflows, finance/stock rules, and desktop/authentication/data recovery. The coordinating reviewer checked their evidence and reproduced sales-order failures. No application source or live workshop data was changed. Findings distinguish executable isolated probes from static end-to-end code traces.

## Verification

- Backend: 202 tests passed, zero failures/skips. Run via `npm run test:server` outside the sandbox because sandbox restrictions prevented loopback HTTP connections. Output: [backend evidence](evidence/audit-backend-2026-10-14.txt).
- Renderer: 13 files / 35 tests passed. The successful run used one worker and a workspace temporary directory after the sandbox's temporary-file handling caused transform errors. Those environment errors are not product findings.
- Finance probes: temporary SQLite databases and real services. Output: [finance evidence](evidence/audit-finance-2026-10-14.txt).
- Sales probes: a real disposable database and test API reproduced an inclusive quote total of 118 becoming an order total of 139; a UI-shaped order failed confirmation for missing warehouse; an unmatched search returned two orders with HTTP 200.
- Authentication probes: real service/repository and in-memory SQLite reproduced a reset response containing `newRecoveryCode`, while the UI expects `recoveryCode`; an old session remained authenticated after reset.
- Backup probes: simulated disk failure produced a zero-millisecond interval retry; a temporary lock with a nonexistent PID produced `BACKUP_IN_PROGRESS` and remained in place.

P1 means a high-priority workflow, money or access failure. P2 means a concrete normal-use gap that should be corrected before a workshop trial. Passing existing tests does not invalidate these findings: the missing scenarios are outside their assertions.

## Must fix

### 1. [P1] Password reset hides the replacement recovery code

- **What this is:** Account recovery rotates the recovery code after a successful reset.
- **Problem:** The API returns `newRecoveryCode`; React reads `result.recoveryCode`. The old code is invalidated and its disk copy deleted, while the owner is shown no replacement. Reproduced with the real authentication service.
- **Fix:** Agree on one response field and test the recovery screen against the actual response contract.
- **If we skip it:** The next forgotten password cannot be recovered using the owner's saved code.
- **Evidence:** [Login.jsx:51](../../src/renderer/modules/auth/Login.jsx#L51), [auth.service.js:252](../../src/server/modules/auth/auth.service.js#L252), [auth.service.js:257](../../src/server/modules/auth/auth.service.js#L257).

### 2. [P1] Password reset leaves previous sessions valid

- **What this is:** Reset should remove access associated with the previous credentials.
- **Problem:** Reset updates the user's password and recovery hash without revoking sessions. A previously issued token still authenticates after reset; reproduced using real services and SQLite.
- **Fix:** Update credentials and revoke all sessions for that user in the same transaction. Assert that an old token is rejected afterward.
- **If we skip it:** Resetting a compromised password does not end an existing unauthorized session.
- **Evidence:** [auth.repository.js:96](../../src/server/modules/auth/auth.repository.js#L96), [auth.service.js:252](../../src/server/modules/auth/auth.service.js#L252).

### 3. [P1] Orders drafted through React cannot be confirmed

- **What this is:** Confirmation reserves stock from the selected warehouse.
- **Problem:** The React form submits item, quantity and price without a warehouse. The service stores a null warehouse and confirmation rejects it. There is no warehouse selector or order-edit route to repair that draft. The exact UI-shaped payload reproduced `VALIDATION_ERROR: Warehouse selection is required`.
- **Fix:** Require a warehouse in the form and submit its ID for each order line; verify the draft-to-confirm sequence.
- **If we skip it:** A user can create a booking but cannot proceed to reservation or fulfillment through that screen.
- **Evidence:** [SalesOrderManager.jsx:85](../../src/renderer/modules/sales/SalesOrderManager.jsx#L85), [sales-order.service.js:331](../../src/server/modules/sales-orders/sales-order.service.js#L331), [sales-order.service.js:456](../../src/server/modules/sales-orders/sales-order.service.js#L456).

### 4. [P1] Inclusive quotations change value when converted

- **What this is:** Converting a quotation should preserve its agreed pricing basis.
- **Problem:** `taxType` is used for calculations but not persisted. Conversion defaults to exclusive tax, and shipment invoicing explicitly uses exclusive tax. A one-unit quotation at 118 including 18% tax became an order at 139 after the application's whole-rupee rounding; its calculated GST changed from 18 to 21.24. Reproduced in disposable SQLite.
- **Fix:** Persist the pricing basis and carry it through revisions, conversion and invoicing. Add one inclusive-pricing lifecycle regression.
- **If we skip it:** A customer's accepted quote can become a higher bill.
- **Evidence:** [sales-order.repository.js:17](../../src/server/modules/sales-orders/sales-order.repository.js#L17), [sales-order.service.js:366](../../src/server/modules/sales-orders/sales-order.service.js#L366), [sales-order.service.js:788](../../src/server/modules/sales-orders/sales-order.service.js#L788).

### 5. [P1] Approved returns do not reduce invoice collection balances

- **What this is:** A credit note reduces the amount a customer owes for a returned part.
- **Problem:** Completing a return credits the customer ledger, but outstanding documents and allocation limits still use `grand_total - amount_paid`. After a 236 credit against a 944 unpaid invoice, the ledger became 708 while outstanding allocation still reported 944. Reproduced through real services.
- **Fix:** Deduct completed document-linked credits from outstanding amounts and allocation ceilings, and reconcile payment status. Preserve the original invoice totals.
- **If we skip it:** Staff can collect too much and different account screens disagree about the debt.
- **Evidence:** [allocation.service.js:53](../../src/server/modules/accounting/allocation.service.js#L53), [allocation.service.js:245](../../src/server/modules/accounting/allocation.service.js#L245), [returns.service.js:308](../../src/server/modules/returns/returns.service.js#L308).

### 6. [P1] Supplier returns can debit the wrong supplier

- **What this is:** Returned stock and its debit note must belong to the original supplier.
- **Problem:** Validation checks the batch and item but not the batch's supplier or originating purchase. A batch from supplier A was successfully returned under supplier B, reducing stock and debiting B's ledger by 118. Reproduced through real services.
- **Fix:** Validate supplier and purchase ownership against the originating receipt before completion. Use its stored purchase valuation and tax details.
- **If we skip it:** Stock moves correctly while the wrong supplier's payable balance changes.
- **Evidence:** [returns.service.js:357](../../src/server/modules/returns/returns.service.js#L357), [returns.service.js:401](../../src/server/modules/returns/returns.service.js#L401), [returns.service.js:456](../../src/server/modules/returns/returns.service.js#L456).

### 7. [P2] Multiple invoice lines of the same SKU cannot be returned correctly

- **What this is:** One part can be sold from different batches or at different prices on the same invoice.
- **Problem:** Lookup selects the first invoice row by SKU; prior returns are aggregated by SKU, and the UI also selects by SKU. With batch A quantity 1 at 200 and batch B quantity 2 at 300, returning B fails batch validation. Returning A first then makes B fail with remaining quantity zero. Reproduced through real services.
- **Fix:** Select and store the original invoice-item ID; enforce remaining quantities and refund valuation per invoice line.
- **If we skip it:** Legitimate multi-batch returns are blocked or attributed to the wrong line.
- **Evidence:** [returns.repository.js:337](../../src/server/modules/returns/returns.repository.js#L337), [returns.repository.js:175](../../src/server/modules/returns/returns.repository.js#L175), [ReturnsManager.jsx:61](../../src/renderer/modules/returns/ReturnsManager.jsx#L61).

### 8. [P2] Direct billing bypasses customer credit limits

- **What this is:** Customer credit limits constrain unpaid sales.
- **Problem:** Job-card billing checks the limit, while direct billing never reads or checks it. A customer with a zero credit limit and outstanding 708 was blocked by the job-card check but allowed another unpaid direct invoice of 100. Reproduced through real services.
- **Fix:** Apply the ledger-based credit check inside the direct billing transaction before stock movement and posting.
- **If we skip it:** Staff can bypass the same customer's credit control by choosing another billing flow.
- **Evidence:** [direct-billing.service.js:121](../../src/server/modules/accounting/direct-billing.service.js#L121), [job-card.service.js:691](../../src/server/modules/job-cards/job-card.service.js#L691).

### 9. [P2] An interrupted backup leaves a permanent maintenance lock

- **What this is:** Backup creates a file lock and removes it on normal completion.
- **Problem:** Power loss or process termination bypasses cleanup. Restart does not verify whether the recorded PID still owns the lock. A lock with a nonexistent PID still reproduced `BACKUP_IN_PROGRESS`; restore and demo switching also reject the stale file.
- **Fix:** Recover orphaned backup locks at startup after verifying ownership. Keep the separate restore recovery safeguards.
- **If we skip it:** A normal crash can disable future backups and restoration until someone removes a file manually.
- **Evidence:** [backup.service.js:60](../../src/server/modules/backup/backup.service.js#L60), [restore.service.js:89](../../src/server/modules/restore/restore.service.js#L89), [connection.js:208](../../src/server/database/connection.js#L208).

### 10. [P2] Failed interval backups immediately retry

- **What this is:** Interval scheduling calculates the next backup from the last success.
- **Problem:** A failed overdue backup leaves that timestamp unchanged; the scheduler clamps the already-past next deadline to zero. A simulated disk-full failure reproduced a zero-millisecond next retry.
- **Fix:** Enforce a bounded retry delay after failure while keeping the last-success timestamp truthful.
- **If we skip it:** Disk-full or permission failures cause repeated backup work and logs while the workshop is using the app.
- **Evidence:** [backup.scheduler.js:180](../../src/server/modules/backup/backup.scheduler.js#L180), [backup.scheduler.js:192](../../src/server/modules/backup/backup.scheduler.js#L192), [backup.scheduler.js:216](../../src/server/modules/backup/backup.scheduler.js#L216).

### 11. [P2] Dropdowns hide records beyond the first page

- **What this is:** Vehicle ownership and order entry need access to all eligible customers and items.
- **Problem:** These dropdowns request default list endpoints, which return 20 records, without search or pagination. Static UI/API tracing confirms that eligible records outside the first page cannot be selected.
- **Fix:** Add a server-searchable customer/item selector that handles paginated results. Raising a hard-coded limit only moves the failure point.
- **If we skip it:** Existing customers or parts appear missing as the workshop database grows.
- **Evidence:** [VehicleManager.jsx:60](../../src/renderer/modules/vehicles/VehicleManager.jsx#L60), [SalesOrderManager.jsx:38](../../src/renderer/modules/sales/SalesOrderManager.jsx#L38), [master.validator.js:136](../../src/server/modules/masters/master.validator.js#L136), [inventory.service.js:119](../../src/server/modules/inventory/inventory.service.js#L119).

### 12. [P2] Clearing optional fields silently keeps their old values

- **What this is:** Editing should allow removal of an incorrect optional contact or vehicle field.
- **Problem:** Forms convert empty fields to `undefined`, which JSON serialization omits. PATCH correctly preserves omitted fields, so clearing an email, address, GSTIN or vehicle identifier shows success but retains the stored value. Verified by tracing form serialization and update semantics.
- **Fix:** Send the API's explicit clear value, such as `null`, for fields deliberately emptied during an edit.
- **If we skip it:** Users cannot reliably correct records and may print stale details.
- **Evidence:** [CustomerManager.jsx:138](../../src/renderer/modules/customers/CustomerManager.jsx#L138), [SupplierManager.jsx:135](../../src/renderer/modules/suppliers/SupplierManager.jsx#L135), [VehicleManager.jsx:153](../../src/renderer/modules/vehicles/VehicleManager.jsx#L153).

### 13. [P2] Sales-order search is ignored

- **What this is:** The UI advertises searching by order number or customer name.
- **Problem:** The UI sends `search`, but the controller and repository discard it. An unmatched search returned both disposable orders with HTTP 200. The list also defaults to 50 orders without UI pagination.
- **Fix:** Pass the search field through and filter by order/customer; add pagination so older orders remain reachable.
- **If we skip it:** Staff cannot find an older order and may assume it was never saved.
- **Evidence:** [SalesOrderManager.jsx:29](../../src/renderer/modules/sales/SalesOrderManager.jsx#L29), [sales-order.controller.js:101](../../src/server/modules/sales-orders/sales-order.controller.js#L101), [sales-order.repository.js:171](../../src/server/modules/sales-orders/sales-order.repository.js#L171).

### 14. [P2] Purchasing failures look like an empty register

- **What this is:** The purchasing screen loads orders from the authenticated API.
- **Problem:** The component ignores the query error and falls back to an empty array. After a denied or failed request it displays “No purchase orders open.” Verified by tracing the query state and render branches.
- **Fix:** Show the error and a retry action separately from a successful empty result.
- **If we skip it:** Staff mistake an access/server failure for missing purchase records.
- **Evidence:** [PurchasingManager.jsx:11](../../src/renderer/modules/purchasing/PurchasingManager.jsx#L11), [PurchasingManager.jsx:78](../../src/renderer/modules/purchasing/PurchasingManager.jsx#L78).

## Five likely hiring-manager red flags

These are informed reviewer judgments, not a claim that every hiring manager will react identically. Some are visible from the landing page; others require a quick source or test browse.

1. **The product is hard to assess immediately.** The README has no screenshots or short workflow video. Add a synthetic-data demonstration of intake → parts → bill → payment, with a screenshot and a clear way to try it.
2. **Two frontend implementations are still maintained.** React screens coexist with overlapping static pages such as `public/job-cards.js` and `public/inventory.js`. The README acknowledges the migration. Show which implementation owns each workflow, retire superseded pages, and document a bounded migration plan.
3. **The tests prove less than the headline totals suggest.** There are real tests and Windows CI, but the recovery response mismatch, impossible React order confirmation and return balance disagreement survived them. Add a small number of real UI/API lifecycle tests and assert stock/ledger/document agreement; another large happy-path count is less persuasive.
4. **The documented architecture does not consistently hold.** README says repositories own SQL, yet major services contain extensive SQL. `sales-order.service.js` has 1,035 lines spanning pricing, quotations, reservation, shipment and invoicing; `JobCardManager.jsx` has 1,251 lines alongside a 1,332-line static job-card script. Split by workflow responsibility and enforce the existing boundaries; line count alone is not the defect.
5. **Release readiness remains partly unproven.** README lists clean-laptop installation, full visual review, workshop trial, real Tally import and upgrade/recovery as remaining work. CI checks source but does not package and test the installed desktop. Publish repeatable installation/upgrade smoke evidence and a small workshop acceptance record. An unsigned hobby-project installer alone is not a decisive SDE red flag.

Counterweight: the project has useful domain depth, transactional business logic, migrations, substantial automated tests, Windows CI and candid limitations. Those are credible strengths. The concern is consistency and complete workflows, not a lack of engineering effort.

Verdict: fix recovery, React order confirmation and financial reconciliation first, then backup resilience and growing-data UX. These failures matter on the stated single-laptop workload; a distributed architecture is not needed to address them.

Not checked: actual installed Electron visual interaction, every permission combination, clean-laptop installation or upgrade, real TallyPrime import, exhaustive GST legality, current dependency advisories, and every module/file. Formatting/build/packaging were not rerun because this audit changed no application code. Suspected asynchronous lookup races and edit-modal behavior were not promoted to the verified finding list.
