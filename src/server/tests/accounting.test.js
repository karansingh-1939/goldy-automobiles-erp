import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';
import { AccountingPostingEngine } from '../modules/accounting/postingEngine.service.js';

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

test('Accounting Posting Engine - Unit & Validation checks', async () => {
  const context = await createTestContext();
  const engine = new AccountingPostingEngine(context.db);

  try {
    // 1. Test balanced entries validation
    assert.throws(() => {
      engine.post({
        voucherType: 'Sales',
        voucherDate: '2026-06-10',
        entries: [
          { ledgerId: 1, type: 'DEBIT', amount: 100 },
          { ledgerId: 10, type: 'CREDIT', amount: 90 }, // Unbalanced
        ],
      });
    }, /balanced/);

    // 2. Test invalid entry types validation
    assert.throws(() => {
      engine.post({
        voucherType: 'Sales',
        voucherDate: '2026-06-10',
        entries: [
          { ledgerId: 1, type: 'DEBIT', amount: 100 },
          { ledgerId: 10, type: 'INVALID', amount: 100 }, // Invalid type
        ],
      });
    }, /Journal entry type must be DEBIT or CREDIT/);

    // 3. Test invalid date format validation
    assert.throws(() => {
      engine.post({
        voucherType: 'Sales',
        voucherDate: '10-06-2026', // Wrong format
        entries: [
          { ledgerId: 1, type: 'DEBIT', amount: 100 },
          { ledgerId: 10, type: 'CREDIT', amount: 100 },
        ],
      });
    }, /YYYY-MM-DD format/);

    // 4. Test locked period validation
    context.db.prepare(`
      INSERT INTO locked_periods (company_id, start_date, end_date, is_locked)
      VALUES (1, '2026-01-01', '2026-01-31', 1)
    `).run();

    assert.throws(() => {
      engine.post({
        voucherType: 'Payment',
        voucherDate: '2026-01-15', // Falls in locked period
        entries: [
          { ledgerId: 13, type: 'DEBIT', amount: 500 },
          { ledgerId: 1, type: 'CREDIT', amount: 500 },
        ],
      });
    }, /financial period containing this date is locked/);

    // 5. Test valid posting and balance updates
    const voucher = engine.post({
      voucherType: 'Payment',
      voucherDate: '2026-06-10',
      entries: [
        { ledgerId: 13, type: 'DEBIT', amount: 5000 }, // Rent Expense (Debit Nature)
        { ledgerId: 1, type: 'CREDIT', amount: 5000 }, // Cash in Hand (Debit Nature)
      ],
    });

    assert.ok(voucher.voucherId);
    assert.ok(voucher.voucherNumber.startsWith('PAY-2026-'));

    // Verify cache updates: Rent balance should increase by 5000 (Debit), Cash balance should decrease by 5000 (Credit)
    const rentBal = context.db.prepare('SELECT running_balance FROM ledger_balances WHERE ledger_id = 13').get();
    const cashBal = context.db.prepare('SELECT running_balance FROM ledger_balances WHERE ledger_id = 1').get();

    assert.equal(rentBal.running_balance, 5000);
    assert.equal(cashBal.running_balance, -5000);

    // Test voucher reversal/deletion
    engine.deleteVoucher(1, voucher.voucherId);
    const rentBalAfter = context.db.prepare('SELECT running_balance FROM ledger_balances WHERE ledger_id = 13').get();
    const cashBalAfter = context.db.prepare('SELECT running_balance FROM ledger_balances WHERE ledger_id = 1').get();

    assert.equal(rentBalAfter.running_balance, 0);
    assert.equal(cashBalAfter.running_balance, 0);

  } finally {
    await context.close();
  }
});

