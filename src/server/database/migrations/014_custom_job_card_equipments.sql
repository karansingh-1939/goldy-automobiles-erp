-- Migration: 014_custom_job_card_equipments
-- Add columns for fuel level, promised delivery at, and equipment/accessories checklist to job_cards

PRAGMA foreign_keys = OFF;

ALTER TABLE job_cards ADD COLUMN fuel_level TEXT;
ALTER TABLE job_cards ADD COLUMN promised_delivery_at TEXT;
ALTER TABLE job_cards ADD COLUMN toolkit_present INTEGER DEFAULT 0 CHECK (toolkit_present IN (0, 1));
ALTER TABLE job_cards ADD COLUMN spare_wheel_present INTEGER DEFAULT 0 CHECK (spare_wheel_present IN (0, 1));
ALTER TABLE job_cards ADD COLUMN jack_present INTEGER DEFAULT 0 CHECK (jack_present IN (0, 1));
ALTER TABLE job_cards ADD COLUMN stereo_present INTEGER DEFAULT 0 CHECK (stereo_present IN (0, 1));
ALTER TABLE job_cards ADD COLUMN battery_brand TEXT;

PRAGMA foreign_keys = ON;
