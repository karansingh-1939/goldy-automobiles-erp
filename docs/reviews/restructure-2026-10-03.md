# Project restructure — 2026-10-03

## Changes

- Separated Electron, server and renderer entry points; moved tests into a top-level test folder.
- Renamed helper files and module folders consistently and updated source/test imports. See `restructure-manifest.json` for the original rename map.
- Separated generated renderer output (`dist/renderer`) and Windows packages (`release`) from maintained static tools (`public`).
- Grouped reference PDFs/images under `resources/reference`; retained local workshop databases, backups and logs.
- Removed obsolete phase/status notes, scratch lookup scripts, test logs, stale bundles, old build artifacts and a hardcoded data-import script.
- Added formatting, linting, editor settings and reproducible npm commands using Electron's SQLite runtime.
- Fixed table pagination recursion, missing PATCH support, query invalidation calls, React-root serving, onboarding/recovery, visible login errors, logout revocation, report response handling and several incorrect endpoint/field names.
- Replaced mock company form saving with database-backed read-only details; retained backup scheduling through the existing administration screen.
- Added navigation to workshop tools that do not yet have equivalent React workflows.
- Corrected startup backups to include committed WAL data and use unique snapshot filenames.
- Repaired duplicated, malformed HTML in the legacy settings page and replaced inline print/message handlers with script listeners.

Original application files and removed artifacts were saved before restructuring in:

`C:\Users\karan\AppData\Local\Temp\goldy-before-restructure-73ad2560880d47f68917fc0f02f8aa7e`

This is a temporary local recovery snapshot, not a business database backup. Existing user feature edits were retained. Applied SQL files were excluded from formatting and renaming.

## Remaining production work

The original analysis contains evidence and reproduction details. These items require separate domain/security work:

- Accounting report SQL can include entries outside the requested date range or from cancelled vouchers.
- Direct billing cost can differ from inventory weighted average cost.
- Demo import/export endpoints require tighter authorization and table restrictions; demo purge heuristics can match legitimate records. The React purge shortcut was removed.
- Vehicle registration normalization has a nonunique index and does not enforce uniqueness across equivalent registrations.
- Some React feature screens remain partial workflows; existing HTML screens supply the missing entry and administration tools.
- Dependency audit reports existing vulnerabilities, including the retained Electron/toolchain dependencies. Runtime upgrades need their own compatibility checks before release.

These limitations prevent describing the entire ERP as production certified even though its folder layout, formatting, startup, tests and packaging are now organized for continued development.

## Verification

- `npm run check`: formatting and lint passed; 158 backend tests and 18 frontend tests passed, with no skips in the complete run.
- All 34 migration SQL files matched the pre-restructure snapshot byte-for-byte.
- Fresh startup initialized an isolated database and seeded 435 inventory items.
- Fresh administrator setup, login, 30 HTTP endpoints, manual backup creation and logout revocation passed.
- `npm run build:win` produced a Windows x64 NSIS installer. No installation was performed on the workshop laptop.
- The packaged executable ran its bundled backend from ASAR, initialized SQLite, served the React shell, and contained the repaired settings page; the package smoke test exited successfully.
- Interactive visual testing was unavailable because no browser automation surface was connected. Component tests cover onboarding, errors, pagination, dashboard states and accounting response contracts.
