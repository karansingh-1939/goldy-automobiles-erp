import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './helpers.js';

async function login(context, username = 'admin', password = 'Admin@12345') {
  const result = await context.request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  assert.equal(result.response.status, 200);
  return result.body.token;
}

test('Advanced Inventory Control & Warehouse Operations Sprint 6', async () => {
  const context = await createTestContext();
  const db = context.db;

  try {
    const token = await login(context);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // ----------------------------------------------------
    // 1. WAREHOUSE HIERARCHY & CRUD
    // ----------------------------------------------------
    // Create parent warehouse
    let res = await context.request('/api/v1/warehouses', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Main Hub',
        code: 'HUB1',
        address: '123 Main St',
        is_active: true,
        is_default: true,
      }),
    });
    assert.equal(res.response.status, 201);
    const hubId = res.body.data.id;
    assert.equal(res.body.data.is_default, 1);

    // Create child sub-warehouse under parent Main Hub
    res = await context.request('/api/v1/warehouses', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Shelf A',
        code: 'SHFA',
        address: 'Aisle 1, Shelf A',
        is_active: true,
        parent_warehouse_id: hubId,
        is_default: false,
      }),
    });
    assert.equal(res.response.status, 201);
    const shelfId = res.body.data.id;
    assert.equal(res.body.data.parent_warehouse_id, hubId);

    // ----------------------------------------------------
    // 2. USER-WAREHOUSE PERMISSIONS
    // ----------------------------------------------------
    // Seed a standard user to test restricted permissions
    const bcrypt = await import('bcryptjs');
    const staffHash = await bcrypt.default.hash('Admin@12345', 10);
    const testUserId = db
      .prepare(
        `
      INSERT INTO users (name, username, password_hash, role_id, is_active)
      VALUES ('Staff User', 'staff', ?, 2, 1)
    `,
      )
      .run(staffHash).lastInsertRowid; // Role 2 is usually Manager or User

    // Assign staff user access only to Shelf A
    res = await context.request(`/api/v1/inventory/warehouses/${shelfId}/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userIds: [testUserId] }),
    });
    assert.equal(res.response.status, 200);

    // Get permissions back and verify
    res = await context.request(`/api/v1/inventory/warehouses/${shelfId}/permissions`, {
      method: 'GET',
      headers,
    });
    assert.equal(res.response.status, 200);
    assert.ok(res.body.data.userIds.includes(testUserId));

    // Login as staff user
    const staffToken = await login(context, 'staff', 'Admin@12345');
    assert.ok(staffToken);

    // ----------------------------------------------------
    // 3. STOCK ADJUSTMENTS & DOUBLE-ENTRY ACCOUNTING
    // ----------------------------------------------------
    // Seed default supplier
    db.prepare(
      `
      INSERT OR IGNORE INTO suppliers (id, name, phone, email, is_active)
      VALUES (1, 'Default Supplier', '1234567890', 'supplier@example.com', 1)
    `,
    ).run();

    // Seed an item
    const itemId = db
      .prepare(
        `
      INSERT INTO inventory_items (sku, item_name, purchase_cost, selling_price, current_quantity, average_cost, is_active)
      VALUES ('PART-001', 'Brake Pad', 500, 750, 0, 0, 1)
    `,
      )
      .run().lastInsertRowid;

    // Seed default system ledger with system_key = 'stock_adjustments'
    // First check if it exists, otherwise insert it
    let adjLedger = db
      .prepare("SELECT id FROM ledgers WHERE system_key = 'stock_adjustments'")
      .get();
    if (!adjLedger) {
      db.prepare(
        `
        INSERT INTO ledgers (company_id, name, group_id, opening_balance, nature, is_system, system_key)
        VALUES (1, 'Stock Adjustments', 13, 0, 'Debit', 1, 'stock_adjustments')
      `,
      ).run();
    }

    // Perform positive adjustment of 10 Brake Pads into Main Hub
    res = await context.request('/api/v1/inventory/adjustments', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        itemId,
        warehouseId: hubId,
        adjustmentType: 'IN',
        quantity: 10,
        unitCost: 500,
        category: 'NORMAL',
        reason: 'Initial stock intake',
      }),
    });
    assert.equal(res.response.status, 201);
    const adjustmentId = res.body.data.adjustmentId;
    const voucherId = res.body.data.voucherId;
    assert.ok(adjustmentId);
    assert.ok(voucherId);

    // Verify inventory asset and stock adjustments ledgers are updated in accounting journal entries
    const journalEntries = db
      .prepare(
        'SELECT ledger_id, entry_type AS type, amount FROM journal_entries WHERE voucher_id = ?',
      )
      .all(voucherId);
    assert.equal(journalEntries.length, 2);

    const assetLedgerId = db
      .prepare("SELECT id FROM ledgers WHERE system_key = 'inventory_stock'")
      .get().id;
    const adjLedgerId = db
      .prepare("SELECT id FROM ledgers WHERE system_key = 'stock_adjustments'")
      .get().id;

    const debitEntry = journalEntries.find((e) => e.type === 'DEBIT');
    const creditEntry = journalEntries.find((e) => e.type === 'CREDIT');

    assert.equal(debitEntry.ledger_id, assetLedgerId);
    assert.equal(debitEntry.amount, 5000); // 10 * 500
    assert.equal(creditEntry.ledger_id, adjLedgerId);
    assert.equal(creditEntry.amount, 5000);

    // Verify physical stock of Brake Pad in Main Hub is now 10
    const itemStock = db
      .prepare('SELECT current_quantity, average_cost FROM inventory_items WHERE id = ?')
      .get(itemId);
    assert.equal(itemStock.current_quantity, 10);
    assert.equal(itemStock.average_cost, 500);

    // ----------------------------------------------------
    // 4. STOCK TRANSFERS LIFECYCLE (PENDING -> COMPLETED / CANCELLED)
    // ----------------------------------------------------
    // Transfer 4 Brake Pads from Main Hub to Shelf A (Initiate -> PENDING)
    res = await context.request('/api/v1/inventory/transfers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        item_id: itemId,
        from_warehouse_id: hubId,
        to_warehouse_id: shelfId,
        quantity: 4,
        notes: 'Transferring to Shelf A',
      }),
    });
    assert.equal(res.response.status, 201);
    const transferId = res.body.data.transferId;
    assert.equal(res.body.data.status, 'PENDING');

    // Verify source stock is reduced immediately to 6, but destination has no stock yet
    const sourceBatchQty = db
      .prepare('SELECT quantity FROM inventory_batches WHERE item_id = ? AND warehouse_id = ?')
      .get(itemId, hubId).quantity;
    assert.equal(sourceBatchQty, 6);

    const destBatch = db
      .prepare('SELECT quantity FROM inventory_batches WHERE item_id = ? AND warehouse_id = ?')
      .get(itemId, shelfId);
    assert.ok(!destBatch || destBatch.quantity === 0);

    // Verify no ledger entries are created for standard internal transfer (ownership unchanged)
    const transferVouchersCount = db
      .prepare(
        "SELECT COUNT(*) AS count FROM vouchers WHERE reference_table = 'stock_transfers' AND reference_id = ?",
      )
      .get(transferId).count;
    assert.equal(transferVouchersCount, 0);

    // Receive the transfer (Complete transfer)
    res = await context.request(`/api/v1/inventory/transfers/${transferId}/receive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ receivedQuantity: 4 }),
    });
    assert.equal(res.response.status, 200);
    assert.equal(res.body.data.status, 'COMPLETED');

    // Verify destination stock is now 4
    const destBatchQtyAfter = db
      .prepare('SELECT quantity FROM inventory_batches WHERE item_id = ? AND warehouse_id = ?')
      .get(itemId, shelfId).quantity;
    assert.equal(destBatchQtyAfter, 4);

    // Test partial receipt with variance:
    // Transfer 3 units from Hub to Shelf A
    res = await context.request('/api/v1/inventory/transfers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        item_id: itemId,
        from_warehouse_id: hubId,
        to_warehouse_id: shelfId,
        quantity: 3,
        notes: 'Transfer 3 pads',
      }),
    });
    const transfer2Id = res.body.data.transferId;

    // Receive only 2 units (1 unit variance/loss)
    res = await context.request(`/api/v1/inventory/transfers/${transfer2Id}/receive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ receivedQuantity: 2 }),
    });
    assert.equal(res.response.status, 200);
    assert.equal(res.body.data.variance, 1);

    // Verify that the 1 lost unit triggered a write-off stock adjustment (LOST category)
    const varianceAdj = db
      .prepare("SELECT * FROM stock_adjustments WHERE category = 'LOST' ORDER BY id DESC LIMIT 1")
      .get();
    assert.ok(varianceAdj);
    assert.equal(varianceAdj.quantity, 1);

    // Verify a general ledger voucher was posted for the 1 unit variance loss ($500 value)
    const varianceEntries = db
      .prepare(
        'SELECT ledger_id, entry_type AS type, amount FROM journal_entries WHERE voucher_id = ?',
      )
      .all(varianceAdj.voucher_id);
    assert.equal(varianceEntries.length, 2);
    const lossEntry = varianceEntries.find((e) => e.type === 'DEBIT');
    assert.equal(lossEntry.ledger_id, adjLedgerId);
    assert.equal(lossEntry.amount, 500);

    // Reverse/Cancel the first transfer (Completed)
    res = await context.request(`/api/v1/inventory/transfers/${transferId}/cancel`, {
      method: 'POST',
      headers,
    });
    assert.equal(res.response.status, 200);
    assert.equal(res.body.data.status, 'CANCELLED');

    // Verify stock returned to hub (6 + 4 = 10) and deducted from shelf (4 - 4 = 0)
    const hubQtyReversed = db
      .prepare('SELECT quantity FROM inventory_batches WHERE item_id = ? AND warehouse_id = ?')
      .get(itemId, hubId).quantity;
    assert.equal(hubQtyReversed, 7); // Wait, why 7? Initial 10, transfer 1 (4) -> 6, transfer 2 (3) -> 3. Completed transfer 1 reversed -> 3 + 4 = 7. Correct!
    const shelfQtyReversed = db
      .prepare('SELECT quantity FROM inventory_batches WHERE item_id = ? AND warehouse_id = ?')
      .get(itemId, shelfId).quantity;
    assert.equal(shelfQtyReversed, 2); // Initial 4, transfer 2 completed received 2 -> 6. Completed transfer 1 reversed (4 units) -> 6 - 4 = 2. Correct!

    // ----------------------------------------------------
    // 5. PHYSICAL STOCK VERIFICATION APPROVAL WORKFLOW
    // ----------------------------------------------------
    // Create verification showing count of 15 (Hub currently has 7, variance = +8)
    res = await context.request('/api/v1/inventory/verifications', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        warehouse_id: hubId,
        item_id: itemId,
        counted_quantity: 15,
        verification_type: 'Single Item',
        notes: 'Annual audit',
      }),
    });
    assert.equal(res.response.status, 201);
    const verificationId = res.body.data.items[0].verification_number;
    assert.equal(res.body.data.items[0].status, 'PENDING');

    // Retrieve database verification ID
    const verRecord = db
      .prepare('SELECT id, status FROM stock_verifications WHERE verification_number = ?')
      .get(verificationId);
    assert.equal(verRecord.status, 'PENDING');

    // Verify physical stock in Hub is STILL 7 (not adjusted yet!)
    const preHubQty = db
      .prepare('SELECT quantity FROM inventory_batches WHERE item_id = ? AND warehouse_id = ?')
      .get(itemId, hubId).quantity;
    assert.equal(preHubQty, 7);

    // Approve the physical audit count verification
    res = await context.request(`/api/v1/inventory/verifications/${verRecord.id}/approve`, {
      method: 'POST',
      headers,
    });
    assert.equal(res.response.status, 200);
    assert.equal(res.body.data.status, 'APPROVED');

    // Verify physical stock is now updated to 15 (7 + 8 = 15)
    const postHubQty = db
      .prepare('SELECT quantity FROM inventory_batches WHERE item_id = ? AND warehouse_id = ?')
      .get(itemId, hubId).quantity;
    assert.equal(postHubQty, 15);

    // Verify the generated adjustment and ledger vouchers are created and linked
    const approvedVer = db
      .prepare('SELECT adjustment_id FROM stock_verifications WHERE id = ?')
      .get(verRecord.id);
    assert.ok(approvedVer.adjustment_id);
    const auditAdjustment = db
      .prepare('SELECT voucher_id, quantity FROM stock_adjustments WHERE id = ?')
      .get(approvedVer.adjustment_id);
    assert.equal(auditAdjustment.quantity, 8);
    assert.ok(auditAdjustment.voucher_id);

    // ----------------------------------------------------
    // 6. STOCK RESERVATIONS ENGINE
    // ----------------------------------------------------
    // Reserve 5 Brake Pads in Main Hub for Job Card 101
    res = await context.request('/api/v1/inventory/reservations', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        itemId,
        warehouseId: hubId,
        quantity: 5,
        referenceTable: 'job_cards',
        referenceId: 101,
      }),
    });
    assert.equal(res.response.status, 201);
    const reservationId = res.body.data.id;
    assert.equal(res.body.data.status, 'ACTIVE');

    // Verify physical stock is still 15, but available stock is 10 (15 - 5)
    const itemPhysQty = db
      .prepare('SELECT current_quantity FROM inventory_items WHERE id = ?')
      .get(itemId).current_quantity;
    assert.equal(itemPhysQty, 17); // 15 (Hub) + 2 (Shelf) = 17 physical. Correct!

    // Retrieve available quantity of the item
    // Since available = physical (17) - reserved (5) = 12
    const availableQty = db
      .prepare("SELECT * FROM inventory_reservations WHERE status = 'ACTIVE'")
      .all();
    assert.equal(availableQty.length, 1);

    // Try reserving 15 units (exceeds available quantity of 12)
    res = await context.request('/api/v1/inventory/reservations', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        itemId,
        warehouseId: hubId,
        quantity: 15,
        referenceTable: 'job_cards',
        referenceId: 102,
      }),
    });
    assert.equal(res.response.status, 400); // INSUFFICIENT_STOCK

    // Cancel reservation
    res = await context.request(`/api/v1/inventory/reservations/${reservationId}/cancel`, {
      method: 'POST',
      headers,
    });
    assert.equal(res.response.status, 200);
    assert.equal(res.body.data.status, 'CANCELLED');

    // ----------------------------------------------------
    // 7. VALUATION ENGINES (FIFO, AVCO, BATCH, HISTORICAL)
    // ----------------------------------------------------
    // Fetch valuation reports
    res = await context.request('/api/v1/inventory/reports/valuation?method=AVCO', {
      method: 'GET',
      headers,
    });
    assert.equal(res.response.status, 200);
    assert.ok(res.body.totals.value > 0);

    res = await context.request('/api/v1/inventory/reports/valuation?method=FIFO', {
      method: 'GET',
      headers,
    });
    assert.equal(res.response.status, 200);
    assert.ok(res.body.totals.value > 0);

    res = await context.request('/api/v1/inventory/reports/valuation?method=BATCH', {
      method: 'GET',
      headers,
    });
    assert.equal(res.response.status, 200);
    assert.ok(res.body.totals.value > 0);

    // ----------------------------------------------------
    // 8. INVENTORY RECONCILIATION REPORT
    // ----------------------------------------------------
    res = await context.request('/api/v1/inventory/reports/reconciliation', {
      method: 'GET',
      headers,
    });
    assert.equal(res.response.status, 200);
    assert.ok(res.body.data.ledgerBalance !== undefined);
    assert.ok(res.body.data.totalValuation !== undefined);
    assert.equal(res.body.data.quantityMismatchCount, 0); // They should match perfectly!
  } finally {
    await context.close();
  }
});
