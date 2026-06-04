const warehouses = [
  ['MAIN', 'Main Store', 'Primary workshop store'],
  ['OIL', 'Oil Store', 'Lubricants and fluids store'],
  ['BATTERY', 'Battery Store', 'Battery and electrical storage'],
  ['TYRE', 'Tyre Store', 'Tyres and wheel inventory'],
];

export async function run(db) {
  const insertWarehouse = db.prepare(`
    INSERT INTO warehouses (code, name, address)
    VALUES (?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      address = excluded.address,
      updated_at = CURRENT_TIMESTAMP
  `);

  const transaction = db.transaction(() => {
    for (const warehouse of warehouses) {
      insertWarehouse.run(...warehouse);
    }
  });

  transaction();
}
