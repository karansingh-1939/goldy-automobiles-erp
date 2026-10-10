# Administrator Guide - GOLDY AUTOMOBILE ERP

This guide provides administrators with instructions for installing, setting up, managing, and maintaining the GOLDY AUTOMOBILE ERP system.

---

## 1. Initial Installation

GOLDY AUTOMOBILE ERP is designed as a secure, offline-first desktop application. It runs locally on a single machine and does not depend on any external cloud database.

### Prerequisites:

- **Operating System**: Windows 10 or Windows 11 (64-bit).
- **RAM**: Minimum 4 GB (8 GB recommended).
- **Disk Space**: At least 500 MB free space (plus additional space for database growth and backups).

### Installation Steps:

1. Obtain the installation package (`GOLDY AUTOMOBILE ERP Setup 0.1.0.exe`, or the corresponding newer version).
2. Double-click the installer to start the installation wizard.
3. Follow the on-screen prompts to choose installation location.
4. Once completed, a desktop shortcut will be created. Launch the application.

---

## 2. Onboarding & Initial Admin Setup

When you open the application for the very first time, it will detect that no database or administrator account exists and automatically display the **First-Time Setup Wizard**.

### Step 1: Create Administrator Account

Enter the following details:

- **Admin Username**: A unique username to identify the administrator.
- **Admin Password**: Choose a strong password. It must meet the security constraints:
  - Minimum 8 characters.
  - At least 1 uppercase letter (`A-Z`).
  - At least 1 lowercase letter (`a-z`).
  - At least 1 numeric digit (`0-9`).
- **Email Address** (Optional): Provide an email address for contact and recovery records.

### Step 2: Save the Recovery Code

After submitting the form, the system will:

1. Securely initialize the local SQLite database.
2. Hash and store your password using bcrypt.
3. Generate a high-entropy **Recovery Code** formatted as `GOLDY-XXXX-XXXX-XXXX-XXXX`.
4. Display this Recovery Code on the screen.

> [!IMPORTANT]
>
> - Copy this Recovery Code immediately and store it in a secure location (e.g., printed on paper, or saved in an offline password manager).
> - The system will temporarily write this code to a local text file at `data/setup/recovery-code.txt`. This file will be **automatically deleted** on your first successful login or password recovery.

---

## 3. Account Security & Recovery

### Lockout Protection

To protect against unauthorized access:

- If a user enters an incorrect password 5 consecutive times, the account is locked for **15 minutes**.
- During this time, all login attempts are blocked immediately.
- Once the 15 minutes expire, you can try logging in again.
- A successful login or password reset resets the counter to 0.

### Password Recovery (Forgot Password)

If you forget your password, you can reset it using the recovery code:

1. On the Login screen, click **Forgot Password?**.
2. Enter your **Admin Username** and your **Recovery Code**.
3. If correct, the system will allow you to set a **New Password** (must comply with password complexity rules).
4. After successfully resetting your password:
   - Your account is unlocked.
   - **A new recovery code is generated and shown to you once**.
   - Make sure to copy and save the **new recovery code**, as the old one is now permanently invalidated.

---

## 4. Offline Database Backups & Maintenance

Since GOLDY AUTOMOBILE ERP runs entirely offline, keeping reliable backups of your database is essential to prevent data loss due to hardware failures or OS issues.

### Automated Backup Configuration

The system features an automated backup scheduler that runs in the background. Administrators can customize these settings:

1. Go to **Settings > Backup Settings** in the application menu.
2. Configure the schedule:
   - **Daily**: Runs a backup once every 24 hours.
   - **Weekly**: Runs a backup once every 7 days.
3. Set **Retention Count**: The number of historical backups to keep. For example, if set to `5`, the system keeps the 5 most recent backup files and deletes older ones to save disk space.
4. Backups are stored under the application's AppData `backups/` directory, in a separate directory for each database identity. Demo and workshop backups have separate retention.

### Manual Backups

You can initiate a manual backup at any time:

1. Go to the **Backup** section.
2. Click **Backup Now**.
3. A complete, integrity-checked copy of the database will be generated and saved.

### Restoring a Backup

In the event of database corruption or data loss:

1. Go to the **Restore** section.
2. Select a backup file from the list.
3. Click **Restore**.
4. The system will perform an integrity validation on the backup file. If it passes, the database will be reverted to that point.

> [!CAUTION]
> Restoring a backup completely overwrites current database data. Ensure you create a manual backup of your current database state before restoring an older backup.

### Stabilization upgrade and recovery

- Keep a verified backup on another drive before upgrading. Run the trial on a restored copy, then reconcile stock quantities/value, customer/supplier balances, tax totals and profit with workshop records.
- Duplicate canonical registrations stop the upgrade with vehicle IDs. Resolve ownership/history deliberately on a copy; do not delete or merge vehicle histories automatically.
- Restore validates schema, integrity, foreign keys and demo/workshop identity before replacement. Historical backups remain eligible for explicit verified restore; automatic recovery uses the current database's isolated backup directory.
- A crash during restore leaves a `.restore.lock` marker and preserves rollback files. Startup intentionally stops. Preserve all main/WAL/SHM/rollback files; an administrator should verify the rollback or staged database and recover it before removing the lock. Never remove the lock and start against a missing main database.
- JSON imports and heuristic demo cleanup are disabled. Use verified SQLite backup/restore. Business JSON export excludes passwords, sessions and security settings.
- Paid workshop invoices require receipt cancellation before invoice cancellation. Invoices with returns require the return workflow. Shipment invoices cannot use counter-sale cancellation; this prevents silent stock/order corruption.
- Tally sales XML includes workshop sales, counter sales and completed customer credit notes, with rounding. Full voucher export includes active journals. Create matching ledger masters and test import into a separate Tally company before importing live records; avoid reimporting overlapping periods.