test('Accounting - Silent Integrations & APIs', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const headers = authHeaders(token);

    // --- INTEGRATION 1: Expense Creation ---
    const expenseRes = await context.request('/api/v1/expenses', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        category: 'Rent',
        expense_date: '2026-06-15',
        amount: 12000,
        description: 'Monthly workshop rent',
      }),
    });

    assert.equal(expenseRes.response.status, 201);
    const expense = expenseRes.body.data;
    assert.ok(expense.voucher_id);

    // Verify the Payment Voucher was silently created
    const voucherQuery = context.db.prepare('SELECT * FROM vouchers WHERE id = ?').get(expense.voucher_id);
    assert.ok(voucherQuery);
    assert.equal(voucherQuery.voucher_type, 'Payment');
    assert.equal(voucherQuery.reference_table, 'expenses');
    assert.equal(voucherQuery.reference_id, expense.id);

    // Verify the debug API for voucher
    const debugVchRes = await context.request(`/api/v1/accounting/debug/voucher/${expense.voucher_id}`, { headers });
    assert.equal(debugVchRes.response.status, 200);
    assert.equal(debugVchRes.body.data.voucher_number, voucherQuery.voucher_number);
    assert.equal(debugVchRes.body.data.entries.length, 2);

    // Verify running balances: Rent ledger should be debited by 12000
    const rentLedgerRes = await context.request(`/api/v1/accounting/debug/ledger/13`, { headers });
    assert.equal(rentLedgerRes.response.status, 200);
    assert.equal(rentLedgerRes.body.data.runningBalance, 12000);

    // Delete the expense and verify reversal
    const deleteRes = await context.request(`/api/v1/expenses/${expense.id}`, {
      method: 'DELETE',
      headers,
    });
    assert.equal(deleteRes.response.status, 200);

    // Check that the voucher status is CANCELLED and cash balance restored to 0
    const deletedVoucher = context.db.prepare('SELECT * FROM vouchers WHERE id = ?').get(expense.voucher_id);
    assert.equal(deletedVoucher.status, 'CANCELLED');
    const rentLedgerAfterDel = context.db.prepare('SELECT running_balance FROM ledger_balances WHERE ledger_id = 13').get();
    assert.equal(rentLedgerAfterDel.running_balance, 0);

  } finally {
    await context.close();
  }
});

test('Accounting - Transaction Rollback & Safety', async () => {
  const context = await createTestContext();
  const engine = new AccountingPostingEngine(context.db);

  try {
    const initialVouchersCount = context.db.prepare('SELECT COUNT(*) as count FROM vouchers').get().count;
    const initialJournalCount = context.db.prepare('SELECT COUNT(*) as count FROM journal_entries').get().count;

    assert.throws(() => {
      engine.post({
        voucherType: 'Contra',
        voucherDate: '2026-06-15',
        entries: [
          { ledgerId: 1, type: 'DEBIT', amount: 3000 },
          { ledgerId: 99999, type: 'CREDIT', amount: 3000 }, // Non-existent ledger
        ],
      });
    }, /Ledger ID 99999 not found/);

    const afterVouchersCount = context.db.prepare('SELECT COUNT(*) as count FROM vouchers').get().count;
    const afterJournalCount = context.db.prepare('SELECT COUNT(*) as count FROM journal_entries').get().count;

    assert.equal(afterVouchersCount, initialVouchersCount);
    assert.equal(afterJournalCount, initialJournalCount);

  } finally {
    await context.close();
  }
});

