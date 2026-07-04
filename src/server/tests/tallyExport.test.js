import assert from 'node:assert/strict';
import test from 'node:test';
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

test('tally export endpoint generates XML and enforces permissions', async () => {
  const context = await createTestContext();

  try {
    const unauthenticated = await context.request('/api/v1/profit/tally-export');
    assert.equal(unauthenticated.response.status, 401);

    const token = await login(context);

    // Create a customer
    const customerRes = await context.request('/api/v1/customers', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'Tally Customer Ltd',
        phone: '9777777777',
        city: 'Pune',
      }),
    });
    assert.equal(customerRes.response.status, 201);
    const customer = customerRes.body.data;

    // Directly seed a finalized invoice in the database to test the tally export query
    context.db.prepare(`
      INSERT INTO invoices (
        invoice_number,
        customer_id,
        invoice_date,
        subtotal,
        taxable_amount,
        cgst_total,
        sgst_total,
        grand_total,
        status,
        payment_status
      ) VALUES (
        'INV-TALLY-101',
        ?,
        '2026-06-10',
        1000.00,
        1000.00,
        90.00,
        90.00,
        1180.00,
        'FINALIZED',
        'PAID'
      )
    `).run(customer.id);

    // Fetch the tally export
    const exportRes = await context.request('/api/v1/profit/tally-export?dateFrom=2026-06-01&dateTo=2026-06-30', {
      headers: authHeaders(token),
    });

    assert.equal(exportRes.response.status, 200);
    assert.ok(exportRes.response.headers.get('content-type').includes('xml'));
    
    const xml = exportRes.body;
    assert.ok(xml.includes('<SVCURRENTCOMPANY>GOLDY AUTOMOBILE</SVCURRENTCOMPANY>'));
    assert.ok(xml.includes('<VOUCHERNUMBER>INV-TALLY-101</VOUCHERNUMBER>'));
    assert.ok(xml.includes('<PARTYLEDGERNAME>Tally Customer Ltd</PARTYLEDGERNAME>'));
    assert.ok(xml.includes('<AMOUNT>-1180.00</AMOUNT>'));
    assert.ok(xml.includes('<AMOUNT>1000.00</AMOUNT>'));

    // ----------------------------------------------------
    // SPRINT 8: FULL LEDGER VOUCHER XML EXPORT TESTING
    // ----------------------------------------------------
    const testGroupId = context.db.prepare("SELECT id FROM account_groups LIMIT 1").get()?.id || 1;
    const cashLedgerId = context.db.prepare("SELECT id FROM ledgers WHERE system_key = 'cash'").get()?.id || 
                         context.db.prepare("INSERT INTO ledgers (company_id, name, group_id, nature, is_system) VALUES (1, 'Cash Account', ?, 'Debit', 1)").run(testGroupId).lastInsertRowid;
    const rentLedgerId = context.db.prepare("INSERT INTO ledgers (company_id, name, group_id, nature, is_system) VALUES (1, 'Rent Expense Ledger', ?, 'Debit', 0)").run(testGroupId).lastInsertRowid;

    const voucherId = context.db.prepare(`
      INSERT INTO vouchers (voucher_number, voucher_type, voucher_date, company_id, status, narration)
      VALUES ('PV-TALLY-202', 'Payment', '2026-06-12', 1, 'ACTIVE', 'Monthly Rent Payment')
    `).run().lastInsertRowid;

    context.db.prepare(`
      INSERT INTO journal_entries (voucher_id, ledger_id, entry_type, amount, narration)
      VALUES (?, ?, 'CREDIT', 5000.00, 'Cash Outflow')
    `).run(voucherId, cashLedgerId);

    context.db.prepare(`
      INSERT INTO journal_entries (voucher_id, ledger_id, entry_type, amount, narration)
      VALUES (?, ?, 'DEBIT', 5000.00, 'Expense Debit')
    `).run(voucherId, rentLedgerId);

    // Fetch the full tally export
    const exportAllRes = await context.request('/api/v1/profit/tally-export?type=all&dateFrom=2026-06-01&dateTo=2026-06-30', {
      headers: authHeaders(token),
    });

    assert.equal(exportAllRes.response.status, 200);
    const xmlAll = exportAllRes.body;
    assert.ok(xmlAll.includes('VOUCHER VCHTYPE="Payment"'));
    assert.ok(xmlAll.includes('<VOUCHERNUMBER>PV-TALLY-202</VOUCHERNUMBER>'));
    assert.ok(xmlAll.includes('<LEDGERNAME>Rent Expense Ledger</LEDGERNAME>'));
    assert.ok(xmlAll.includes('<AMOUNT>5000.00</AMOUNT>'));
    assert.ok(xmlAll.includes('<AMOUNT>-5000.00</AMOUNT>'));

    // ----------------------------------------------------
    // SPRINT 8: CUSTOMER CREDIT LIMIT ENFORCEMENT TESTING
    // ----------------------------------------------------
    // Set a credit limit of 2000 for our customer
    context.db.prepare("UPDATE customers SET credit_limit = 2000.00 WHERE id = ?").run(customer.id);

    // Seed a vehicle
    const vehicleId = context.db.prepare(`
      INSERT INTO vehicles (customer_id, registration_number, make, model, variant, fuel_type, year, vin, engine_number, chassis_number, odometer_reading)
      VALUES (?, 'MH-12-AB-1234', 'Maruti', 'Swift', 'VXI', 'Petrol', 2018, '17CHARVINNUMBER12', 'ENGINE12345', 'CHASSIS12345', 10000)
    `).run(customer.id).lastInsertRowid;

    // Create a Job Card
    const jcRes = await context.request('/api/v1/job-cards', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        customer_id: customer.id,
        vehicle_id: vehicleId,
        odometer_reading: 12000,
        complaint: 'Routine servicing'
      })
    });
    console.log("JC_RESPONSE:", JSON.stringify(jcRes.body));
    assert.equal(jcRes.response.status, 201);
    const jobCard = jcRes.body.data;

    // Seed inventory batch to satisfy parts consumption
    const partId = context.db.prepare(`
      INSERT INTO inventory_items (sku, item_name, purchase_cost, selling_price, current_quantity, average_cost, gst_rate, is_active)
      VALUES ('PART-TALLY-EXP', 'Oil Filter S8', 1000, 2500, 10, 1000, 18, 1)
    `).run().lastInsertRowid;

    const warehouses = context.db.prepare('SELECT id FROM warehouses').all();
    const whId = warehouses[0]?.id || 1;

    context.db.prepare(`
      INSERT INTO inventory_batches (item_id, warehouse_id, batch_number, purchase_cost, selling_price, quantity)
      VALUES (?, ?, 'BATCH-TALLY', 1000, 2500, 10)
    `).run(partId, whId);

    const batch = context.db.prepare('SELECT id FROM inventory_batches WHERE batch_number = ?').get('BATCH-TALLY');

    // Add part to job card (price = 2500, which exceeds customer's credit limit of 2000)
    const addPartRes = await context.request(`/api/v1/job-cards/${jobCard.id}/parts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        inventory_item_id: partId,
        batch_id: batch.id,
        warehouse_id: whId,
        quantity: 1,
        selling_price: 2500
      })
    });
    console.log("ADD_PART_RESPONSE:", JSON.stringify(addPartRes.body));
    assert.equal(addPartRes.response.status, 201, JSON.stringify(addPartRes.body));

    // Try to finalize job card and verify it is blocked due to Credit Limit Exceeded
    const finalizeRes = await context.request(`/api/v1/job-cards/${jobCard.id}/finalize`, {
      method: 'POST',
      headers: authHeaders(token)
    });
    
    assert.equal(finalizeRes.response.status, 400);
    assert.equal(finalizeRes.body.error?.code, 'CREDIT_LIMIT_EXCEEDED');

    // Increase credit limit to 5000 to allow finalization
    context.db.prepare("UPDATE customers SET credit_limit = 5000.00 WHERE id = ?").run(customer.id);

    const finalizePassRes = await context.request(`/api/v1/job-cards/${jobCard.id}/finalize`, {
      method: 'POST',
      headers: authHeaders(token)
    });
    assert.equal(finalizePassRes.response.status, 201);

  } finally {
    await context.close();
  }
});
