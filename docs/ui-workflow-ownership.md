# UI workflow ownership

All workshop application screens use React. Old authenticated HTML application URLs redirect to these canonical routes; invoice, vehicle and reference-master selectors are retained.

| Workflow                        | Canonical route                    | Implementation                                                  |
| ------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| Dashboard                       | `/`                                | Real API metrics and charts                                     |
| Intake and four charge sections | `/job-cards`                       | JobCardManager, JobCardIntake, JobCardCharges                   |
| Workshop queue and reminders    | `/workshop`, `/reminders`          | Operational planning and recorded follow-ups                    |
| Sales bookings                  | `/sales-orders`                    | Warehouse selection, confirmation and reservations              |
| Inventory and stock operations  | `/inventory`                       | Catalog, operations, initial counts and reports                 |
| Physical counts                 | `/stock-verification`              | Single/bulk counts, approval and history                        |
| Fixed assets                    | `/assets`                          | Asset register and creation                                     |
| Warehouses/reference masters    | `/masters`                         | Paged CRUD and starter-catalog controls                         |
| Purchasing                      | `/purchasing`                      | Receipt entry/details and order register                        |
| Supplier ledger                 | `/supplier-ledger`                 | Date-filtered recorded movements and party balance              |
| Invoices                        | `/invoices`                        | Invoice details, cancellation and printed tax document          |
| Vehicle service history         | `/service-history`                 | Searchable vehicle visits and recorded charges                  |
| Accounts/cash                   | `/accounting`, `/cash-receivables` | Vouchers, ledgers, reconciliation and receivables               |
| Expenses and technicians        | `/expenses`, `/technicians`        | Entry, summaries, assignment and history                        |
| GST/financial reports/Tally     | `/reports`                         | Registers, posted input tax, HSN and exports                    |
| Audit                           | `/audit-logs`                      | Search, action/module/date filters and snapshots                |
| Backup/settings                 | `/settings`                        | Verified backups, schedules, external copies and restore upload |

`public/print-job-card.html` and its script remain dedicated printable output. They do not contain a second workshop application shell. `public/local-date.js` is a shared calendar helper.

Use shared authenticated HTTP transport, searchable paginated selectors and permission controls. Stock and financial writes remain in backend service transactions. See [migration evidence](reviews/react-migration-2026-10-15.md) for verification and external acceptance limits.
