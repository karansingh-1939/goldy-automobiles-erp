import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './helpers.js';

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

test('Accounting Sprint 4 - Purchasing & Supplier Accounting End-to-End', async () => {
  const context = await createTestContext();
  const db = context.db;

  try {
    const token = await login(context);
    const headers = {
      ...authHeaders(token),
      'Content-Type': 'application/json'
    };

    // 1. Verify Supplier Master CRUD & lazy AP Ledger creation
    const createSupplierRes = await context.request('/api/v1/accounting/suppliers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Goldy Engine Parts Corp',
        phone: '1234567890',
        email: 'info@goldyparts.com',
        gstin: '07AAAAA1111A1Z1',
        address: '12 Logistics Park, New Delhi',
        openingBalance: 0
      })
    });
    assert.equal(createSupplierRes.response.status, 201);
    const supplier = createSupplierRes.body.data;
    assert.ok(supplier.id);
    assert.ok(supplier.ledger_id);
    assert.equal(supplier.name, 'Goldy Engine Parts Corp');

    // Verify AP Ledger details
    const ledger = db.prepare('SELECT * FROM ledgers WHERE id = ?').get(supplier.ledger_id);
    assert.equal(ledger.name, 'Supplier: Goldy Engine Parts Corp');
    assert.equal(ledger.group_id, 5); // Sundry Creditors group

    // Test validation: GSTIN must be 15 chars
    const invalidGstRes = await context.request('/api/v1/accounting/suppliers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Invalid Corp',
        gstin: '123'
      })
    });
    assert.equal(invalidGstRes.response.status, 400);

    // Test update and ledger name sync
    const updateRes = await context.request(`/api/v1/accounting/suppliers/${supplier.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        name: 'Goldy Engine Parts Ltd'
      })
    });
    assert.equal(updateRes.response.status, 200);
    const updatedSupplier = updateRes.body.data;
    assert.equal(updatedSupplier.name, 'Goldy Engine Parts Ltd');

    const updatedLedger = db.prepare('SELECT name FROM ledgers WHERE id = ?').get(supplier.ledger_id);
    assert.equal(updatedLedger.name, 'Supplier: Goldy Engine Parts Ltd');

    // 2. Ingest Inventory Item to seed purchase stock-in
    const itemId = db.prepare(`
      INSERT INTO inventory_items (sku, item_name, purchase_cost, selling_price, current_quantity, gst_rate, is_active)
      VALUES ('PART-ENG-01', 'Piston Ring Set', 500, 750, 0, 18, 1)
    `).run().lastInsertRowid;

    // 3. Post Supplier Purchase Bill
    const createBillRes = await context.request('/api/v1/accounting/purchases/bills', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplierId: supplier.id,
        billNumber: 'INV-2026-001',
        billDate: '2026-06-15',
        narration: 'Procurement of engine pistons',
        items: [
          {
            itemId,
            description: 'Piston Ring Set',
            quantity: 10,
            purchaseCost: 450, // different from initial cost to test averages
            gstRate: 18,
            warehouseId: 1
          }
        ]
      })
    });
    assert.equal(createBillRes.response.status, 201);
    const bill = createBillRes.body.data;
    assert.ok(bill.id);
    assert.equal(bill.grand_total, 5310); // (450 * 10) * 1.18 = 5310
    assert.equal(bill.status, 'UNPAID');

    // Verify inventory quantities and average cost recalculation
    const item = db.prepare('SELECT current_quantity, average_cost FROM inventory_items WHERE id = ?').get(itemId);
    assert.equal(item.current_quantity, 10);
    assert.equal(item.average_cost, 450); // weighted average

    // Verify created batch
    const batch = db.prepare('SELECT quantity, purchase_cost FROM inventory_batches WHERE item_id = ?').get(itemId);
    assert.equal(batch.quantity, 10);
    assert.equal(batch.purchase_cost, 450);

    // Verify unique invoice constraint
    const duplicateBillRes = await context.request('/api/v1/accounting/purchases/bills', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplierId: supplier.id,
        billNumber: 'INV-2026-001',
        billDate: '2026-06-15',
        items: [
          { itemId, description: 'Pistons', quantity: 5, purchaseCost: 450, warehouseId: 1 }
        ]
      })
    });
    assert.equal(duplicateBillRes.response.status, 400);

    // 4. Verify Outstanding supplier bill list
    const outstandingRes = await context.request(`/api/v1/accounting/suppliers/${supplier.id}/outstanding`, {
      method: 'GET',
      headers
    });
    assert.equal(outstandingRes.response.status, 200);
    const outstandingList = outstandingRes.body.data;
    assert.equal(outstandingList.length, 1);
    assert.equal(outstandingList[0].documentNumber, 'INV-2026-001');
    assert.equal(outstandingList[0].outstandingAmount, 5310);

    // 5. Post Supplier Payment & auto-allocation
    const paymentRes = await context.request('/api/v1/accounting/payments', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplierId: supplier.id,
        paymentDate: '2026-06-16',
        amount: 3000, // partial payment
        paymentMode: 'CASH',
        narration: 'First payment installment',
        autoAllocate: true
      })
    });
    assert.equal(paymentRes.response.status, 201);
    const payment = paymentRes.body.data;
    assert.equal(payment.unallocated_amount, 0); // fully allocated to the invoice

    // Verify purchase bill amount paid update
    const updatedBill = db.prepare('SELECT amount_paid, status FROM purchase_bills WHERE id = ?').get(bill.id);
    assert.equal(updatedBill.amount_paid, 3000);
    assert.equal(updatedBill.status, 'PARTIALLY_PAID');

    // 6. Test Advance Payments (Overpayment holding)
    const overpaymentRes = await context.request('/api/v1/accounting/payments', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplierId: supplier.id,
        paymentDate: '2026-06-17',
        amount: 3000, // exceeds outstanding 2310
        paymentMode: 'CASH',
        narration: 'Final payment + advance deposit',
        autoAllocate: true
      })
    });
    assert.equal(overpaymentRes.response.status, 201);
    const overpayment = overpaymentRes.body.data;
    assert.equal(overpayment.unallocated_amount, 690); // 3000 - 2310 = 690 advance credit

    // Verify bill is now PAID
    const paidBill = db.prepare('SELECT amount_paid, status FROM purchase_bills WHERE id = ?').get(bill.id);
    assert.equal(paidBill.amount_paid, 5310);
    assert.equal(paidBill.status, 'PAID');

    // 7. Verification of Reconciliation scan
    const reconRes = await context.request('/api/v1/accounting/reports/reconciliation', {
      method: 'GET',
      headers
    });
    assert.equal(reconRes.response.status, 200);
    assert.equal(reconRes.body.data.isHealthy, true);

    // 8. Cancellation Rollbacks
    // Try to cancel purchase bill while allocations exist -> should fail
    const cancelFailRes = await context.request(`/api/v1/accounting/purchases/bills/${bill.id}/cancel`, {
      method: 'POST',
      headers
    });
    assert.equal(cancelFailRes.response.status, 400);

    // Cancel the second payment
    const cancelOverpaymentRes = await context.request(`/api/v1/accounting/payments/${overpayment.id}/cancel`, {
      method: 'POST',
      headers
    });
    assert.equal(cancelOverpaymentRes.response.status, 200);

    // Bill should revert to PARTIALLY_PAID (amount_paid: 3000)
    const revertedBill = db.prepare('SELECT amount_paid, status FROM purchase_bills WHERE id = ?').get(bill.id);
    assert.equal(revertedBill.amount_paid, 3000);
    assert.equal(revertedBill.status, 'PARTIALLY_PAID');

    // Cancel first payment
    const cancelFirstPaymentRes = await context.request(`/api/v1/accounting/payments/${payment.id}/cancel`, {
      method: 'POST',
      headers
    });
    assert.equal(cancelFirstPaymentRes.response.status, 200);

    // Bill should revert to UNPAID (amount_paid: 0)
    const unpaidBill = db.prepare('SELECT amount_paid, status FROM purchase_bills WHERE id = ?').get(bill.id);
    assert.equal(unpaidBill.amount_paid, 0);
    assert.equal(unpaidBill.status, 'UNPAID');

    // Cancel the purchase bill -> should succeed now that all allocations are gone
    const cancelBillRes = await context.request(`/api/v1/accounting/purchases/bills/${bill.id}/cancel`, {
      method: 'POST',
      headers
    });
    assert.equal(cancelBillRes.response.status, 200);

    // Verify stock is removed and average_cost reverted
    const revertedItem = db.prepare('SELECT current_quantity, average_cost FROM inventory_items WHERE id = ?').get(itemId);
    assert.equal(revertedItem.current_quantity, 0);
    assert.equal(revertedItem.average_cost, 450);

  } finally {
    await context.close();
  }
});