test('Accounting - Invoicing and Cancellation Silent Integration', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const headers = authHeaders(token);

    // 1. Create Customer
    const customerRes = await context.request('/api/v1/customers', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Integration Customer', phone: '9999999999', city: 'Karnal' })
    });
    assert.equal(customerRes.response.status, 201);
    const customer = customerRes.body.data;

    // 2. Create Vehicle
    const vehicleRes = await context.request('/api/v1/vehicles', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customer_id: customer.id,
        registration_number: 'HR-05-AB-9999',
        make: 'Hyundai',
        model: 'i20'
      })
    });
    assert.equal(vehicleRes.response.status, 201);
    const vehicle = vehicleRes.body.data;

    // 3. Create Job Card
    const jcRes = await context.request('/api/v1/job-cards', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customer_id: customer.id,
        vehicle_id: vehicle.id,
        odometer_reading: 12000,
        complaint: 'Engine oil change'
      })
    });
    assert.equal(jcRes.response.status, 201);
    const jc = jcRes.body.data;

    // 4. Add labor to Job Card
    const labourRes = await context.request(`/api/v1/job-cards/${jc.id}/labour`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        description: 'Engine oil change service',
        labour_charge: 1000,
        gst_rate: 18
      })
    });
    assert.equal(labourRes.response.status, 201);

    // 5. Finalize Job Card (generates invoice and posts Sales Voucher)
    const finalizeRes = await context.request(`/api/v1/job-cards/${jc.id}/finalize`, {
      method: 'POST',
      headers
    });
    assert.equal(finalizeRes.response.status, 201);
    const invoice = finalizeRes.body.data.invoice;

    // Verify Sales Voucher was created
    const voucher = context.db.prepare("SELECT * FROM vouchers WHERE reference_table = 'invoices' AND reference_id = ?").get(invoice.id);
    assert.ok(voucher);
    assert.equal(voucher.voucher_type, 'Sales');

    // Verify Customer ledger running balance is updated (Debit 1180)
    const customerLedgerId = context.db.prepare("SELECT ledger_id FROM customers WHERE id = ?").get(customer.id).ledger_id;
    const balance = context.db.prepare("SELECT running_balance FROM ledger_balances WHERE ledger_id = ?").get(customerLedgerId);
    assert.equal(balance.running_balance, 1180);

    // Cancel invoice and verify reversal
    const cancelRes = await context.request(`/api/v1/invoices/${invoice.id}/cancel`, {
      method: 'POST',
      headers
    });
    assert.equal(cancelRes.response.status, 200);

    // Verify Sales Voucher status has been set to CANCELLED
    const deletedVch = context.db.prepare("SELECT * FROM vouchers WHERE reference_table = 'invoices' AND reference_id = ?").get(invoice.id);
    assert.equal(deletedVch.status, 'CANCELLED');

    // Verify Customer balance is back to 0
    const balanceAfterCancel = context.db.prepare("SELECT running_balance FROM ledger_balances WHERE ledger_id = ?").get(customerLedgerId);
    assert.equal(balanceAfterCancel.running_balance, 0);

  } finally {
    await context.close();
  }
});

test('Accounting - Purchase Silent Integration', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const headers = authHeaders(token);

    // 1. Create Supplier
    const supplierRes = await context.request('/api/v1/suppliers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Test Supplier Core',
        phone: '8888888888',
        email: 'supplier@test.com',
        city: 'Karnal',
        address: 'Sector 12',
        gstin: '06AAAAA1111A1Z1',
        is_active: 1
      })
    });
    assert.equal(supplierRes.response.status, 201);
    const supplier = supplierRes.body.data;

    // 2. Get Seeded Warehouse 'MAIN'
    const warehouse = context.db.prepare("SELECT * FROM warehouses WHERE code = 'MAIN'").get();
    assert.ok(warehouse);

    // 3. Get Seeded Category
    const categoryId = context.db.prepare('SELECT id FROM inventory_categories LIMIT 1').get().id;

    // 4. Create Item
    const itemRes = await context.request('/api/v1/inventory/items', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sku: 'OIL5W30',
        item_name: 'Castrol 5W30',
        category_id: categoryId,
        supplier_id: supplier.id,
        purchase_cost: 400,
        selling_price: 600,
        reorder_level: 1,
        gst_rate: 18,
        hsn_code: '27101980',
        unit_of_measure: 'ltr',
        is_active: 1
      })
    });
    assert.equal(itemRes.response.status, 201);
    const item = itemRes.body.data;

    // 5. Record stock receipt (Purchase)
    const receiptRes = await context.request('/api/v1/purchases/receipts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplier_id: supplier.id,
        receipt_date: '2026-06-10',
        receipt_number: 'GRN-999',
        items: [
          {
            item_id: item.id,
            warehouse_id: warehouse.id,
            batch_number: 'B-001',
            manufacture_date: '2026-05-01',
            expiry_date: '2029-05-01',
            quantity: 10,
            purchase_cost: 400,
            selling_price: 600,
            gst_rate: 18
          }
        ]
      })
    });
    assert.equal(receiptRes.response.status, 201);
    const receipt = receiptRes.body.data;

    // Verify Purchase voucher is silently created in the background:
    // Subtotal: 4000, GST: 720 (CGST 360, SGST 360), Grand Total: 4720
    const voucher = context.db.prepare("SELECT * FROM vouchers WHERE reference_table = 'purchase_receipts' AND reference_id = ?").get(receipt.id);
    assert.ok(voucher);
    assert.equal(voucher.voucher_type, 'Purchase');

    // Verify journal entries and ledger balances
    const entries = context.db.prepare("SELECT * FROM journal_entries WHERE voucher_id = ?").all(voucher.id);
    assert.equal(entries.length, 4);

    const stockDebit = entries.find(e => e.ledger_id === 3); // Inventory Stock
    const cgstDebit = entries.find(e => e.ledger_id === 4); // CGST Input
    const sgstDebit = entries.find(e => e.ledger_id === 5); // SGST Input

    assert.equal(stockDebit.amount, 4000);
    assert.equal(cgstDebit.amount, 360);
    assert.equal(sgstDebit.amount, 360);

    // Verify balances cache
    const supplierLedgerId = context.db.prepare("SELECT ledger_id FROM suppliers WHERE id = ?").get(supplier.id).ledger_id;
    const supplierBal = context.db.prepare("SELECT running_balance FROM ledger_balances WHERE ledger_id = ?").get(supplierLedgerId);
    assert.equal(supplierBal.running_balance, 4720);

  } finally {
    await context.close();
  }
});

