-- Migration: Customer Relationship, Loyalty Program, and Promotions Engine
PRAGMA foreign_keys = OFF;

-- 1. Create loyalty_memberships table
CREATE TABLE IF NOT EXISTS loyalty_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL DEFAULT 1,
  customer_id INTEGER NOT NULL UNIQUE,
  tier TEXT NOT NULL DEFAULT 'Standard' CHECK(tier IN ('Standard', 'Silver', 'Gold', 'Platinum')),
  points_balance INTEGER NOT NULL DEFAULT 0 CHECK(points_balance >= 0),
  joined_at TEXT NOT NULL,
  expires_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- 2. Create loyalty_ledger table
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  membership_id INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('EARNED', 'REDEEMED', 'MANUAL_ADJUSTMENT')),
  points INTEGER NOT NULL,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (membership_id) REFERENCES loyalty_memberships(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 3. Create customer_referrals table
CREATE TABLE IF NOT EXISTS customer_referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL DEFAULT 1,
  referrer_customer_id INTEGER NOT NULL,
  referred_customer_id INTEGER UNIQUE,
  referral_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'COMPLETED', 'REWARDED')),
  reward_points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (referrer_customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (referred_customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- 4. Create promotions table
CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  promo_type TEXT NOT NULL CHECK(promo_type IN ('PERCENTAGE', 'FIXED_AMOUNT')),
  value REAL NOT NULL CHECK(value > 0),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  min_purchase_amount REAL NOT NULL DEFAULT 0 CHECK(min_purchase_amount >= 0),
  max_discount_amount REAL NOT NULL DEFAULT 0 CHECK(max_discount_amount >= 0),
  target_tier TEXT CHECK(target_tier IN ('Standard', 'Silver', 'Gold', 'Platinum')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- 5. Create service_reminders table
CREATE TABLE IF NOT EXISTS service_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL DEFAULT 1,
  customer_id INTEGER NOT NULL,
  vehicle_id INTEGER NOT NULL,
  reminder_type TEXT NOT NULL CHECK(reminder_type IN ('MAINTENANCE', 'WARRANTY_EXPIRY', 'GENERAL_CHECKUP')),
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SENT', 'DISMISSED')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

-- 6. Add Indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_memberships_customer ON loyalty_memberships(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_membership ON loyalty_ledger(membership_id);
CREATE INDEX IF NOT EXISTS idx_customer_referrals_referrer ON customer_referrals(referrer_customer_id);
CREATE INDEX IF NOT EXISTS idx_service_reminders_customer ON service_reminders(customer_id);

PRAGMA foreign_keys = ON;
