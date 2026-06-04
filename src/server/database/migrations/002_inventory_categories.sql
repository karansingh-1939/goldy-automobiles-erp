PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS inventory_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_categories_name ON inventory_categories(name);

ALTER TABLE inventory_items ADD COLUMN category_id INTEGER REFERENCES inventory_categories(id);

CREATE INDEX IF NOT EXISTS idx_inventory_items_category_id ON inventory_items(category_id);
