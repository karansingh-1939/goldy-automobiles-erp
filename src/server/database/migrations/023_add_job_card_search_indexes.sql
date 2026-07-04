-- Beneficial search indexes for job card registry speed optimization
CREATE INDEX IF NOT EXISTS idx_vehicles_registration_number ON vehicles(registration_number);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_job_cards_opened_at ON job_cards(opened_at);
CREATE INDEX IF NOT EXISTS idx_job_cards_created_at ON job_cards(created_at);
