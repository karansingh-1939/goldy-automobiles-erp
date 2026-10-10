# Goldy Automobiles ERP - UI Architecture Guide

This guide details the SPA client architecture, shared framework components, layout rules, state boundaries, permissions controls, and guidelines for developer contributions.

---

## 1. Directory Structure

All frontend SPA source files are located in the `src/renderer/` directory:

```
src/renderer/
├── App.jsx             # HashRouter registry and Authentication Gates
├── main.jsx            # DOM renderer and QueryClientProvider hook
├── index.html          # Shell canvas and main DOM target
├── index.css           # Global HSL tokens and Tailwind CSS overrides
├── shared/             # Shared framework files
│   ├── api/            # API wrappers (fetch, timeout, retry controls)
│   ├── store/          # Zustand global stores (theme, tokens, toasts)
│   ├── hooks/          # Custom hooks (permissions)
│   ├── utils/          # Standardized validation helpers
│   └── components/     # Reusable layout and grid elements (DataTable)
└── modules/            # Functional ERP business modules
    ├── auth/           # Login credentials forms
    ├── dashboard/      # Sales metrics dashboards
    ├── customers/      # Customer directory CRM lists
    ├── vehicles/       # Fleet details registers
    └── ...
```

---

## 2. API Layer & Centralized fetch Abstraction

To comply with sandboxing rules:

- Components **never** use direct `fetch` calls. Instead, import `api` or `apiClient` from `@/shared/api/apiClient.js`.
- The apiClient wraps request states, injects `Bearer` authorization session keys, sets query cancellation handlers via `AbortSignal`, and automatically schedules exponential backoff retries for GET requests.
- Sessions expiring with HTTP 401 trigger automatic store logout redirects.

---

## 3. Reusable UI Components & Grid Systems

### Shared DataTable Component

Standard table grids must use the unified `<DataTable />` component from `@/shared/components/DataTable.jsx`:

- **Features**: Pagination size selections (10/15/25/50), column sorting, automated skeleton pulsing loaders, border spacing, and focus rings.
- **Accessibility**: Includes table grid role tags, accessibility row indexes, and support for key presses (`Enter` to select row).

---

## 4. Role-Based Access Control (RBAC)

Permission checks must use the custom hook `usePermissions` from `@/shared/hooks/usePermissions.js`:

```javascript
import { usePermissions } from '../../shared/hooks/usePermissions.js';

const { hasPermission, role } = usePermissions();
const canWrite = hasPermission('customers.write');
```

- **Bypass Rule**: The Administrator role automatically bypasses all client-side permission gates.

---

## 5. Input Validation Rules

Standard input validation must use utilities from `@/shared/utils/validation.js`:

- `validateRequired(value)`: Checks string length.
- `validateEmail(value)`: Regular expression validator.
- `validatePhone(value)`: Checks for exactly 10 numeric digits.
- `validateGstin(value)`: Verifies 15-digit GST registry codes.
- `validateVehicleReg(value)`: Normalizes Indian license plate patterns (e.g. MH-12-AB-1234).

---

## 6. Desktop UI Accessibility & Hotkeys

All views support global quick F-key navigation binds registered in `Layout.jsx`:

- `F1`: Dashboard
- `F2`: Job Cards
- `F3`: Sales Orders
- `F4`: Inventory Catalog
- `F5`: Purchasing
- `F6`: Ledger Sheets
- `F7`: GST Reports
- `F8`: Customers list
- `F9`: System Settings
- `F10`: Vehicles fleet
- `F11`: Suppliers index
- `F12`: Warranties Hub
- `Ctrl + P`: Command Palette (Quick Search)
- `Escape`: Close modals and active dialogues
