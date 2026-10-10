# Workshop improvements in 0.2.0

These changes support a repair workshop's daily work: protect the only laptop's data, record permission to carry out work, see late vehicles, measure mechanic time and reconcile money collected. They use the existing service/repository boundaries, SQLite transactions and role permissions.

## Backup and recovery

In System Settings, set an existing absolute USB or network backup folder. Ensure it is storage outside the laptop; another local folder does not protect against laptop failure. Each manual or scheduled backup retains its local snapshot and attempts a verified second copy. A missing external destination reports an error and does not recreate the folder. Automatic retention removes only managed local automatic snapshots; manually manage external copies.

Use Verify beside a successful snapshot to check integrity, relationships and migrations on an isolated temporary copy. Verification does not replace live data. Restore Latest replaces the active database through the existing restore safeguards and signs the interface out afterward. Keep the application running during backup and restore. Scheduled backups run while the app is open; missed-run recovery can create a backup on the next startup.

Acceptance: a disconnected destination leaves a successful local snapshot; corrupted or non-ERP files fail verification; verification leaves workshop records untouched. Existing restore and rollback tests continue to pass.

## Estimates and delivery

Open Workshop Queue, select an open job and save its promised local delivery time. Overdue jobs are marked and the queue is ordered by promised delivery. Enter a tax-inclusive estimate and its work scope, then record the actual customer's decision, contact name, contact method and notes.

Requesting an estimate activates the billing approval requirement for that job. Pending and rejected estimates block billing. Billing above the latest approved amount fails transactionally and requires a revised estimate and fresh approval. Revisions retain the earlier decisions; superseded pending estimates cannot be approved. Staff record consent already received—the application does not obtain consent or send messages. Jobs without requested estimates retain their existing billing workflow.

Acceptance: duplicate or superseded decisions fail; unapproved and over-estimate billing create no invoice; completed jobs reject new estimates while their estimate history remains readable.

## Mechanic time and reminders

Select a job in Workshop Queue, choose an active mechanic and start its timer. Stop the timer when work ends. Running entries survive app restarts. A mechanic can have only one running timer, and all timers for a job must stop before billing. Times measure elapsed wall-clock duration; a laptop clock earlier than the start prevents stopping until corrected. Time entries do not automatically change billing or payroll.

Service Reminders lets staff choose a vehicle, reason and due date. Customer ownership comes from the vehicle record. The queue shows pending reminders due today or earlier, including customer phone details. Dismiss handled reminders. Future reminders appear when due; no automated messaging is provided.

Acceptance: overlapping timers and repeated stops fail; billing with an active timer fails; invalid reminder dates fail and vehicle ownership cannot be overridden by the request.

## Receivables and daily cash

Cash & Receivables shows current posted customer balances. Invoice dues include completed return credits. Unmatched ledger credits reduce oldest unpaid invoice ages for reporting without changing payment allocations. Ledger dues without a matching unpaid invoice appear as unaged. Buckets use invoice age, not contractual due dates, and this report does not reconstruct historical receivable balances.

Daily cash shows opening cash, cash debits, cash credits and expected closing cash for a selected date. It excludes cancelled and later-dated vouchers. Enter physical cash counted; a variance requires an explanation. Every saved count preserves the book balance, physical count, variance, staff identity and timestamp. Later backdated postings may change the current book balance; earlier count snapshots remain unchanged. Saving a count does not post an adjustment voucher.

Acceptance: posted customer credits reconcile to total due; opening or unmatched balances remain visible; future/cancelled cash vouchers are excluded; later postings do not rewrite earlier count snapshots.

## React utilities and remaining work

Expenses supports recording, editing and deleting expenses through the existing transactional accounting API. Technicians supports maintenance, activation and open-job assignment. Audit Logs displays staff actions and before/after snapshots using the API's actual response fields. Backup scheduling is available in System Settings. These screens support role checks, request errors, pending controls and server pagination where applicable.

Billing, warehouse masters, detailed service history and stock verification still have maintained static tools. Their React migration remains a separate milestone. Clean-machine installation, actual visual desktop use, real TallyPrime import and workshop acceptance remain unverified release gates.
