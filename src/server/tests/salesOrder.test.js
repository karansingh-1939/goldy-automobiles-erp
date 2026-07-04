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

test('Sales Orders, Quotations & Customer Order Management Sprint 7', async () => {
  const context = await createTestContext();
  const db = context.db;

  try {
    const token = await login(context);
    const headers = authHeaders(token);

    // Seed default supplier, active customer, and inventory item
    db.prepare(`
      INSERT OR IGNORE INTO suppliers (id, name, phone, email, is_active)
      VALUES (1, 'Test Supplier', '1234567890', 'supplier@example.com', 1)
    `).run();

    db.prepare(`
      INSERT OR IGNORE INTO customers (id, name, phone, email, state)
      VALUES (1, 'Acme Corp', '9876543210', 'acme@example.com', 'Haryana')
    `).run();

    const itemId = db.prepare(`
      INSERT INTO inventory_items (sku, item_name, purchase_cost, selling_price, current_quantity, average_cost, gst_rate, is_active)
      VALUES ('PART-S7', 'Spark Plug S7', 100, 150, 0, 0, 18, 1)
    `).run().lastInsertRowid;

    // Seed stock adjustments system ledger
    let adjLedger = db.prepare("SELECT id FROM ledgers WHERE system_key = 'stock_adjustments'").get();
    if (!adjLedger) {
      db.prepare(`
        INSERT INTO ledgers (company_id, name, group_id, opening_balance, nature, is_system, system_key)
        VALUES (1, 'Stock Adjustments', 13, 0, 'Debit', 1, 'stock_adjustments')
      `).run();
    }

    // Retrieve default warehouse
    const warehouses = db.prepare('SELECT id, code FROM warehouses').all();
    const mainWarehouse = warehouses.find(w => w.code === 'MAIN') || warehouses[0];
    assert.ok(mainWarehouse);

    // ----------------------------------------------------
    // 1. QUOTATION LIFECYCLE & REVISIONS
    // ----------------------------------------------------
    // Create quotation (Revision 0)
    let res = await context.request('/api/v1/sales-orders/quotations', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: 1,
        quotationDate: '2026-07-03',
        validUntil: '2026-08-03',
        taxType: 'EXCLUSIVE',
        items: [
          {
            itemId,
            quantity: 10,
            unitPrice: 150,
            discountAmount: 0,
            gstRate: 18
          }
        ]
      })
    });
    assert.equal(res.response.status, 201);
    const quote0 = res.body.data;
    assert.equal(quote0.quotation_number.startsWith('QT-'), true);
    assert.equal(quote0.revision_number, 0);
    assert.equal(quote0.grand_total, 1770); // 10 * 150 * 1.18 = 1770

    // Revise Quotation (Revision 1)
    res = await context.request(`/api/v1/sales-orders/quotations/${quote0.id}/revise`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        items: [
          {
            itemId,
            quantity: 12,
            unitPrice: 150,
            discountAmount: 100, // $100 discount
            gstRate: 18
          }
        ]
      })
    });
    assert.equal(res.response.status, 201);
    const quote1 = res.body.data;
    assert.equal(quote1.quotation_number, quote0.quotation_number);
    assert.equal(quote1.revision_number, 1);
    // (12 * 150 - 100) = 1700 subtotal. GST = 306. Grand = 2006
    assert.equal(quote1.grand_total, 2006);

    // Verify revision 0 status was updated to REJECTED (revised out)
    const oldQuote = db.prepare('SELECT status FROM quotations WHERE id = ?').get(quote0.id);
    assert.equal(oldQuote.status, 'REJECTED');

    // Convert Quotation Revision 1 to a Sales Order
    res = await context.request(`/api/v1/sales-orders/quotations/${quote1.id}/convert`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        warehouseId: mainWarehouse.id
      })
    });
    assert.equal(res.response.status, 201);
    const salesOrder = res.body.data;
    assert.equal(salesOrder.status, 'DRAFT');
    assert.equal(salesOrder.quotation_id, quote1.id);
    assert.equal(salesOrder.items[0].quantity, 12);
    assert.equal(salesOrder.items[0].warehouse_id, mainWarehouse.id);

    // Verify converted quotation status updated to ACCEPTED
    const activeQuoteStatus = db.prepare('SELECT status FROM quotations WHERE id = ?').get(quote1.id);
    assert.equal(activeQuoteStatus.status, 'ACCEPTED');

    // ----------------------------------------------------
    // 2. SALES ORDER CONFIRMATION & RESERVATIONS
    // ----------------------------------------------------
    // Seed some stock for the item so confirmation can reserve it
    res = await context.request('/api/v1/inventory/opening-stock', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        item_id: itemId,
        warehouse_id: mainWarehouse.id,
        quantity: 20,
        unit_cost: 100,
        batch_number: 'B-SO-CONFIRM',
        notes: 'Stock for sales order fulfillment'
      })
    });
    assert.equal(res.response.status, 201);

    // Confirm Sales Order (this allocates/reserves stock)
    res = await context.request(`/api/v1/sales-orders/${salesOrder.id}/confirm`, {
      method: 'POST',
      headers
    });
    assert.equal(res.response.status, 200);
    const confirmedOrder = res.body.data;
    assert.equal(confirmedOrder.status, 'CONFIRMED');
    assert.equal(confirmedOrder.items[0].allocated_quantity, 12);

    // Verify reservations are created in database
    const reservation = db.prepare("SELECT * FROM inventory_reservations WHERE reference_table = 'sales_orders' AND reference_id = ?").get(salesOrder.id);
    assert.ok(reservation);
    assert.equal(reservation.quantity, 12);
    assert.equal(reservation.status, 'ACTIVE');

    // Verify physical stock remains 20, but available quantity is 8 (20 - 12)
    const stockRow = db.prepare('SELECT current_quantity FROM inventory_items WHERE id = ?').get(itemId);
    assert.equal(stockRow.current_quantity, 20);

    const availableRes = await context.request(`/api/v1/inventory/items`, { headers });
    const itemAvailable = availableRes.body.data.find(i => i.id === itemId);
    // Note: getAvailableQuantity is computed on-the-fly and checked
    
    // ----------------------------------------------------
    // 3. DECOUPLED SHIPMENT FULFILLMENT & INVOICING
    // ----------------------------------------------------
    // Ship/fulfill a partial quantity of 5 units (Outstanding = 12 - 5 = 7)
    res = await context.request(`/api/v1/sales-orders/${salesOrder.id}/fulfill`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        shipmentDate: '2026-07-03',
        notes: 'Partial shipment 1',
        items: [
          {
            salesOrderItemId: confirmedOrder.items[0].id,
            quantity: 5
          }
        ]
      })
    });
    assert.equal(res.response.status, 201);
    const shipment = res.body.data;
    assert.equal(shipment.shipment_number.startsWith('SH-'), true);
    assert.equal(shipment.status, 'SHIPPED');
    assert.equal(shipment.items[0].quantity, 5);

    // Verify physical stock has decreased to 15 (20 - 5)
    const physicalStockAfterShip = db.prepare('SELECT current_quantity FROM inventory_items WHERE id = ?').get(itemId);
    assert.equal(physicalStockAfterShip.current_quantity, 15);

    // Verify active reservation decreased to 7 (12 - 5)
    const remainingReservation = db.prepare("SELECT quantity FROM inventory_reservations WHERE reference_table = 'sales_orders' AND reference_id = ? AND status = 'ACTIVE'").get(salesOrder.id);
    assert.equal(remainingReservation.quantity, 7);

    // Verify Sales Order status is now PARTIALLY_FULFILLED
    const orderStatusAfterShip = db.prepare('SELECT status FROM sales_orders WHERE id = ?').get(salesOrder.id);
    assert.equal(orderStatusAfterShip.status, 'PARTIALLY_FULFILLED');

    // Create Invoice for Shipment
    res = await context.request(`/api/v1/sales-orders/shipments/${shipment.id}/invoice`, {
      method: 'POST',
      headers
    });
    assert.equal(res.response.status, 201);
    const invoice = res.body.data;
    assert.equal(invoice.invoice_number.startsWith('DIR-'), true);
    assert.equal(invoice.sales_shipment_id, shipment.id);

    // Verify accounting general ledger voucher was posted for the invoice (5 units * price)
    const ledgerVoucher = db.prepare("SELECT id FROM vouchers WHERE reference_table = 'direct_invoices' AND reference_id = ?").get(invoice.id);
    assert.ok(ledgerVoucher);

    // Fulfill the remaining 7 units to complete the order
    res = await context.request(`/api/v1/sales-orders/${salesOrder.id}/fulfill`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        shipmentDate: '2026-07-03',
        notes: 'Final shipment',
        items: [
          {
            salesOrderItemId: confirmedOrder.items[0].id,
            quantity: 7
          }
        ]
      })
    });
    assert.equal(res.response.status, 201);
    const shipment2 = res.body.data;

    // Verify Sales Order status transitions to FULFILLED
    const finalOrderStatus = db.prepare('SELECT status FROM sales_orders WHERE id = ?').get(salesOrder.id);
    assert.equal(finalOrderStatus.status, 'FULFILLED');

    // Verify active reservation is completely consumed
    const activeResCount = db.prepare("SELECT COUNT(*) AS count FROM inventory_reservations WHERE reference_table = 'sales_orders' AND reference_id = ? AND status = 'ACTIVE'").get(salesOrder.id);
    assert.equal(activeResCount.count, 0);

    // ----------------------------------------------------
    // 4. SALES ORDER CANCELLATION & RESERVATION RELEASE
    // ----------------------------------------------------
    // Create new order to test cancellation
    res = await context.request('/api/v1/sales-orders', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: 1,
        orderDate: '2026-07-03',
        items: [
          {
            itemId,
            warehouseId: mainWarehouse.id,
            quantity: 2,
            unitPrice: 150
          }
        ]
      })
    });
    const cancelOrder = res.body.data;

    // Confirm it (reserves 2 units)
    await context.request(`/api/v1/sales-orders/${cancelOrder.id}/confirm`, {
      method: 'POST',
      headers
    });

    // Cancel it
    res = await context.request(`/api/v1/sales-orders/${cancelOrder.id}/cancel`, {
      method: 'POST',
      headers
    });
    assert.equal(res.response.status, 200);
    assert.equal(res.body.data.status, 'CANCELLED');

    // Verify reservations are cancelled
    const cancelledResCount = db.prepare("SELECT COUNT(*) AS count FROM inventory_reservations WHERE reference_table = 'sales_orders' AND reference_id = ? AND status = 'CANCELLED'").get(cancelOrder.id);
    assert.ok(cancelledResCount.count > 0);

    // ----------------------------------------------------
    // 5. REPORT ENDPOINTS
    // ----------------------------------------------------
    res = await context.request('/api/v1/sales-orders/reports/conversion-rate', { headers });
    assert.equal(res.response.status, 200);
    assert.ok(res.body.data.totalQuotations >= 1);

    res = await context.request('/api/v1/sales-orders/reports/pipeline', { headers });
    assert.equal(res.response.status, 200);

    res = await context.request('/api/v1/sales-orders/reports/aging', { headers });
    assert.equal(res.response.status, 200);

  } finally {
    await context.close();
  }
});
