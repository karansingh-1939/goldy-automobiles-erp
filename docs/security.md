# Security Documentation - GOLDY AUTOMOBILE ERP

This document outlines the security architecture, onboarding procedures, lockout policies, and recovery flows implemented in the GOLDY AUTOMOBILE ERP application.

---

## 1. Onboarding & First-Time Setup

When the application is launched for the first time on a new installation (i.e. no administrator account exists in the database), the user is presented with the **First-Time Setup** wizard.

### Collected Information:

- **Admin Username** (Required)
- **Admin Password** (Required, must satisfy complexity rules)
- **Email Address** (Optional)

Upon submitting the form:

1. The password is encrypted using **bcrypt** (cost factor 12).
2. The user record is saved in the database.
3. A high-entropy **Recovery Code** (`GOLDY-XXXX-XXXX-XXXX-XXXX`) is cryptographically generated.
4. The bcrypt hash of the recovery code is stored in the database.
5. The plaintext recovery code is written temporarily to `data/setup/recovery-code.txt` to assist in first-time setup and is displayed once to the user.
6. The file `recovery-code.txt` is automatically deleted upon the **first successful login** or **successful password reset**.

---

## 2. Password Complexity Requirements

To protect the system from weak credentials, a strict complexity validator is applied to all administrator password creation, reset, or change actions:

- Minimum length of **8 characters**.
- Must contain at least **one uppercase letter** (`A-Z`).
- Must contain at least **one lowercase letter** (`a-z`).
- Must contain at least **one numeric digit** (`0-9`).

---

## 3. Account Lockout Policy

To mitigate brute-force and dictionary attacks, a database-backed account lockout system is active:

- **Lockout Trigger**: 5 consecutive failed login attempts or 5 consecutive failed password recovery attempts.
- **Lockout Duration**: 15 minutes.
- **Counter Reset**: Any successful login or password reset resets the failed attempts counter to 0 and clears the lockout timestamp.
- **Security Check**: During the lockout period, all requests are blocked immediately at the API level (returning HTTP `429 Too Many Requests`) without executing cryptographically expensive password hashing checks.

---

## 4. Administrator Password Recovery Flow

If the administrator password is forgotten, it can be reset using the **Forgot Password** flow:

1. Click **Forgot Password?** on the login screen.
2. Enter the **Admin Username** and the original/latest **Recovery Code** exactly as generated.
3. The server validates the recovery code against the stored hash in the database.
4. If correct, the UI unlocks the **Reset Password** screen.
5. Enter a new password satisfying the complexity requirements.
6. Upon a successful reset:
   - The password hash is updated.
   - A **new recovery code is generated** and rotated (invalidating the old recovery code).
   - Plaintext of the new recovery code is displayed to the user once.
   - All lockout counters and timestamps are reset.
   - The file `data/setup/recovery-code.txt` is cleaned up.

---

## 5. Local Network Exposure

The API listens on `127.0.0.1` only, so other computers on the workshop network or the internet cannot reach it. API requests require a bearer token held by the desktop window, and no cross-origin (CORS) access is granted, so websites opened in a browser on the same laptop cannot read or change workshop data.

Requests whose `Host` header is not `127.0.0.1`, `localhost` or `[::1]` are refused with HTTP 403. This blocks DNS-rebinding attacks, where a malicious website points its own domain at `127.0.0.1` to reach the local login, setup and recovery endpoints.

---

## 6. General Security Recommendations

1. **Save Your Recovery Code Safely**: Keep your recovery code printed or stored in an offline password manager. If you lose both your password and your recovery code, the database cannot be recovered without developer intervention.
2. **Delete Recovery Files**: Ensure that `data/setup/recovery-code.txt` is deleted. The software does this automatically on first login, but double-checking is recommended.
3. **No Network Dependency**: Since the application is offline-first, all security controls (bcrypt hashing, lockout tracking, recovery verification) run completely locally on your machine.
4. **Keep the Laptop Account Protected**: The database, backups and logs live in the Windows user's AppData folder. Use a Windows password, keep Windows updated, and copy backups to a USB drive kept in a safe place.
5. **The Source Repository Is Public and Holds Code Only**: The business name, address and phone numbers on printed bills are intentionally public. Customer, vehicle, invoice and payment records live only in the laptop's SQLite database and backups, which are never committed.

---

## 7. Repository Safety Rules

`npm run check` (run locally and by GitHub CI) starts with `npm run check:safety`, which fails if git would publish:

- database files (`*.sqlite`, `*.db` and their WAL/SHM/journal files) or the `data/`, `backups/`, `Tax_Invoices/` or `job_cards/` folders;
- `.env` files (only `.env.example` is allowed) or private key and certificate files;
- text that matches real secret formats, such as payment-gateway live keys (Razorpay, Stripe), GitHub, AWS, Google, Slack or AI service keys, and private key blocks;
- any file that `.gitignore` excludes but was force-added.

When adding integrations such as online payments or SMS:

1. Put keys in `.env` or the application's Settings screen, never in source code, tests or documentation.
2. Use only fictional customers, phone numbers and vehicles in tests, fixtures and screenshots.
3. If a key is ever committed, revoke it at the provider immediately; deleting the commit is not enough because public history is copied.

Also enable GitHub secret scanning and push protection under the repository's **Settings → Code security**.