test('Accounting - LedgerResolver Caching', async () => {
  const context = await createTestContext();
  const engine = new AccountingPostingEngine(context.db);

  try {
    // 1. Cold lookup (reads from DB)
    const ledgerId1 = engine.ledgerResolver.getLedgerId(1, 'cash_in_hand');
    assert.equal(ledgerId1, 1);

    // 2. Cache hit (retrieved instantly from memory map)
    const start = process.hrtime.bigint();
    const ledgerId2 = engine.ledgerResolver.getLedgerId(1, 'cash_in_hand');
    const duration = process.hrtime.bigint() - start;
    assert.equal(ledgerId2, 1);
    assert.ok(duration < 1000000n, 'Cache lookup must be sub-millisecond');

    // 3. Cache warming
    engine.ledgerResolver.clearCache();
    engine.ledgerResolver.warmCache(1);
    const hasCached = engine.ledgerResolver.cache.has('1:hdfc_bank');
    assert.ok(hasCached);

    // 4. Invalid key check
    assert.throws(() => {
      engine.ledgerResolver.getLedgerId(1, 'non_existent_key');
    }, /not found/);

    // 5. Invalid company check
    assert.throws(() => {
      engine.ledgerResolver.getLedgerId(null, 'cash_in_hand');
    }, /Company ID is required/);

  } finally {
    await context.close();
  }
});

