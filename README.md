# Goldy Automobiles ERP

[![Windows quality checks](https://github.com/karansingh-1939/goldy-automobiles-erp/actions/workflows/ci.yml/badge.svg)](https://github.com/karansingh-1939/goldy-automobiles-erp/actions/workflows/ci.yml)

An offline-first Windows desktop ERP for a single-laptop automobile repair workshop. It connects vehicle intake, job cards, spare-parts inventory, purchasing, billing and workshop accounts in one local application.

## Why this exists

A workshop needs to know which vehicle is being repaired, which parts were used, what the customer owes and whether a job made money—even when the internet is unavailable. SQLite stores the workshop data locally; Electron owns the Express API lifecycle and opens the React interface after database initialization succeeds.

## Stack and structure

| Area      | Technology                                                    | Location              |
| --------- | ------------------------------------------------------------- | --------------------- |
| Desktop   | Electron                                                      | `src/desktop`         |
| Interface | React, Tailwind, React Router, TanStack Query/Table, Chart.js | `src/renderer`        |
| API       | Node.js, Express, services and repositories                   | `src/server/modules`  |
| Database  | SQLite, transactional migrations and backups                  | `src/server/database` |
| Tests     | Node test runner, Vitest, Testing Library                     | `tests`               |

Business modules cover authentication and permissions, customers, vehicles, job cards, inventory and warehouses, purchasing, invoices, payments, expenses, GST reporting, profit reports, Tally XML export, returns, warranties and service reminders. Some workshop tools still use maintained static pages; the React migration is ongoing.

## Run locally

Use Windows 10/11 x64, Node.js 22.22.2 or newer and npm 10 or newer.

```powershell
npm ci
npm start
```

Create an administrator account in the first-run screen and save its recovery code securely. No production password is included. Development data defaults to `data/goldy.sqlite`; packaged data lives under the Windows user's AppData directory. Optional settings are documented in `.env.example`.

```powershell
npm run check       # formatting, lint, production build, backend and renderer tests
npm run build:win   # Windows NSIS installer under release/
```

The backend tests run under Electron's embedded Node runtime so SQLite uses the same native runtime as the desktop application. Test databases and AppData are isolated in temporary folders.

## Engineering decisions

- Controllers handle HTTP; services validate business rules and coordinate transactions; repositories own SQL.
- Stock movements and their accounting effects must succeed or roll back together.
- Financial documents retain costing and voucher links. Reversals belong to the originating document.
- The API binds to loopback. The renderer uses a sandbox, context isolation and authenticated REST requests.
- Applied migrations are immutable. Startup checks database integrity; backups and restore retain recovery copies.
- Business dates follow the workshop laptop's local calendar; audit timestamps remain UTC.

See [architecture](docs/architecture.md), [administrator guide](docs/admin-guide.md), [security](docs/security.md) and [release notes](docs/release-notes.md).

## Status and verification

The 0.2.0 workshop milestone passes 202 backend tests and 35 renderer tests, formatting, lint and production compilation. Windows installer packaging and packaged backend/assets checks are recorded separately. This is a release candidate. Actual installer use on a clean laptop, visual workflow review, a workshop trial and a real TallyPrime test-company import remain release gates. The installer is unsigned.

The repository contains application source, migrations, synthetic test fixtures, dependency lockfiles and engineering documentation. Customer records, tax-invoice scans, workshop photos, live databases, backups, credentials and generated installers are excluded, including from published history.

## Workshop improvements

- Verified USB/network backup copies and a configurable automatic backup schedule.
- Customer estimate decisions, revision history and overdue delivery tracking. Requested estimates require approval before billing; the final bill cannot exceed the approved amount.
- Persistent mechanic timers and vehicle service reminders.
- Current receivable ageing reconciled to customer ledgers, plus recorded daily cash counts and variance explanations.
- React screens for expenses, technicians and audit history alongside the existing application modules.

See the [workshop operating guide](docs/workshop-improvements.md) for these workflows, acceptance checks and their limits.

## Next development milestones

1. Run a workshop trial with synthetic data, then verify installation on a clean Windows laptop.
2. Test Tally XML with a real TallyPrime test company and resolve compatibility findings.
3. Migrate the remaining billing, warehouse, service-history and stock-verification tools to React.
4. Add installer signing and a tested upgrade/recovery procedure.
5. Use actual workshop feedback to choose the next feature and commit it with tests and release notes.

GitHub runs the Windows quality checks on pushes and pull requests. The workflow pins the [official checkout](https://github.com/actions/checkout) and [Node setup](https://github.com/actions/setup-node) actions to reviewed commit IDs and grants read-only repository access.

[Workshop review and priorities](docs/reviews/workshop-readiness-2026-10-11.md) describes the evidence and known limits. Development commits represent actual changes; historical source commits retain their original dates. No activity is backdated.
