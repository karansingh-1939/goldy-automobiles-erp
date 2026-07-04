-- Migration: 020_rename_company_to_goldy_automobile
-- Safely update company name values in system_settings if they contain old variations

UPDATE system_settings
SET value = 'GOLDY AUTOMOBILE',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'company.name'
  AND value IN ('Goldy Automobiles', 'Goldy Automobile', 'GOLDY AUTOMOBILES');
