import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';
import { ReconciliationService } from '../modules/accounting/reconciliation.service.js';

async function login(context) {
  const result = await context.request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: 'admin',
      password: 'Admin@12345',
    }),
  });
  assert.equal(result.response.status, 200);
  return result.body.token;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

test('Sprint 9: After-Sales Subsystem E2E Integration Test', async () => {
  const context = await createTestContext();
  const db = context.db;

  try {
    const token = await login(context);
    const headers = authHeaders(token);

    // 1. SEEDING TEST MASTERS & INVENTORY
    const customerId = db.prepare("INSERT INTO customers (name, phone, city, state) VALUES ('Sprint9 Customer', '9876543210', 'Gurugram', 'Haryana')").run().lastInsertRowid;
    const supplierId = db.prepare("INSERT INTO suppliers (name, phone, state, city) VALUES ('Sprint9 Supplier', '9998887776', 'Delhi', 'Delhi')").run().lastInsertRowid;
    const warehouseId = db.prepare("INSERT INTO warehouses (name, code, is_active) VALUES ('S9 Warehouse', 'S9W', 1)").run().lastInsertRowid;
    
    // Seed user-warehouse permission if required
    db.prepare("INSERT OR IGNORE INTO user_warehouses (user_id, warehouse_id) VALUES (1, ?)").run(warehouseId);

    const vehicleId = db.prepare(`
      INSERT INTO vehicles (customer_id, registration_number, make, model, year, vin, odometer_reading)
      VALUES (?, 'HR-26-S9', 'Hyundai', 'i20', 2020, '17CHARVINNUMBERS9', 25000)
    `).run(customerId).lastInsertRowid;

    // Seed inventory item with 6 months warranty
    const itemId = db.prepare(`
      INSERT INTO inventory_items (sku, item_name, purchase_cost, selling_price, current_quantity, average_cost, gst_rate, is_active, warranty_period_months)
      VALUES ('PART-W9', 'S9 Warranty Alternator', 4000.00, 6000.00, 10, 4000.00, 18, 1, 6)
    `).run().lastInsertRowid;

    // Seed batch
    const batchId = db.prepare(`
      INSERT INTO inventory_batches (item_id, warehouse_id, batch_number, purchase_cost, selling_price, quantity)
      VALUES (?, ?, 'BATCH-S9-A', 4000.00, 6000.00, 10)
    `).run(itemId, warehouseId).lastInsertRowid;

    // Create a job card
    const jcRes = await context.request('/api/v1/job-cards', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customer_id: customerId,
        vehicle_id: vehicleId,
        odometer_reading: 25100,
        complaint: 'Battery draining fast'
      })
    });
    assert.equal(jcRes.response.status, 201);
    const jobCard = jcRes.body.data;

    // Add part with warranty to the job card
    const partRes = await context.request(`/api/v1/job-cards/${jobCard.id}/parts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inventory_item_id: itemId,
        batch_id: batchId,
        warehouse_id: warehouseId,
        quantity: 1,
        selling_price: 6000.00
      })
    });
    assert.equal(partRes.response.status, 201);

    // Finalize Job Card (Auto-registers Warranty)
    const finalizeRes = await context.request(`/api/v1/job-cards/${jobCard.id}/finalize`, {
      method: 'POST',
      headers
    });
    assert.equal(finalizeRes.response.status, 201);
    const invoice = finalizeRes.body.data.invoice;
    assert.ok(invoice);

    // 2. VERIFY WARRANTY AUTO-REGISTRATION
    const reg = db.prepare("SELECT * FROM warranty_registrations WHERE invoice_id = ? AND item_id = ?").get(invoice.id, itemId);
    assert.ok(reg, 'Warranty registration should be auto-created.');
    assert.equal(reg.status, 'ACTIVE');
    assert.equal(reg.customer_id, customerId);
    assert.equal(reg.vehicle_id, vehicleId);

    // 3. TEST WARRANTY CLAIM SYSTEM (REPLACEMENT FLOW)
    // File a warranty claim
    const claimRes = await context.request('/api/v1/warranties/claims', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        registrationId: reg.id,
        notes: 'Alternator failed voltage test'
      })
    });
    assert.equal(claimRes.response.status, 201);
    const claim = claimRes.body.data;
    assert.equal(claim.status, 'PENDING');

    // Settle claim with REPLACEMENT
    const settleRes = await context.request(`/api/v1/warranties/claims/${claim.id}/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        settlementType: 'REPLACEMENT',
        replacementWarehouseId: warehouseId,
        replacementBatchId: batchId,
        notes: 'Alternator swapped with new unit'
      })
    });
    assert.equal(settleRes.response.status, 200);

    // Assert claim and old registration are updated
    const updatedClaim = db.prepare("SELECT * FROM warranty_claims WHERE id = ?").get(claim.id);
    assert.equal(updatedClaim.status, 'SETTLED');
    assert.equal(updatedClaim.settlement_type, 'REPLACEMENT');

    const updatedReg = db.prepare("SELECT * FROM warranty_registrations WHERE id = ?").get(reg.id);
    assert.equal(updatedReg.status, 'CLAIMED');

    // Assert new warranty registration was created for the replacement item
    const newReg = db.prepare("SELECT * FROM warranty_registrations WHERE batch_number = ?").get(`REP-${claim.claim_number}`);
    assert.ok(newReg, 'Replacement item should start its own warranty registration.');

    // Assert accounting voucher was posted (Warranty Expense Debit, Inventory Credit)
    const claimVoucher = db.prepare("SELECT * FROM vouchers WHERE reference_table = 'warranty_claims' AND reference_id = ?").get(claim.id);
    assert.ok(claimVoucher);
    assert.equal(claimVoucher.voucher_type, 'Journal');

    const claimEntries = db.prepare("SELECT je.*, l.system_key FROM journal_entries je JOIN ledgers l ON je.ledger_id = l.id WHERE je.voucher_id = ?").all(claimVoucher.id);
    assert.equal(claimEntries.length, 2);
    
    const debitLine = claimEntries.find(e => e.entry_type === 'DEBIT');
    const creditLine = claimEntries.find(e => e.entry_type === 'CREDIT');
    assert.equal(debitLine.system_key, 'warranty_expense');
    assert.equal(creditLine.system_key, 'inventory_stock');
    assert.equal(debitLine.amount, 4000.00);

    // 4. TEST CUSTOMER RETURN LOGISTICS & CREDIT NOTE
    // Create another invoice to return (since the first one was claimed under warranty)
    const jc2Res = await context.request('/api/v1/job-cards', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customer_id: customerId,
        vehicle_id: vehicleId,
        odometer_reading: 25200,
        complaint: 'Brakes squealing'
      })
    });
    const jobCard2 = jc2Res.body.data;

    // Add part
    await context.request(`/api/v1/job-cards/${jobCard2.id}/parts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inventory_item_id: itemId,
        batch_id: batchId,
        warehouse_id: warehouseId,
        quantity: 2,
        selling_price: 6000.00
      })
    });

    const finalize2 = await context.request(`/api/v1/job-cards/${jobCard2.id}/finalize`, { method: 'POST', headers });
    const invoice2 = finalize2.body.data.invoice;

    // Check initial stock count in batch before return
    const batchBefore = db.prepare("SELECT quantity FROM inventory_batches WHERE id = ?").get(batchId);

    // Create Customer Return (Draft) for 1 quantity of the item
    const retRes = await context.request('/api/v1/returns/customer', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        invoiceId: invoice2.id,
        items: [
          { itemId, quantity: 1, warehouseId, batchId, condition: 'GOOD' }
        ]
      })
    });
    assert.equal(retRes.response.status, 201);
    const ret = retRes.body.data;
    assert.equal(ret.status, 'DRAFT');

    // Finalize customer return
    const approveRes = await context.request(`/api/v1/returns/customer/${ret.id}/approve`, {
      method: 'POST',
      headers
    });
    assert.equal(approveRes.response.status, 200);

    // Verify stock was restored
    const batchAfter = db.prepare("SELECT quantity FROM inventory_batches WHERE id = ?").get(batchId);
    assert.equal(Number(batchAfter.quantity), Number(batchBefore.quantity) + 1);

    // Verify Credit Note accounting posting
    const retRecord = db.prepare("SELECT * FROM customer_returns WHERE id = ?").get(ret.id);
    assert.equal(retRecord.status, 'COMPLETED');
    assert.ok(retRecord.credit_note_id);

    const cnVoucher = db.prepare("SELECT * FROM vouchers WHERE id = ?").get(retRecord.credit_note_id);
    assert.equal(cnVoucher.voucher_type, 'Credit Note');

    const cnEntries = db.prepare("SELECT je.*, l.system_key FROM journal_entries je JOIN ledgers l ON je.ledger_id = l.id WHERE je.voucher_id = ?").all(cnVoucher.id);
    // Debits: Parts Sales (6000.00), CGST Output (540.00), SGST Output (540.00)
    // Credit: Customer Ledger (7080.00)
    const customerCredit = cnEntries.find(e => e.entry_type === 'CREDIT');
    assert.equal(customerCredit.amount, 7080.00);

    // Verify COGS reversal journal posting
    const cogsVoucher = db.prepare("SELECT * FROM vouchers WHERE reference_table = 'customer_returns' AND reference_id = ? AND voucher_type = 'Journal'").get(ret.id);
    assert.ok(cogsVoucher);
    const cogsEntries = db.prepare("SELECT je.*, l.system_key FROM journal_entries je JOIN ledgers l ON je.ledger_id = l.id WHERE je.voucher_id = ?").all(cogsVoucher.id);
    assert.equal(cogsEntries.find(e => e.entry_type === 'DEBIT').system_key, 'inventory_stock');
    assert.equal(cogsEntries.find(e => e.entry_type === 'CREDIT').system_key, 'cogs');
    assert.equal(cogsEntries.find(e => e.entry_type === 'DEBIT').amount, 4000.00);

    // 5. TEST DAMAGED RETURNS WRITE-OFF FLOW
    const retDamagedRes = await context.request('/api/v1/returns/customer', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        invoiceId: invoice2.id,
        items: [
          { itemId, quantity: 1, warehouseId, batchId, condition: 'DAMAGED' }
        ]
      })
    });
    assert.equal(retDamagedRes.response.status, 201);
    const retDamaged = retDamagedRes.body.data;

    // Check batch count before damaged return
    const batchBeforeDamaged = db.prepare("SELECT quantity FROM inventory_batches WHERE id = ?").get(batchId);

    const approveDamagedRes = await context.request(`/api/v1/returns/customer/${retDamaged.id}/approve`, {
      method: 'POST',
      headers
    });
    assert.equal(approveDamagedRes.response.status, 200);

    // Verify stock is logged but written off (batch quantity was still logged for inventory tracking but write-off recorded)
    const batchAfterDamaged = db.prepare("SELECT quantity FROM inventory_batches WHERE id = ?").get(batchId);
    assert.equal(Number(batchAfterDamaged.quantity), Number(batchBeforeDamaged.quantity) + 1);

    // Verify that damaged write-off posts to Damaged Stock Loss ledger
    const writeOffVoucher = db.prepare("SELECT * FROM vouchers WHERE reference_table = 'customer_returns' AND reference_id = ? AND narration LIKE '%damaged%'").get(retDamaged.id);
    assert.ok(writeOffVoucher);

    const writeOffEntries = db.prepare("SELECT je.*, l.system_key FROM journal_entries je JOIN ledgers l ON je.ledger_id = l.id WHERE je.voucher_id = ?").all(writeOffVoucher.id);
    assert.equal(writeOffEntries.find(e => e.entry_type === 'DEBIT').system_key, 'damaged_stock_loss');
    assert.equal(writeOffEntries.find(e => e.entry_type === 'CREDIT').system_key, 'cogs');
    assert.equal(writeOffEntries.find(e => e.entry_type === 'DEBIT').amount, 4000.00);

    // 6. TEST OVER-RETURN BLOCKING VALIDATION
    // Since original quantity was 2, and we already returned 1 good and 1 damaged (total 2),
    // returning any more should be blocked.
    const overReturnRes = await context.request('/api/v1/returns/customer', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        invoiceId: invoice2.id,
        items: [
          { itemId, quantity: 1, warehouseId, batchId, condition: 'GOOD' }
        ]
      })
    });
    assert.equal(overReturnRes.response.status, 400);

    // 7. TEST SUPPLIER RETURNS
    // Check initial supplier batch stock count
    const batchCountBeforeSupplier = db.prepare("SELECT quantity FROM inventory_batches WHERE id = ?").get(batchId);

    const supRetRes = await context.request('/api/v1/returns/supplier', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplierId,
        items: [
          { itemId, batchId, quantity: 2 }
        ]
      })
    });
    assert.equal(supRetRes.response.status, 201);
    const supRet = supRetRes.body.data;

    // Approve supplier return
    const approveSupRes = await context.request(`/api/v1/returns/supplier/${supRet.id}/approve`, {
      method: 'POST',
      headers
    });
    assert.equal(approveSupRes.response.status, 200);

    // Verify stock was decremented
    const batchCountAfterSupplier = db.prepare("SELECT quantity FROM inventory_batches WHERE id = ?").get(batchId);
    assert.equal(Number(batchCountAfterSupplier.quantity), Number(batchCountBeforeSupplier.quantity) - 2);

    // Verify Debit Note accounting posting (Debit Supplier 9440.00, Credit Inventory 8000.00, Credit GST 1440.00)
    const supRetRecord = db.prepare("SELECT * FROM supplier_returns WHERE id = ?").get(supRet.id);
    assert.ok(supRetRecord.debit_note_id);
    const dnVoucher = db.prepare("SELECT * FROM vouchers WHERE id = ?").get(supRetRecord.debit_note_id);
    assert.equal(dnVoucher.voucher_type, 'Debit Note');

    const dnEntries = db.prepare("SELECT je.*, l.system_key FROM journal_entries je JOIN ledgers l ON je.ledger_id = l.id WHERE je.voucher_id = ?").all(dnVoucher.id);
    assert.equal(dnEntries.find(e => e.entry_type === 'DEBIT').amount, 9440.00); // 8000 + 1440 tax
    assert.equal(dnEntries.find(e => e.system_key === 'inventory_stock').amount, 8000.00);

    // 8. TEST RECONCILIATION SERVICE
    const reconciliationService = new ReconciliationService(db);
    const report = reconciliationService.runReconciliation(1);
    assert.ok(report.isHealthy, `Reconciliation should be healthy. Discrepancies: ${JSON.stringify(report.checks)}`);

  } finally {
    await context.close();
  }
});
