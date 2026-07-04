PRAGMA foreign_keys = OFF;

-- Create new customers table with nullable unique phone
CREATE TABLE customers_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  alternate_phone TEXT,
  email TEXT,
  gstin TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from customers to customers_new
INSERT INTO customers_new (
  id, name, phone, alternate_phone, email, gstin, address, city, state, pincode, notes, created_at, updated_at
)
SELECT
  id, name, phone, alternate_phone, email, gstin, address, city, state, pincode, notes, created_at, updated_at
FROM customers;

-- Drop the old customers table
DROP TABLE customers;

-- Rename customers_new to customers
ALTER TABLE customers_new RENAME TO customers;

PRAGMA foreign_keys = ON;