test('Accounting - Security and Authorization gates', async () => {
  const context = await createTestContext();

  try {
    const adminToken = await login(context);

    // 1. Create a Mechanic user
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash('Mechanic@12345', 12);
    const mechanicRole = context.db.prepare("SELECT id FROM roles WHERE name = 'Mechanic'").get();

    context.db.prepare(`
      INSERT INTO users (name, username, password_hash, role_id, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run('Test Mechanic', 'mechanic_test_user', passwordHash, mechanicRole.id);

    // Log in as mechanic
    const loginMech = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'mechanic_test_user',
        password: 'Mechanic@12345',
      }),
    });
    assert.equal(loginMech.response.status, 200);
    const mechToken = loginMech.body.token;

    // 2. Query debug endpoints with Mechanic credentials (should receive 403 Forbidden)
    const unauthorizedRes = await context.request('/api/v1/accounting/debug/ledger/1', {
      headers: authHeaders(mechToken)
    });
    assert.equal(unauthorizedRes.response.status, 403);

    // Query with Admin credentials (should succeed with 200)
    const authorizedRes = await context.request('/api/v1/accounting/debug/ledger/1', {
      headers: authHeaders(adminToken)
    });
    assert.equal(authorizedRes.response.status, 200);

  } finally {
    await context.close();
  }
});

test('Accounting - Concurrency Retry Safety', async () => {
  const context = await createTestContext();
  const engine = new AccountingPostingEngine(context.db);

  try {
    // 1. Post an initial voucher to establish a sequence
    engine.post({
      voucherType: 'Sales',
      voucherDate: '2026-06-10',
      entries: [
        { ledgerId: 1, type: 'DEBIT', amount: 100 },
        { ledgerId: 10, type: 'CREDIT', amount: 100 }
      ]
    });

    // 2. Mock sequence generator to return a duplicate SAL-2026-000001 on the first call of the next post
    let callCount = 0;
    const originalGetNext = engine.voucherNumber.getNextVoucherNumber;
    engine.voucherNumber.getNextVoucherNumber = function(companyId, voucherType, date) {
      callCount++;
      if (callCount === 1) {
        return 'SAL-2026-000001'; // Force duplicate sequence collision
      }
      return originalGetNext.call(this, companyId, voucherType, date);
    };

    // 3. Post a second voucher and verify it succeeds and retries
    const voucher = engine.post({
      voucherType: 'Sales',
      voucherDate: '2026-06-10',
      entries: [
        { ledgerId: 1, type: 'DEBIT', amount: 200 },
        { ledgerId: 10, type: 'CREDIT', amount: 200 }
      ]
    });

    assert.ok(voucher.voucherId);
    assert.equal(callCount, 2, 'Should retry sequence generation after unique constraint failure');
    assert.equal(voucher.voucherNumber, 'SAL-2026-000002');

  } finally {
    await context.close();
  }
});

test('Accounting - Database Query Planner Index Verification', async () => {
  const context = await createTestContext();

  try {
    // 1. Verify index idx_vouchers_reference is hit by the planner during cancellation queries
    const plan1 = context.db.prepare("EXPLAIN QUERY PLAN SELECT id FROM vouchers WHERE reference_table = 'invoices' AND reference_id = 123").all();
    const planText1 = JSON.stringify(plan1);
    assert.ok(
      planText1.includes('idx_vouchers_reference') || planText1.includes('USING INDEX'),
      `Query plan should utilize the idx_vouchers_reference index: ${planText1}`
    );

    // 2. Verify index idx_vouchers_sequencing is hit during sequential sequencing lookup
    const plan2 = context.db.prepare("EXPLAIN QUERY PLAN SELECT voucher_number FROM vouchers WHERE company_id = 1 AND voucher_type = 'Sales' AND voucher_number LIKE 'SAL-%' ORDER BY voucher_number DESC LIMIT 1").all();
    const planText2 = JSON.stringify(plan2);
    assert.ok(
      planText2.includes('idx_vouchers_sequencing') || planText2.includes('USING INDEX'),
      `Query plan should utilize the idx_vouchers_sequencing index: ${planText2}`
    );

  } finally {
    await context.close();
  }
});

test('Accounting - Financial Year Gates and Lock Boundary Conditions', async () => {
  const context = await createTestContext();
  const engine = new AccountingPostingEngine(context.db);

  try {
    // 1. Post to a date outside of any financial year (should throw NO_FINANCIAL_YEAR)
    assert.throws(() => {
      engine.post({
        voucherType: 'Sales',
        voucherDate: '2024-06-10', // Seeds only contain FY 2026-27 (starts 2026-04-01)
        entries: [
          { ledgerId: 1, type: 'DEBIT', amount: 100 },
          { ledgerId: 10, type: 'CREDIT', amount: 100 }
        ]
      });
    }, /No financial year covers this posting date/);

    // 2. Set seeded financial year to inactive
    context.db.prepare("UPDATE financial_years SET is_active = 0 WHERE name = 'FY 2026-27'").run();

    assert.throws(() => {
      engine.post({
        voucherType: 'Sales',
        voucherDate: '2026-06-10',
        entries: [
          { ledgerId: 1, type: 'DEBIT', amount: 100 },
          { ledgerId: 10, type: 'CREDIT', amount: 100 }
        ]
      });
    }, /is inactive/);

    // 3. Set seeded financial year to closed
    context.db.prepare("UPDATE financial_years SET is_active = 1, is_closed = 1 WHERE name = 'FY 2026-27'").run();

    assert.throws(() => {
      engine.post({
        voucherType: 'Sales',
        voucherDate: '2026-06-10',
        entries: [
          { ledgerId: 1, type: 'DEBIT', amount: 100 },
          { ledgerId: 10, type: 'CREDIT', amount: 100 }
        ]
      });
    }, /is already closed/);

  } finally {
    await context.close();
  }
});

test('Accounting - Sprint 2 REST APIs, Manual Vouchers & Reports', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const headers = authHeaders(token);

    // 1. Create a mechanic user to test permission gates (Mechanics do not have accounting.read/write)
    const mechanicRole = context.db.prepare("SELECT id FROM roles WHERE name = 'Mechanic'").get();
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash('Mechanic@12345', 12);

    context.db.prepare(`
      INSERT INTO users (name, username, password_hash, role_id, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run('Mech Rep', 'mech_rep', passwordHash, mechanicRole.id);

    const loginMech = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'mech_rep', password: 'Mechanic@12345' }),
    });
    assert.equal(loginMech.response.status, 200);
    const mechToken = loginMech.body.token;

    // A. Verify that Mechanic cannot access Trial Balance (403 Forbidden)
    const mechReportRes = await context.request('/api/v1/accounting/reports/trial-balance?asOfDate=2026-06-30', {
      headers: authHeaders(mechToken)
    });
    assert.equal(mechReportRes.response.status, 403);

    // B. Verify that Admin CAN access Trial Balance (200 OK)
    const adminReportRes = await context.request('/api/v1/accounting/reports/trial-balance?asOfDate=2026-06-30', {
      headers
    });
    if (adminReportRes.response.status !== 200) {
      console.log('FAIL TRIAL BALANCE RESP STATUS:', adminReportRes.response.status);
      console.log('FAIL TRIAL BALANCE RESP BODY:', adminReportRes.body);
    }
    assert.equal(adminReportRes.response.status, 200);

    // 2. Test Manual Voucher posting validation
    // A. Unbalanced manual voucher post should return 400
    const unbalancedRes = await context.request('/api/v1/accounting/vouchers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        voucherType: 'Journal',
        voucherDate: '2026-06-10',
        narration: 'Unbalanced entry',
        entries: [
          { ledgerId: 1, type: 'DEBIT', amount: 1000 },
          { ledgerId: 10, type: 'CREDIT', amount: 900 }
        ]
      })
    });
    assert.equal(unbalancedRes.response.status, 400);

    // B. Contra voucher involving non-Cash/Bank should return 400
    const invalidContraRes = await context.request('/api/v1/accounting/vouchers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        voucherType: 'Contra',
        voucherDate: '2026-06-10',
        narration: 'Invalid contra',
        entries: [
          { ledgerId: 1, type: 'DEBIT', amount: 500 }, // Cash
          { ledgerId: 13, type: 'CREDIT', amount: 500 } // Rent (Not Cash or Bank)
        ]
      })
    });
    assert.equal(invalidContraRes.response.status, 400);

    // C. Payment voucher not crediting Cash or Bank should return 400
    const invalidPaymentRes = await context.request('/api/v1/accounting/vouchers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        voucherType: 'Payment',
        voucherDate: '2026-06-10',
        narration: 'Invalid payment',
        entries: [
          { ledgerId: 13, type: 'DEBIT', amount: 500 }, // Rent
          { ledgerId: 10, type: 'CREDIT', amount: 500 } // Parts sales (Not Cash or Bank)
        ]
      })
    });
    assert.equal(invalidPaymentRes.response.status, 400);

    // D. Valid Contra post should succeed (201 Created)
    const validContra = await context.request('/api/v1/accounting/vouchers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        voucherType: 'Contra',
        voucherDate: '2026-06-10',
        narration: 'Contra cash deposit to HDFC',
        entries: [
          { ledgerId: 2, type: 'DEBIT', amount: 10000 }, // HDFC Bank
          { ledgerId: 1, type: 'CREDIT', amount: 10000 } // Cash
        ]
      })
    });
    assert.equal(validContra.response.status, 201);
    const contraVoucher = validContra.body.data;
    assert.ok(contraVoucher.voucherId);

    // 3. Test Live Financial Statements Calculations
    // Post a manual expense payment (Rent: Debit 5000, Cash: Credit 5000)
    const rentPayment = await context.request('/api/v1/accounting/vouchers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        voucherType: 'Payment',
        voucherDate: '2026-06-11',
        narration: 'Manual rent payment',
        entries: [
          { ledgerId: 13, type: 'DEBIT', amount: 5000 },
          { ledgerId: 1, type: 'CREDIT', amount: 5000 }
        ]
      })
    });
    assert.equal(rentPayment.response.status, 201);

    // A. Verify Trial Balance Totals
    const tbRes = await context.request('/api/v1/accounting/reports/trial-balance?asOfDate=2026-06-30', { headers });
    assert.equal(tbRes.response.status, 200);
    const tb = tbRes.body.data;
    assert.equal(tb.totals.isBalanced, true);
    assert.ok(tb.totals.debits > 0);
    assert.equal(tb.totals.debits, tb.totals.credits);

    // B. Verify Profit & Loss Calculation
    const plRes = await context.request('/api/v1/accounting/reports/profit-loss?startDate=2026-06-01&endDate=2026-06-30', { headers });
    assert.equal(plRes.response.status, 200);
    const pl = plRes.body.data;
    // Rent expense should be included
    const rentItem = pl.expenses.items.find(i => i.ledgerName === 'Rent Expense');
    assert.ok(rentItem);
    assert.equal(rentItem.amount, 5000);
    assert.equal(pl.netProfit, -5000); // 0 revenue - 5000 expenses

    // C. Verify Balance Sheet Dynamic Equation (Assets = Liabilities + Equity)
    const bsRes = await context.request('/api/v1/accounting/reports/balance-sheet?asOfDate=2026-06-30', { headers });
    assert.equal(bsRes.response.status, 200);
    const bs = bsRes.body.data;
    assert.equal(bs.totals.isBalanced, true);
    assert.equal(bs.assets.total, bs.totals.totalLiabilitiesAndEquity);

    // D. Verify Ledger detailed running Statement
    const statementRes = await context.request('/api/v1/accounting/ledgers/1/statement?startDate=2026-06-01&endDate=2026-06-30', { headers });
    assert.equal(statementRes.response.status, 200);
    const statement = statementRes.body.data;
    assert.equal(statement.ledgerId, 1);
    assert.equal(statement.transactions.length, 2); // Contra credit 10000, Payment credit 5000
    assert.equal(statement.totals.credits, 15000);
    assert.equal(statement.totals.closingBalance, -15000); // 0 opening - 15000 credits

  } finally {
    await context.close();
  }
});

