-- Migration: 036_add_vehicle_normalized_registration
-- Description: Add registration_number_normalized column to vehicles table for duplicate prevention.

PRAGMA foreign_keys = OFF;

-- 1. Alter vehicles table to add registration_number_normalized column
ALTER TABLE vehicles ADD COLUMN registration_number_normalized TEXT;

-- 2. Populate normalized registration numbers for existing records
UPDATE vehicles 
SET registration_number_normalized = replace(replace(replace(replace(upper(registration_number), ' ', ''), '-', ''), '_', ''), '/', '');

-- 3. Create index for fast normalized registration lookups
CREATE INDEX IF NOT EXISTS idx_vehicles_registration_normalized ON vehicles(registration_number_normalized);

PRAGMA foreign_keys = ON;
