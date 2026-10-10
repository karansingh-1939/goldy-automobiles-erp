# Goldy Automobiles ERP

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

The stabilization baseline on 11 October 2026 passes 196 backend tests and 27 renderer tests, formatting, lint, production compilation and packaged backend/assets smoke checks. This is a release candidate. Actual installer use on a clean laptop, visual workflow review, a workshop trial and a real TallyPrime test-company import remain release gates. The installer is unsigned.

The repository contains application source, migrations, synthetic test fixtures, dependency lockfiles and engineering documentation. Customer records, tax-invoice scans, workshop photos, live databases, backups, credentials and generated installers are excluded, including from published history.

## Development roadmap

1. External backup copies and restore verification.
2. Estimate approvals and promised-delivery tracking.
3. Mechanic time tracking and a service-reminder interface.
4. Receivable ageing and daily cash reconciliation.
5. A consistent React interface for the remaining workshop tools.

[Workshop review and priorities](docs/reviews/workshop-readiness-2026-10-11.md) describes the evidence and known limits. Development commits represent actual changes; historical source commits retain their original dates. No activity is backdated.
