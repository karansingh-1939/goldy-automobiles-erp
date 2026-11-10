# Phase 2 Report — 11 November 2026

## In plain words (read this first)

**Everything planned for tonight is done, tested and saved to GitHub.** If anything looks wrong, every change can be undone (see "Rollback" at the bottom).

What is new in the app for your father:

1. **Home screen tells him if his data is safe.** A green line "Data is backed up", or a yellow warning with a big **Back up now** button if a backup failed, is older than 2 days, or the USB copy failed. When he closes the app and a USB folder is set, it asks: _"Copy backup to USB and close?"_
2. **Money In / Money Out** (new menu item). Shows cash and each bank balance. Two big buttons: **Money In** (customer paid me, I put my own money in, loan, other income) and **Money Out** (I paid a supplier, shop expense, I took money for myself, loan repaid). He can **add his own bank account** (e.g. "SBI Current Account") and enter **starting balances from his old books** (cash, bank, what each customer owes, what he owes each supplier).
3. **Staff & Salary** (new menu item). Set each mechanic's monthly salary, **give an advance**, **pay salary** for a month — the advance is cut automatically and the screen shows exactly how much to hand over.
4. **How the customer paid.** When billing a job card he chooses _Pay later / Cash / UPI / Card_. Expenses now have **Paid by** (cash, UPI, card, bank) — no more "everything is cash".
5. **GST files for the CA.** In _Reports & GST_: pick the month, then download 5 Excel-ready files (B2B bills, B2C bills, credit notes, HSN summary, documents issued).
6. **Simpler screens.** Stock list shows _Yes/No_ and rupees with the average cost; buying stock no longer needs a batch number (the supplier bill number is used) and Main Store is pre-selected; approving an estimate on the phone needs no typing.

Also fixed along the way: paying a supplier (or posting a purchase bill) for a supplier with no previous purchase used to fail with an error.

## What to check in the app (5 minutes)

1. Open the app → Home should show the green "Data is backed up" line.
2. **Settings & Backup** → set the USB folder, then close the app and see the "copy to USB" question.
3. **Money In / Out** → add your real bank account; rename "Bank Account (HDFC)" is not on screen yet, so simply add your bank and ignore HDFC if unused.
4. **Staff & Salary** → add mechanics first under _More tools → Mechanics_, then set salaries.
5. Bill a test job card and choose "Paid in cash" — it should show in Money In / Out balances.

## Not done / limits (honest list)

- **Counter sale screen:** parts sold without a job card have no simple screen yet (only via Sales Orders under More tools). Payment mode is therefore only on job card bills.
- **Renaming the starting "Bank Account (HDFC)"** works in the system but has no button yet.
- **Credit-note numbers** (returns) still use long numbers instead of a GST series.
- **GSTR-1 files** follow the GST offline-tool columns but have not been checked by a CA; ask your CA to confirm the first month. B2C Large (interstate bills over ₹2.5 lakh) is not separated — rare for a workshop.
- **Printing on your real printer, a fresh-laptop install and a real Tally comparison** still need a person.

---

## Progress table

Rollback point: git tag `checkpoint/pre-phase2-2026-11-11` (data copy in `../backups/pre-phase2-2026-11-11/`).

Plan source: [feature review](feature-review-2026-11-10.md). Owner is not technical: keep screens simple, plain words, safe defaults.

| #   | Step                                                                                                                                                                   | Status                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Backup warnings: Home banner (failed / older than 2 days / USB copy problem) with "Back up now"; scheduled failures recorded; "copy to USB" prompt on close            | Done                                                                            |
| 2   | Simplicity: Money In / Money Out screens; auto batch number and hidden godown picker on purchases; Yes/No and average cost in stock list; relaxed phone-approval notes | Done                                                                            |
| 3a  | Staff list, monthly salary, advances, salary payment posted to accounts                                                                                                | Done (Staff & Salary screen)                                                    |
| 3b  | Payment mode (cash/UPI/card/credit) on bills and expenses                                                                                                              | Done for job card bills and expenses (no simple counter-sale screen exists yet) |
| 3c  | Own bank accounts and opening balances (customers, suppliers, cash, bank)                                                                                              | Done (Money In / Out screen: add bank, starting balances)                       |
| 3d  | GSTR-1 export (B2B, B2C, credit notes, HSN, documents issued) as Excel/CSV                                                                                             | Done (Reports & GST screen: 5 CSV downloads)                                    |

Rules for resuming runs: one feature per commit with tests; `npm run check` must pass before each push; `npm run smoke:desktop` before the final push; transaction correctness, audit logging, weighted average costing; fictional test data only; update this file after each commit.

## Verification

- 248 backend tests and 79 interface tests pass; formatting, lint and repository safety checks pass; the desktop smoke test passes.
- New screens were opened in the running app on throwaway data with no errors.
- Commits (all pushed to GitHub `main`): 76da3bb backup warnings · 12d18ef simpler stock/purchase/approvals · 0fc915a Money In/Out, bank accounts, starting balances · 48db461 payment modes · 8583f58 staff salary · f499dfd GSTR-1 export.
- Note: between commit 12d18ef and f499dfd the desktop smoke script had an outdated field name (fixed in f499dfd); the app itself was not affected.

## Rollback

To undo all of tonight's work: `git reset --hard checkpoint/pre-phase2-2026-11-11` (the data copy is in `../backups/pre-phase2-2026-11-11/`).
