PRAGMA foreign_keys = OFF;

-- Add credit_limit column to customers table
ALTER TABLE customers ADD COLUMN credit_limit REAL DEFAULT NULL;

PRAGMA foreign_keys = ON;
