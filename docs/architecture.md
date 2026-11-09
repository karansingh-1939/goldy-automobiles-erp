# Architecture and development conventions

## Runtime

The Electron main process in `src/desktop/main.js` owns the local API lifetime. It waits for database initialization and the HTTP listener before loading the application. Only one desktop instance runs. Closing the app stops the backup scheduler, closes the listener and closes SQLite.

The backend binds to loopback only. The renderer has no Node integration and uses a sandbox with context isolation. It communicates through REST endpoints under `/api/v1/`. Authentication uses bearer tokens; the login endpoint also supplies an HttpOnly cookie for protected HTML screens.

## Backend boundaries

Feature folders own their HTTP routes, controllers, services and repositories. Controllers translate HTTP requests/responses; services validate domain rules and orchestrate transactions; repositories own persistent queries. Keep stock movements and accounting postings within the owning service transaction.

The sales module separates quotation/revision rules, order reservation/fulfillment and shipment invoicing into focused services. They share stored tax basis and line pricing; `SalesOrderRepository` owns their queries. Customer credit policy is shared across billing paths. These boundaries are enforced by lifecycle regressions. Older modules still containing SQL in services are migration debt, not an alternative convention.

`src/server/app.js` composes middleware, feature routers and web assets. `src/server/server.js` exports `startServer()` for desktop startup and can also run as the standalone API entry point. Configuration belongs in `config/env.js`.

SQLite connection and migration infrastructure lives under `database/`. Add a new migration for schema changes; never rename or reformat an applied migration. Migrations and seeds intentionally retain their numbered filenames.

## Frontend boundaries

Feature screens live under `renderer/modules/`. Reusable UI controls, query configuration, HTTP transport and app state live under `renderer/shared/`. TanStack Query manages server data; Zustand manages authentication, theme, notifications and confirmation dialogs. Send all React JSON requests through the shared API client so authentication and errors behave consistently.

The SPA uses hash routing, which works with the desktop's local HTTP server. Workshop screens use the React application shell. Old static application-page URLs redirect to canonical routes, preserving selected invoice/vehicle/master query parameters. Only the dedicated printable job-card document and shared local-date helper remain under `public/`.

See [workflow ownership](ui-workflow-ownership.md) for the current routes. Searchable master-data selection belongs to `RemoteSelect`; asynchronous intake identity belongs to `use-intake-lookup`. Inventory catalog, stock operations, physical counts, reports and fixed assets have separate components. Job intake, charge sections, invoice printing and service history also have focused components.

## Quality checks

Run `npm run check` before submitting changes. Prettier formats JavaScript, JSX, HTML, CSS, JSON and Markdown. ESLint rejects undefined identifiers, unused code and invalid hook usage. Backend tests execute with Electron's embedded Node runtime to match the SQLite ABI; frontend tests use Vitest and jsdom.

Backend tests run with an isolated working directory, database path and AppData directory. New tests should use the existing test context or a unique temporary folder, close all database/file handles, and clean up only paths they created. Keep reference/customer documents and generated output out of packages.

Windows packaging includes only desktop code, backend code, generated renderer files and production dependencies. Database migrations and seeds are included with the backend. SQLite's native binding is unpacked from ASAR.
