const categories = [
  ['Engine Parts', 'Engine repair and replacement parts.'],
  ['Electrical', 'Electrical and wiring components.'],
  ['Lubricants', 'Oils, grease, coolant, and fluids.'],
  ['Body Parts', 'Exterior and body repair parts.'],
  ['Consumables', 'Fast-moving workshop consumables.'],
];

export async function run(db) {
  const insertCategory = db.prepare(`
    INSERT INTO inventory_categories (name, description)
    VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET
      description = excluded.description,
      updated_at = CURRENT_TIMESTAMP
  `);

  const transaction = db.transaction(() => {
    for (const category of categories) {
      insertCategory.run(...category);
    }
  });

  transaction();
}
