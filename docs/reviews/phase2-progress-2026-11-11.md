# Phase 2 Progress — 11 November 2026

Rollback point: git tag `checkpoint/pre-phase2-2026-11-11` (data copy in `../backups/pre-phase2-2026-11-11/`).

Plan source: [feature review](feature-review-2026-11-10.md). Owner is not technical: keep screens simple, plain words, safe defaults.

| #   | Step                                                                                                                                                                   | Status                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Backup warnings: Home banner (failed / older than 2 days / USB copy problem) with "Back up now"; scheduled failures recorded; "copy to USB" prompt on close            | Done                                                                                        |
| 2   | Simplicity: Money In / Money Out screens; auto batch number and hidden godown picker on purchases; Yes/No and average cost in stock list; relaxed phone-approval notes | Partly done: stock list, purchase form and phone approvals done; Money In / Out not started |
| 3a  | Staff list, monthly salary, advances, salary payment posted to accounts                                                                                                | Not started                                                                                 |
| 3b  | Payment mode (cash/UPI/card/credit) on bills and expenses                                                                                                              | Not started                                                                                 |
| 3c  | Own bank accounts and opening balances (customers, suppliers, cash, bank)                                                                                              | Not started                                                                                 |
| 3d  | GSTR-1 export (B2B, B2C, credit notes, HSN, documents issued) as Excel/CSV                                                                                             | Not started                                                                                 |

Rules for resuming runs: one feature per commit with tests; `npm run check` must pass before each push; `npm run smoke:desktop` before the final push; transaction correctness, audit logging, weighted average costing; fictional test data only; update this file after each commit.
