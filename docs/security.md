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

## 5. General Security Recommendations

1. **Save Your Recovery Code Safely**: Keep your recovery code printed or stored in an offline password manager. If you lose both your password and your recovery code, the database cannot be recovered without developer intervention.
2. **Delete Recovery Files**: Ensure that `data/setup/recovery-code.txt` is deleted. The software does this automatically on first login, but double-checking is recommended.
3. **No Network Dependency**: Since the application is offline-first, all security controls (bcrypt hashing, lockout tracking, recovery verification) run completely locally on your machine.
