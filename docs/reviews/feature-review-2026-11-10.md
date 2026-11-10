# Feature Review — Replacing Tally for GOLDY AUTOMOBILE (10 November 2026)

Six area reviewers (each arguing as Advocate, Skeptic, Improver and Auditor) and one market researcher (Tally, Indian and global garage software, GST rules) reviewed the application. The code was read, not changed; findings marked _verified_ were also confirmed in the running application. The judge's verdicts follow.

**Context used:** one owner on one offline laptop, about 6 mechanics and 6 cars a day plus counter sales. He previously did everything in Tally (billing, GST, stock, purchases, supplier and customer dues, bank, salary, expenses, P&L, balance sheet) and stopped because of cost (TallyPrime Silver: ₹22,500 + GST plus about ₹4,500 a year). Printing is required. WhatsApp, reminder messaging and insurance claims are later add-ons.

## Verdict summary

The core is strong: billing, weighted average costing, stock, double-entry posting, cancellation reversal and backups work and are well tested. The gaps are less about missing modules and more about **what a non-accountant owner can actually do without help**: fix a mistake, enter his shop details, pay staff, and trust the GST printout.

### Critical (must fix before real use)

| #   | Problem                                                                                                                                                                     | Status                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | Billing stops on 1 April 2027: only FY 2026-27 existed                                                                                                                      | **Fixed** (financial years now roll forward) |
| 2   | Company profile (name, GSTIN, address, phone) cannot be edited; settings are read-only and bills print a hard-coded address with a blank GSTIN                              | Open                                         |
| 3   | Tax invoice print is not Rule 46 complete: no customer GSTIN, no place of supply/state, tax summary always splits CGST/SGST (wrong for interstate)                          | Open                                         |
| 4   | Labour lines go to GST reports with HSN `UNSPECIFIED`; labour needs SAC 9987                                                                                                | Open                                         |
| 5   | A wrong part/labour line or wrong job card cannot be edited, removed or voided before billing; the only escape is billing then cancelling, which burns a GST invoice number | Open                                         |
| 6   | Backup failures (including the USB copy) are silent; nothing shows backup age                                                                                               | Open                                         |

### Feature verdicts

| Area       | Feature                                                                                   | Verdict                          | Reason                                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Job cards  | Intake, finalize to invoice, estimates/approval, promised delivery                        | **Keep**                         | Core flow; transactionally correct. Relax mandatory approval notes for phone approvals                                                   |
| Job cards  | Parts and labour lines                                                                    | **Improve**                      | Add edit/remove; show available stock                                                                                                    |
| Job cards  | Outside jobs (denting, AC)                                                                | **Improve**                      | Detected by a text prefix with cost 0, so profit is overstated and vendor dues are not recorded                                          |
| Job cards  | Status (Draft/In progress) and workshop queue                                             | **Improve**                      | Nothing ever sets "In progress"; add Waiting → Working → Ready → Delivered                                                               |
| Job cards  | Mechanic start/stop timers                                                                | **Hide**                         | A forgotten timer blocks billing; one owner will not run timers for six mechanics                                                        |
| Job cards  | Job card print                                                                            | **Keep**                         | Verify in the packaged EXE (new window session token)                                                                                    |
| Inventory  | Catalog, weighted average costing, adjustments, low stock                                 | **Keep / Improve**               | Show average cost (catalog shows last purchase cost); show Yes/No not 1/0                                                                |
| Inventory  | Purchase entry (GRN)                                                                      | **Improve**                      | The selling price typed on a purchase never updates the item; batch number required on every line (auto-generate it)                     |
| Inventory  | Multi-godown, transfers                                                                   | **Hide when one godown**         | Full backend; per-line warehouse prompts are friction                                                                                    |
| Inventory  | Stock verification (three overlapping screens)                                            | **Merge**                        | One "count and post difference" screen                                                                                                   |
| Inventory  | Purchase orders                                                                           | **Hide**                         | No receive-against-PO and no status lifecycle; dead-end records                                                                          |
| Inventory  | Fixed assets                                                                              | **Keep, add depreciation later** | Needed for a correct balance sheet                                                                                                       |
| Billing    | Job card and counter invoices, invoice register, cancellation, warranties                 | **Keep**                         | Works; FY numbering done today                                                                                                           |
| Billing    | Sales orders, quotations, shipments                                                       | **Hide**                         | About 1,500 lines duplicating job card and counter billing for a 6-car workshop                                                          |
| Billing    | Credit notes / supplier return notes                                                      | **Improve**                      | Still timestamp numbers; GSTR-1 credit-note query misses counter-invoice returns                                                         |
| Billing    | GSTR-1 / 3B / HSN                                                                         | **Improve**                      | Add B2B/B2C split, Table 13 documents issued (mandatory since May 2025), portal JSON or CA Excel                                         |
| Accounting | Vouchers (journal/contra/payment/receipt)                                                 | **Improve**                      | Balanced and correct, but debit/credit grids are for accountants. Add simple "Money in / Money out" screens; keep journal under Advanced |
| Accounting | Customer receipts, allocation, ageing, daily cash count, supplier payments, P&L, day book | **Keep**                         | Work end to end                                                                                                                          |
| Accounting | Expenses                                                                                  | **Improve**                      | Every expense is posted as cash; add cash/bank/UPI so the cash count stays right                                                         |
| Accounting | Chart of accounts                                                                         | **Improve**                      | No way to add the owner's real bank account; bank is hard-coded "HDFC"                                                                   |
| Accounting | Trial balance, "bank reconciliation" (really an integrity check)                          | **Hide**                         | Owner will not use them; rename the integrity check                                                                                      |
| Customers  | Directory, credit limit, vehicles, service history                                        | **Keep / Improve**               | Show outstanding on the customer page; one search by phone or registration                                                               |
| Customers  | Ownership transfer                                                                        | **Improve**                      | Plain vehicle edit moves all past history to the new owner with no record                                                                |
| Customers  | "General Customer" auto-created with phone 9999999999                                     | **Remove**                       | Silently pollutes the customer list and ledgers                                                                                          |
| Customers  | Service reminders                                                                         | **Improve**                      | Auto-create on invoice (+6 months / +km); messaging later                                                                                |
| Customers  | Loyalty, referrals, promotions                                                            | **Remove or Hide**               | No screens, no billing hook, non-atomic writes; dead surface                                                                             |
| Reports    | Reports hub, dashboard                                                                    | **Improve**                      | Rename to "Reports", group by Sales / GST / Profit / Stock / Dues; Excel export; monthly CA pack                                         |
| Reports    | Tally XML export                                                                          | **Hide (keep for CA)**           | Owner left Tally; a CA may still want it                                                                                                 |
| System     | Backups (scheduled, USB copy, verify, restore)                                            | **Keep / Improve**               | Strong engine; add a dashboard banner and a "copy to USB" prompt on close                                                                |
| System     | Login and recovery code                                                                   | **Keep / Improve**               | Add change password and a printable recovery code page                                                                                   |
| System     | Roles/permissions, audit logs, demo data                                                  | **Hide**                         | One user; keep under Settings → Advanced                                                                                                 |
| System     | 25-item sidebar, F1–F12 keys, "Tenant 1" badge                                            | **Improve**                      | Regroup into about 6 sections (below); show the company name                                                                             |