test('Accounting - Sprint 3 Direct Billing, Receipts, and Allocations Engine', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const headers = authHeaders(token);

    // 1. Create a customer to bill
    const custInsert = context.db.prepare(`
      INSERT INTO customers (name, phone, email)
      VALUES (?, ?, ?)
    `).run('John Trader', '9999999999', 'john@trader.com');
    const customerId = custInsert.lastInsertRowid;

    // 2. Set up initial inventory stock to sell
    const itemInsert = context.db.prepare(`
      INSERT INTO inventory_items (sku, item_name, purchase_cost, selling_price, current_quantity, gst_rate, is_active)
      VALUES (?, ?, ?, ?, ?, 18, 1)
    `).run('SKU-PART-01', 'Test Brake Pad', 200, 300, 50);
    const itemId = itemInsert.lastInsertRowid;

    // Seed inventory batch to allow FIFO deduction
    context.db.prepare(`
      INSERT INTO inventory_batches (item_id, warehouse_id, batch_number, purchase_cost, selling_price, quantity)
      VALUES (?, 1, 'BATCH-001', 200, 300, 50)
    `).run(itemId);

    // 3. Test Direct Invoice creation (Counter sale)
    const directInvoiceRes = await context.request('/api/v1/accounting/direct-invoices', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId,
        invoiceDate: '2026-06-15',
        narration: 'Counter sale of parts and labor',
        items: [
          {
            itemId,
            description: 'Test Brake Pad Spare',
            quantity: 2,
            unitPrice: 300,
            gstRate: 18,
            warehouseId: 1
          },
          {
            itemId: null, // Service item
            description: 'Direct Fitting Labor',
            quantity: 1,
            unitPrice: 150,
            gstRate: 18
          }
        ]
      })
    });
    assert.equal(directInvoiceRes.response.status, 201);
    const invoice = directInvoiceRes.body.data;
    assert.ok(invoice.invoiceId);
    assert.equal(invoice.grandTotal, 885); // (600 + 150) * 1.18 = 885

    // Verify inventory current quantity decreased by 2
    const updatedItem = context.db.prepare('SELECT current_quantity FROM inventory_items WHERE id = ?').get(itemId);
    assert.equal(updatedItem.current_quantity, 48);

    // 4. Test Customer Receipts Creation and Auto-Allocation (FIFO)
    const receiptRes = await context.request('/api/v1/accounting/receipts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId,
        receiptDate: '2026-06-16',
        amount: 885,
        paymentMode: 'CASH',
        narration: 'Bulk cash payment matching FIFO',
        autoAllocate: true
      })
    });
    assert.equal(receiptRes.response.status, 201);
    const receipt = receiptRes.body.data;
    assert.ok(receipt.receiptId);

    // Verify that the direct invoice status is now PAID and amount_paid is updated
    const updatedInvoice = context.db.prepare('SELECT status, amount_paid FROM direct_invoices WHERE id = ?').get(invoice.invoiceId);
    assert.equal(updatedInvoice.status, 'PAID');
    assert.equal(updatedInvoice.amount_paid, 885);

    // Verify that the receipt's unallocated amount is 0
    const updatedReceipt = context.db.prepare('SELECT unallocated_amount, status FROM customer_receipts WHERE id = ?').get(receipt.receiptId);
    assert.equal(updatedReceipt.unallocated_amount, 0);
    assert.equal(updatedReceipt.status, 'ACTIVE');

    // 5. Test outstanding list updates
    // Create another invoice for John Trader (grand total: 1062)
    const secondInvoiceRes = await context.request('/api/v1/accounting/direct-invoices', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId,
        invoiceDate: '2026-06-17',
        items: [
          {
            itemId,
            description: 'Test Brake Pad',
            quantity: 3,
            unitPrice: 300,
            gstRate: 18,
            warehouseId: 1
          }
        ]
      })
    });
    assert.equal(secondInvoiceRes.response.status, 201);
    const secondInvoiceId = secondInvoiceRes.body.data.invoiceId;

    // Check John Trader's outstanding list (should return the second invoice as outstanding)
    const outstandingRes = await context.request(`/api/v1/accounting/customers/${customerId}/outstanding`, { headers });
    assert.equal(outstandingRes.response.status, 200);
    const outstanding = outstandingRes.body.data;
    assert.equal(outstanding.length, 1);
    assert.equal(outstanding[0].documentId, secondInvoiceId);
    assert.equal(outstanding[0].outstandingAmount, 1062); // 900 * 1.18 = 1062

    // 6. Test Receipt Cancellation and Stock Restoration
    // Cancel the first invoice (should return 400 because it has active receipt allocations)
    const cancelFailRes = await context.request(`/api/v1/accounting/direct-invoices/${invoice.invoiceId}/cancel`, {
      method: 'POST',
      headers
    });
    assert.equal(cancelFailRes.response.status, 400);

    // Cancel the receipt (which reverses allocations)
    const cancelReceiptRes = await context.request(`/api/v1/accounting/receipts/${receipt.receiptId}`, {
      method: 'DELETE',
      headers
    });
    assert.equal(cancelReceiptRes.response.status, 200);

    // Verify that invoice goes back to UNPAID
    const revertedInvoice = context.db.prepare('SELECT status, amount_paid FROM direct_invoices WHERE id = ?').get(invoice.invoiceId);
    assert.equal(revertedInvoice.status, 'UNPAID');
    assert.equal(revertedInvoice.amount_paid, 0);

    // Now cancel the first direct invoice (should succeed since allocations are gone)
    const cancelInvoiceRes = await context.request(`/api/v1/accounting/direct-invoices/${invoice.invoiceId}/cancel`, {
      method: 'POST',
      headers
    });
    assert.equal(cancelInvoiceRes.response.status, 200);

    // Verify inventory stock is restored from 45 to 47 (since second invoice is still active)
    const restoredItem = context.db.prepare('SELECT current_quantity FROM inventory_items WHERE id = ?').get(itemId);
    assert.equal(restoredItem.current_quantity, 47);

    // Cancel second invoice as well
    const cancelSecondRes = await context.request(`/api/v1/accounting/direct-invoices/${secondInvoiceId}/cancel`, {
      method: 'POST',
      headers
    });
    assert.equal(cancelSecondRes.response.status, 200);

    // Now verify stock is fully restored to 50
    const restoredItemFully = context.db.prepare('SELECT current_quantity FROM inventory_items WHERE id = ?').get(itemId);
    assert.equal(restoredItemFully.current_quantity, 50);

  } finally {
    await context.close();
  }
});
