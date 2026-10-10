import bcrypt from 'bcryptjs';
import { AccountingPostingEngine } from '../modules/accounting/posting-engine.service.js';
import { ExpenseService } from '../modules/expenses/expense.service.js';

export async function seedDemoDatabase(db) {
  const transaction = db.transaction(() => {
    if (
      db.prepare("SELECT value FROM system_settings WHERE key = 'database.mode'").get()?.value !==
      'demo'
    ) {
      throw new Error('Demo data can only be seeded into a marked demo database.');
    }
    if (
      db.prepare("SELECT value FROM system_settings WHERE key = 'demo.data_loaded'").get()
        ?.value === 'true'
    )
      return;
    // Older demo databases already contain these fixed sample identities.
    if (db.prepare("SELECT id FROM invoices WHERE invoice_number = 'INV-DEMO-001'").get()) {
      db.prepare(
        "INSERT INTO system_settings (key, value) VALUES ('demo.data_loaded', 'true') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run();
      return;
    }
    // 1. Seed admin user
    const adminRole = db.prepare("SELECT id FROM roles WHERE name = 'Admin'").get();
    if (adminRole) {
      const existingAdmin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
      if (!existingAdmin) {
        const passwordHash = bcrypt.hashSync('Admin@12345', 12);
        db.prepare(
          `
          INSERT INTO users (name, username, password_hash, role_id, is_active)
          VALUES (?, ?, ?, ?, 1)
        `,
        ).run('System Administrator', 'admin', passwordHash, adminRole.id);
      }
    }

    // 2. Seed suppliers
    const suppliers = [
      {
        name: 'Bharat Colour World',
        phone: '9876543210',
        email: 'bharat@example.com',
        gstin: '06AAAAA1111A1Z1',
        address: 'Kunjpura Road, Karnal',
      },
      {
        name: 'Balbir Singh & Bros',
        phone: '9876543211',
        email: 'balbir@example.com',
        gstin: '06BBBBB2222B1Z2',
        address: 'Railway Road, Karnal',
      },
      {
        name: 'Rajiv Syndicate',
        phone: '9876543212',
        email: 'rajiv@example.com',
        gstin: '06CCCCC3333C1Z3',
        address: 'Model Town, Karnal',
      },
      {
        name: 'Power Technologies',
        phone: '9876543213',
        email: 'power@example.com',
        gstin: '06DDDDD4444D1Z4',
        address: 'GT Road, Karnal',
      },
    ];

    const insertSupplier = db.prepare(`
      INSERT OR IGNORE INTO suppliers (name, phone, email, gstin, address, city, state, pincode, is_active)
      VALUES (?, ?, ?, ?, ?, 'Karnal', 'Haryana', '132001', 1)
    `);

    for (const sup of suppliers) {
      insertSupplier.run(sup.name, sup.phone, sup.email, sup.gstin, sup.address);
    }

    // 3. Seed warehouses
    db.prepare(
      `
      INSERT OR IGNORE INTO warehouses (name, code, address, is_active)
      VALUES ('Godown A', 'GDN-A', 'Sector 3, Karnal', 1)
    `,
    ).run();

    const mainWarehouse = db.prepare("SELECT id FROM warehouses WHERE code = 'MAIN'").get();
    const godownA = db.prepare("SELECT id FROM warehouses WHERE code = 'GDN-A'").get();
    const sup1 = db.prepare("SELECT id FROM suppliers WHERE name = 'Bharat Colour World'").get();

    // 4. Seed inventory items
    const items = [
      {
        sku: 'OIL-15W40',
        name: 'Engine Oil 15W40',
        category: 'Lubricants',
        purchase: 250,
        selling: 350,
        min: 20,
        gst: 18,
        hsn: '2710',
      },
      {
        sku: 'FILT-OIL',
        name: 'Oil Filter',
        category: 'Engine Parts',
        purchase: 80,
        selling: 120,
        min: 15,
        gst: 18,
        hsn: '8421',
      },
      {
        sku: 'BRK-PAD',
        name: 'Front Brake Pads',
        category: 'Engine Parts',
        purchase: 600,
        selling: 950,
        min: 10,
        gst: 18,
        hsn: '8708',
      },
      {
        sku: 'COOL-ANT',
        name: 'Coolant',
        category: 'Lubricants',
        purchase: 150,
        selling: 220,
        min: 10,
        gst: 18,
        hsn: '3820',
      },
      {
        sku: 'PNT-RED',
        name: 'Paint Red',
        category: 'Consumables',
        purchase: 400,
        selling: 600,
        min: 5,
        gst: 18,
        hsn: '3208',
      },
    ];

    const insertItem = db.prepare(`
      INSERT OR IGNORE INTO inventory_items (sku, item_name, category, purchase_cost, selling_price, current_quantity, minimum_stock, unit, gst_rate, supplier_id, hsn_code, reorder_level, unit_of_measure, average_cost)
      VALUES (?, ?, ?, ?, ?, 0, ?, 'pcs', ?, ?, ?, ?, 'pcs', ?)
    `);

    for (const item of items) {
      insertItem.run(
        item.sku,
        item.name,
        item.category,
        item.purchase,
        item.selling,
        item.min,
        item.gst,
        sup1?.id || null,
        item.hsn,
        item.min,
        item.purchase,
      );
    }

    // Seed batches to increase stock
    const itemDbList = db
      .prepare('SELECT id, sku, purchase_cost, selling_price FROM inventory_items')
      .all();
    const insertBatch = db.prepare(`
      INSERT OR IGNORE INTO inventory_batches (item_id, warehouse_id, supplier_id, batch_number, purchase_cost, selling_price, quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertTx = db.prepare(`
      INSERT INTO inventory_transactions (item_id, batch_id, warehouse_id, transaction_type, direction, quantity, unit_cost, notes)
      VALUES (?, ?, ?, 'Opening Stock', 'IN', ?, ?, 'Demo opening stock')
    `);

    for (const it of itemDbList) {
      if (mainWarehouse) {
        insertBatch.run(
          it.id,
          mainWarehouse.id,
          sup1?.id || null,
          'BATCH-001',
          it.purchase_cost,
          it.selling_price,
          50,
        );
        const batch = db
          .prepare(
            "SELECT id FROM inventory_batches WHERE item_id = ? AND warehouse_id = ? AND batch_number = 'BATCH-001'",
          )
          .get(it.id, mainWarehouse.id);
        if (batch) {
          insertTx.run(it.id, batch.id, mainWarehouse.id, 50, it.purchase_cost);
        }
      }
      if (godownA) {
        insertBatch.run(
          it.id,
          godownA.id,
          sup1?.id || null,
          'BATCH-002',
          it.purchase_cost,
          it.selling_price,
          30,
        );
        const batch = db
          .prepare(
            "SELECT id FROM inventory_batches WHERE item_id = ? AND warehouse_id = ? AND batch_number = 'BATCH-002'",
          )
          .get(it.id, godownA.id);
        if (batch) {
          insertTx.run(it.id, batch.id, godownA.id, 30, it.purchase_cost);
        }
      }

      // Update current quantity sum
      db.prepare(
        'UPDATE inventory_items SET current_quantity = (SELECT SUM(quantity) FROM inventory_batches WHERE item_id = ?) WHERE id = ?',
      ).run(it.id, it.id);
    }

    // 5. Seed Customers & Vehicles
    db.prepare(
      `
      INSERT OR IGNORE INTO customers (id, name, phone, email, address, city, state, pincode)
      VALUES (1, 'Ramesh Kumar', '9812345678', 'ramesh@example.com', '123 Model Town', 'Karnal', 'Haryana', '132001')
    `,
    ).run();

    db.prepare(
      `
      INSERT OR IGNORE INTO customers (id, name, phone, email, address, city, state, pincode)
      VALUES (2, 'Sunita Singh', '9812345679', 'sunita@example.com', '456 Urban Estate', 'Karnal', 'Haryana', '132001')
    `,
    ).run();

    db.prepare(
      `
      INSERT OR IGNORE INTO customers (id, name, phone, email, address, city, state, pincode)
      VALUES (3, 'Vikram Malhotra', '9812345680', 'vikram@example.com', '789 Sector 13', 'Karnal', 'Haryana', '132001')
    `,
    ).run();

    db.prepare(
      `
      INSERT OR IGNORE INTO vehicles (id, customer_id, registration_number, registration_number_normalized, make, model, variant, fuel_type, year, odometer_reading)
      VALUES (1, 1, 'HR-05-AA-1234', 'HR05AA1234', 'Mahindra', 'Scorpio', 'S11', 'Diesel', 2021, 45000)
    `,
    ).run();

    db.prepare(
      `
      INSERT OR IGNORE INTO vehicles (id, customer_id, registration_number, registration_number_normalized, make, model, variant, fuel_type, year, odometer_reading)
      VALUES (2, 2, 'HR-05-BB-5678', 'HR05BB5678', 'Maruti Suzuki', 'Swift', 'VXI', 'Petrol', 2020, 32000)
    `,
    ).run();

    db.prepare(
      `
      INSERT OR IGNORE INTO vehicles (id, customer_id, registration_number, registration_number_normalized, make, model, variant, fuel_type, year, odometer_reading)
      VALUES (3, 3, 'HR-05-CC-9012', 'HR05CC9012', 'Hyundai', 'i20', 'Asta', 'Petrol', 2022, 12000)
    `,
    ).run();

    // 6. Seed Job Cards
    // JC-DEMO-001 (COMPLETED)
    db.prepare(
      `
      INSERT OR IGNORE INTO job_cards (id, job_card_number, customer_id, vehicle_id, status, complaint, diagnosis, odometer_reading, estimated_amount, opened_at, closed_at)
      VALUES (1, 'JC-DEMO-001', 1, 1, 'COMPLETED', 'Engine oil leak and check brakes', 'Replaced engine oil and filter, replaced front brake pads', 45200, 2500, '2026-06-01T10:00:00Z', '2026-06-01T16:00:00Z')
    `,
    ).run();

    // JC-DEMO-002 (IN_PROGRESS)
    db.prepare(
      `
      INSERT OR IGNORE INTO job_cards (id, job_card_number, customer_id, vehicle_id, status, complaint, diagnosis, odometer_reading, estimated_amount, opened_at)
      VALUES (2, 'JC-DEMO-002', 2, 2, 'IN_PROGRESS', 'AC not cooling, periodic service', 'To clean AC filter and top-up coolant', 32150, 1500, '2026-06-14T09:00:00Z')
    `,
    ).run();

    // JC-DEMO-003 (DRAFT)
    db.prepare(
      `
      INSERT OR IGNORE INTO job_cards (id, job_card_number, customer_id, vehicle_id, status, complaint, odometer_reading, estimated_amount, opened_at)
      VALUES (3, 'JC-DEMO-003', 3, 3, 'DRAFT', 'Left rear door dent and paint', 12100, 5000, '2026-06-14T14:30:00Z')
    `,
    ).run();

    // Add items to JC-DEMO-001 (Oil, Filter, Brake Pads, Labor)
    const oilItem = db.prepare("SELECT id FROM inventory_items WHERE sku = 'OIL-15W40'").get();
    const filterItem = db.prepare("SELECT id FROM inventory_items WHERE sku = 'FILT-OIL'").get();
    const padsItem = db.prepare("SELECT id FROM inventory_items WHERE sku = 'BRK-PAD'").get();
    const oilBatch =
      oilItem && mainWarehouse
        ? db
            .prepare('SELECT id FROM inventory_batches WHERE item_id = ? AND warehouse_id = ?')
            .get(oilItem.id, mainWarehouse.id)
        : null;
    const filterBatch =
      filterItem && mainWarehouse
        ? db
            .prepare('SELECT id FROM inventory_batches WHERE item_id = ? AND warehouse_id = ?')
            .get(filterItem.id, mainWarehouse.id)
        : null;
    const padsBatch =
      padsItem && mainWarehouse
        ? db
            .prepare('SELECT id FROM inventory_batches WHERE item_id = ? AND warehouse_id = ?')
            .get(padsItem.id, mainWarehouse.id)
        : null;

    if (oilItem && oilBatch) {
      db.prepare(
        `
        INSERT OR IGNORE INTO job_card_items (id, job_card_id, item_type, inventory_item_id, batch_id, description, quantity, selling_price, purchase_cost_snapshot, gst_rate, gst_amount, line_total)
        VALUES (1, 1, 'PART', ?, ?, 'Engine Oil 15W40', 4.5, 350, 250, 18, 283.5, 1858.5)
      `,
      ).run(oilItem.id, oilBatch.id);
    }
    if (filterItem && filterBatch) {
      db.prepare(
        `
        INSERT OR IGNORE INTO job_card_items (id, job_card_id, item_type, inventory_item_id, batch_id, description, quantity, selling_price, purchase_cost_snapshot, gst_rate, gst_amount, line_total)
        VALUES (2, 1, 'PART', ?, ?, 'Oil Filter', 1, 120, 80, 18, 21.6, 141.6)
      `,
      ).run(filterItem.id, filterBatch.id);
    }
    if (padsItem && padsBatch) {
      db.prepare(
        `
        INSERT OR IGNORE INTO job_card_items (id, job_card_id, item_type, inventory_item_id, batch_id, description, quantity, selling_price, purchase_cost_snapshot, gst_rate, gst_amount, line_total)
        VALUES (3, 1, 'PART', ?, ?, 'Front Brake Pads', 1, 950, 600, 18, 171, 1121)
      `,
      ).run(padsItem.id, padsBatch.id);
    }
    db.prepare(
      `
      INSERT OR IGNORE INTO job_card_labour (id, job_card_id, description, labour_charge, gst_rate)
      VALUES (1, 1, 'Full Brake Cleaning and Oil Service Labor', 500, 18)
    `,
    ).run();

    // 7. Seed Invoices
    // INV-DEMO-001 linked to JC-DEMO-001
    // Totals calculation:
    // parts total = 1858.5 + 141.6 + 1121 = 3121.1
    // labor total = 500 * 1.18 = 590
    // grand_total = 3711.1
    // subtotal (excl gst) = (4.5*350) + 120 + 950 + 500 = 1575 + 120 + 950 + 500 = 3145
    // taxable_amount = 3145
    // gst_total = 18% of 3145 = 566.1 => cgst_total = 283.05, sgst_total = 283.05
    // grand_total = 3711.1
    // cost_total = (4.5*250) + 80 + 600 + 0 = 1125 + 80 + 600 = 1805
    // revenue = 3145 (without tax)
    // gross_profit = 3145 - 1805 = 1340
    // net_profit = 1340 (no general expenses allocated to this specific invoice)
    db.prepare(
      `
      INSERT OR IGNORE INTO invoices (id, invoice_number, job_card_id, customer_id, vehicle_id, invoice_date, subtotal, discount_total, taxable_amount, cgst_total, sgst_total, igst_total, gst_total, grand_total, amount_paid, status, payment_status, revenue, cost_total, gross_profit, net_profit)
      VALUES (1, 'INV-DEMO-001', 1, 1, 1, '2026-06-01', 3145, 0, 3145, 283.05, 283.05, 0, 566.1, 3711.1, 3711.1, 'FINALIZED', 'PAID', 3145, 1805, 1340, 1340)
    `,
    ).run();

    // Add invoice items matching job card items
    if (oilItem && oilBatch) {
      db.prepare(
        `
        INSERT OR IGNORE INTO invoice_items (invoice_id, item_type, inventory_item_id, batch_id, description, quantity, unit_price, purchase_cost_snapshot, discount_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, line_revenue, line_cost, line_profit, line_total)
        VALUES (1, 'PART', ?, ?, 'Engine Oil 15W40', 4.5, 350, 250, 0, 18, 141.75, 141.75, 0, 1575, 1125, 450, 1858.5)
      `,
      ).run(oilItem.id, oilBatch.id);
    }
    if (filterItem && filterBatch) {
      db.prepare(
        `
        INSERT OR IGNORE INTO invoice_items (invoice_id, item_type, inventory_item_id, batch_id, description, quantity, unit_price, purchase_cost_snapshot, discount_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, line_revenue, line_cost, line_profit, line_total)
        VALUES (1, 'PART', ?, ?, 'Oil Filter', 1, 120, 80, 0, 18, 10.8, 10.8, 0, 120, 80, 40, 141.6)
      `,
      ).run(filterItem.id, filterBatch.id);
    }
    if (padsItem && padsBatch) {
      db.prepare(
        `
        INSERT OR IGNORE INTO invoice_items (invoice_id, item_type, inventory_item_id, batch_id, description, quantity, unit_price, purchase_cost_snapshot, discount_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, line_revenue, line_cost, line_profit, line_total)
        VALUES (1, 'PART', ?, ?, 'Front Brake Pads', 1, 950, 600, 0, 18, 85.5, 85.5, 0, 950, 600, 350, 1121)
      `,
      ).run(padsItem.id, padsBatch.id);
    }
    db.prepare(
      `
      INSERT OR IGNORE INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, purchase_cost_snapshot, discount_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, line_revenue, line_cost, line_profit, line_total)
      VALUES (1, 'LABOR', 'Full Brake Cleaning and Oil Service Labor', 1, 500, 0, 0, 18, 45, 45, 0, 500, 0, 500, 590)
    `,
    ).run();

    // Deduct stock in demo for INV-DEMO-001 parts
    if (oilItem && oilBatch) {
      db.prepare('UPDATE inventory_batches SET quantity = quantity - 4.5 WHERE id = ?').run(
        oilBatch.id,
      );
      db.prepare(
        "INSERT INTO inventory_transactions (item_id, batch_id, warehouse_id, transaction_type, direction, quantity, unit_cost, notes, reference_type, reference_id) VALUES (?, ?, ?, 'Consumption', 'OUT', 4.5, 250, 'Sales consumption', 'invoices', 1)",
      ).run(oilItem.id, oilBatch.id, mainWarehouse.id);
    }
    if (filterItem && filterBatch) {
      db.prepare('UPDATE inventory_batches SET quantity = quantity - 1 WHERE id = ?').run(
        filterBatch.id,
      );
      db.prepare(
        "INSERT INTO inventory_transactions (item_id, batch_id, warehouse_id, transaction_type, direction, quantity, unit_cost, notes, reference_type, reference_id) VALUES (?, ?, ?, 'Consumption', 'OUT', 1, 80, 'Sales consumption', 'invoices', 1)",
      ).run(filterItem.id, filterBatch.id, mainWarehouse.id);
    }
    if (padsItem && padsBatch) {
      db.prepare('UPDATE inventory_batches SET quantity = quantity - 1 WHERE id = ?').run(
        padsBatch.id,
      );
      db.prepare(
        "INSERT INTO inventory_transactions (item_id, batch_id, warehouse_id, transaction_type, direction, quantity, unit_cost, notes, reference_type, reference_id) VALUES (?, ?, ?, 'Consumption', 'OUT', 1, 600, 'Sales consumption', 'invoices', 1)",
      ).run(padsItem.id, padsBatch.id, mainWarehouse.id);
    }

    for (const it of itemDbList) {
      db.prepare(
        'UPDATE inventory_items SET current_quantity = (SELECT SUM(quantity) FROM inventory_batches WHERE item_id = ?) WHERE id = ?',
      ).run(it.id, it.id);
    }

    db.prepare(
      `
      INSERT OR IGNORE INTO profit_records (invoice_id, revenue, cost_total, gross_profit, expense_total, net_profit)
      VALUES (1, 3145, 1805, 1340, 0, 1340)
    `,
    ).run();

    // 8. Seed Expenses
    // Rent, Electricity, Salary for June 2026
    db.prepare(
      `
      INSERT OR IGNORE INTO expenses (id, category, amount, expense_date, description, payment_mode)
      VALUES (1, 'Rent', 8000, '2026-06-05', 'Workshop Rent June 2026', 'Bank Transfer')
    `,
    ).run();
    db.prepare(
      `
      INSERT OR IGNORE INTO expenses (id, category, amount, expense_date, description, payment_mode)
      VALUES (2, 'Electricity', 1500, '2026-06-10', 'Electricity Bill June 2026', 'Cash')
    `,
    ).run();
    db.prepare(
      `
      INSERT OR IGNORE INTO expenses (id, category, amount, expense_date, description, payment_mode)
      VALUES (3, 'Salary', 12000, '2026-06-07', 'Mechanic Salim Salary June 2026', 'Bank Transfer')
    `,
    ).run();
    const posting = new AccountingPostingEngine(db);
    const ledger = (key) => posting.ledgerResolver.getLedgerId(1, key);
    const openingStock = db
      .prepare(
        "SELECT ROUND(COALESCE(SUM(quantity * unit_cost), 0), 2) AS total FROM inventory_transactions WHERE notes = 'Demo opening stock' AND direction = 'IN'",
      )
      .get().total;
    if (openingStock > 0)
      posting.post({
        companyId: 1,
        voucherType: 'Journal',
        voucherDate: '2026-06-01',
        referenceTable: 'demo_opening_stock',
        referenceId: 1,
        narration: 'Demo opening inventory',
        entries: [
          { ledgerId: ledger('inventory_stock'), type: 'DEBIT', amount: openingStock },
          { ledgerId: ledger('capital_account'), type: 'CREDIT', amount: openingStock },
        ],
      });
    posting.post({
      companyId: 1,
      voucherType: 'Sales',
      voucherDate: '2026-06-01',
      referenceTable: 'invoices',
      referenceId: 1,
      narration: 'Demo invoice INV-DEMO-001',
      entries: [
        { ledgerId: ledger('cash_in_hand'), type: 'DEBIT', amount: 3711.1 },
        { ledgerId: ledger('parts_sales'), type: 'CREDIT', amount: 2645 },
        { ledgerId: ledger('labour_sales'), type: 'CREDIT', amount: 500 },
        { ledgerId: ledger('cgst_output'), type: 'CREDIT', amount: 283.05 },
        { ledgerId: ledger('sgst_output'), type: 'CREDIT', amount: 283.05 },
      ],
    });
    posting.post({
      companyId: 1,
      voucherType: 'Journal',
      voucherDate: '2026-06-01',
      referenceTable: 'invoices',
      referenceId: 1,
      narration: 'Demo cost of goods sold',
      entries: [
        { ledgerId: ledger('cogs'), type: 'DEBIT', amount: 1805 },
        { ledgerId: ledger('inventory_stock'), type: 'CREDIT', amount: 1805 },
      ],
    });
    const expenseService = new ExpenseService(db);
    for (const expense of db.prepare('SELECT * FROM expenses WHERE id IN (1, 2, 3)').all()) {
      expenseService.postExpense(expense, null);
    }
    db.prepare(
      "INSERT INTO system_settings (key, value) VALUES ('demo.data_loaded', 'true') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run();
  });

  transaction();
}