## What Tally did for your father, and whether the app covers it

| Tally job                         | Covered? | Gap                                                        |
| --------------------------------- | -------- | ---------------------------------------------------------- |
| GST billing                       | Yes      | Print fields (critical 2–4)                                |
| GSTR-1 / 3B data                  | Partly   | B2B/B2C split, Table 13, export for filing                 |
| Stock, godowns, valuation         | Yes      | Valuation report export/print                              |
| Purchases and supplier dues       | Yes      | Supplier ageing, edit/cancel a purchase                    |
| Customer dues (udhaar) and ageing | Yes      | Show on customer page, statement print                     |
| Cash book, day book               | Yes      | —                                                          |
| Bank entries                      | Partly   | Add own bank accounts; real reconciliation later           |
| Staff salary and advances         | **No**   | Only an expense category; no staff, advance or salary slip |
| Expenses                          | Yes      | Payment mode (cash/bank/UPI)                               |
| P&L, balance sheet, trial balance | Yes      | Depreciation, opening balances import                      |
| Opening balances from Tally       | **No**   | No ledger create/edit or import                            |
| Year-end                          | Partly   | Years now roll over; optional "close year" later           |

## Top 10 missing features (ranked)

1. Edit company profile (GSTIN, address, phone, bank, terms) — **S-M**
2. Rule 46 invoice print + SAC 9987 for labour + IGST column — **S**
3. Edit/remove job card lines; void an unbilled job card — **S-M**
4. Staff salary and advances (staff list, monthly salary, advance, pay, slip) — **M**
5. Payment mode at billing (cash/UPI/card/credit, part payment) and on expenses — **M**
6. Backup health banner and USB prompt — **S**
7. Opening balances and own bank accounts (create ledgers, import from Tally) — **M**
8. GSTR-1 export for filing (B2B/B2C, credit notes, HSN, documents issued) — **M**
9. Customer 360 page (vehicles, bills, dues, history) with one global search — **M**
10. Simplified sidebar and "Money in / Money out" screens — **S-M**

## Proposed sidebar (about 12 everyday items)

- **Today:** Dashboard
- **Work:** Job Cards (with workshop queue), Invoices
- **Stock:** Inventory, Purchasing (with supplier ledger)
- **People:** Customers & Vehicles (with history and reminders)
- **Money:** Cash & Receivables, Expenses, Reports
- **Settings:** Company, Backup
- **Advanced (collapsed):** Accounting ledger, Audit logs, Warehouses, Fixed assets, Stock verification, Warranties, Returns, Technicians, Tally export

## Phased plan

- **Phase 1 — safe for real bills (now):** critical items 1–6.
- **Phase 2 — fully replaces Tally:** staff salary, payment modes, opening balances and bank accounts, GSTR-1 export, purchase price/GRN fixes, credit-note numbering.
- **Phase 3 — easier daily use:** sidebar regroup, Money in/out, customer 360, status board, hide unused modules.
- **Phase 4 — add-ons:** WhatsApp bills and reminders, insurance claims, thermal printing, photos.

## Regulatory notes (confirm with a CA)

- E-invoicing is not required below ₹5 crore turnover.
- Up to ₹5 crore, GSTR-1 can be filed quarterly (QRMP) or monthly; the app should support both periods.
- Since May 2025, GSTR-1 Table 13 (documents issued, including cancelled count) is mandatory, and the HSN summary is split into B2B and B2C.
- Car parts (HSN 8708) moved from 28% to 18% GST from 22 September 2025; labour (SAC 9987) is 18%. GST rates should be stored per item and may change over time.
- 4-digit HSN/SAC is mandatory on B2B invoices below ₹5 crore turnover.
