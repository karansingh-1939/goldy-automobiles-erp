# Publication and workshop milestone verification — 11 October 2026

## Published source

Public repository: <https://github.com/karansingh-1939/goldy-automobiles-erp>.

The published history retains the five existing source commits with their original authors, dates and messages, followed by seven commits for the stabilization, workshop features and CI work. Filtering private historical files changes commit hashes. No activity was backdated. The original Git history is retained in a private local archive outside the project; the development folder now tracks the published `main` branch.

The publication audit examined 707 historical blobs. It found no files or credentials matching the audit's private-file and secret patterns. Publication excludes live databases, backups, invoice scans, workshop photographs, environment credentials, dependencies and generated installers. Pattern checks cannot guarantee detection of every possible secret; only source and engineering documentation were selected for publication.

## Verification

- Local `npm run check`: formatting, lint, production renderer compilation, 202 backend tests and 35 renderer tests passed, with zero skipped tests.
- [GitHub Windows CI run](https://github.com/karansingh-1939/goldy-automobiles-erp/actions/runs/38084972087): clean dependency installation, the complete quality check and high-severity dependency audit passed for commit `19cbaac75a3f5ab569aefd5e352fecf0bdfb5d18`.
- `npm run build:win`: produced the unsigned NSIS installer `GOLDY AUTOMOBILE ERP Setup 0.2.0.exe`.
- Installer SHA-256: `B4E9882F3B2C6724CAA782425ED5816BB58B57486EB309443ECFA073F8DDEEDB`.
- All 5,034 packed/unpacked ASAR files matched their embedded SHA-256 integrity metadata. Selected desktop, workshop, finance and migration files also matched their source bytes; packaged version was `0.2.0`.
- Electron offscreen smoke test loaded the packaged backend and renderer using an isolated synthetic database. The workshop queue, reminders, cash/receivables, expenses, technicians, audit logs and settings screens displayed their expected headings without error alerts or renderer console errors. Seven corresponding API reads and a manual backup verification succeeded. The workshop queue and finance screenshots were visually inspected at 1366 × 900.

The smoke harness launched a hidden test Electron window; it did not run NSIS installation or exercise every form, permission or business workflow. Test screenshots and temporary tooling remain local and excluded from publication.

## Remaining release gates

1. Install and upgrade on a clean Windows laptop, including recovery after interruption.
2. Run intake, purchasing, billing, payment, return, cash close and restore through the actual interface with workshop staff and synthetic data.
3. Import Tally XML into a disposable TallyPrime company and reconcile the resulting accounts.
4. Add installer signing before wider distribution.
5. Continue the React migration for the remaining static workshop tools.

The earlier readiness review records the stabilization baseline. This record covers the subsequent `0.2.0` milestone and publication.
