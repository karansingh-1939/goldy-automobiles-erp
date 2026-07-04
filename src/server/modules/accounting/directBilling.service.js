import { AppError } from '../../shared/errors/AppError.js';
import { AccountingPostingEngine } from './postingEngine.service.js';
import { createInventoryService } from '../inventory/inventory.service.js';

function roundMoney(val) {
  return Math.round(val * 100) / 100;
}

/**
 * Service to manage direct (non-job-card) counter billing.
 */
export class DirectBillingService {
  constructor(db) {
    this.db = db;
    this.postingEngine = new AccountingPostingEngine(db);
    this.inventoryService = createInventoryService(db);
  }

  /**
   * Deducts parts stock dynamically across batches using FIFO, returning total cost price.
   */
  deductStock(itemId, warehouseId, quantity, invoiceId, userId) {
    let remaining = Number(quantity);

    // 1. Fetch batches ordered by id ASC (FIFO)
    const batches = this.db.prepare(`
      SELECT id, quantity, purchase_cost
      FROM inventory_batches
      WHERE item_id = ? AND warehouse_id = ? AND quantity > 0
      ORDER BY id ASC
    `).all(itemId, warehouseId);

    let totalCost = 0;

    for (const batch of batches) {
      if (remaining <= 0) break;
      const deduct = Math.min(batch.quantity, remaining);

      // Perform stock out via InventoryService
      this.inventoryService.stockOut({
        itemId,
        warehouseId,
        batchId: batch.id,
        quantity: deduct,
        transactionType: 'Consumption',
        referenceType: 'direct_invoices',
        referenceId: invoiceId,
        notes: `Direct counter sale`,
        userId
      });

      totalCost += (deduct * batch.purchase_cost);
      remaining = roundMoney(remaining - deduct);
    }

    if (remaining > 0) {
      // Fallback: force oldest batch to handle remaining/over-allocation
      const oldest = this.db.prepare(`
        SELECT id, purchase_cost FROM inventory_batches WHERE item_id = ? AND warehouse_id = ? ORDER BY id ASC LIMIT 1
      `).get(itemId, warehouseId);
      if (oldest) {
        this.inventoryService.stockOut({
          itemId,
          warehouseId,
          batchId: oldest.id,
          quantity: remaining,
          transactionType: 'Consumption',
          referenceType: 'direct_invoices',
          referenceId: invoiceId,
          notes: `Direct counter sale (unallocated)`,
          userId
        });
        totalCost += (remaining * oldest.purchase_cost);
      } else {
        throw new AppError('No stock batches available for this item in the selected warehouse.', 400, 'INSUFFICIENT_STOCK');
      }
    }

    return roundMoney(totalCost);
  }

  /**
   * Creates a direct counter invoice.
   */
  createDirectInvoice(payload) {
    const {
      companyId = 1,
      customerId,
      invoiceDate,
      items,
      narration = '',
      createdBy = null
    } = payload;

    // 1. Validations
    if (!customerId || !invoiceDate || !items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('Customer, date, and items are required.', 400, 'DIRECT_BILLING_INVALID_PAYLOAD');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
      throw new AppError('Invoice date must be YYYY-MM-DD.', 400, 'DIRECT_BILLING_INVALID_DATE');
    }

    // Verify customer exists
    const customer = this.db.prepare('SELECT name, ledger_id, state FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      throw new AppError('Customer not found.', 404, 'CUSTOMER_NOT_FOUND');
    }

    const company = this.db.prepare('SELECT state FROM companies WHERE id = ?').get(companyId);
    const companyState = company ? (company.state || 'Haryana') : 'Haryana';
    const customerState = customer.state || companyState;
    const isInterstate = customerState.trim().toLowerCase() !== companyState.trim().toLowerCase();

    const customerLedgerId = this.postingEngine.getOrCreateCustomerLedger(companyId, customerId, customer.name);

    return this.db.transaction(() => {
      // 2. Generate sequential invoice number
      const year = new Date(invoiceDate).getFullYear();
      const prefix = `DIR-${year}-`;
      const last = this.db.prepare("SELECT invoice_number FROM direct_invoices WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1").get(`${prefix}%`);
      let seq = 1;
      if (last) {
        const match = last.invoice_number.match(/(\d+)$/);
        if (match) {
          seq = parseInt(match[1], 10) + 1;
        }
      }
      const invoiceNumber = `${prefix}${String(seq).padStart(6, '0')}`;

      // Insert dummy invoice to get ID for references
      const dummyInfo = this.db.prepare(`
        INSERT INTO direct_invoices (
          invoice_number, company_id, customer_id, invoice_date, subtotal, gst_total, grand_total, status, narration, created_by, cgst_total, sgst_total, igst_total
        ) VALUES (?, ?, ?, ?, 0, 0, 0, 'UNPAID', ?, ?, 0, 0, 0)
      `).run(invoiceNumber, companyId, customerId, invoiceDate, narration, createdBy);

      const invoiceId = dummyInfo.lastInsertRowid;

      let subtotal = 0;
      let gstTotal = 0;
      let totalPartsCost = 0;
      let totalPartsRevenue = 0;
      let totalLabourRevenue = 0;

      const processedItems = [];

      // 3. Process items and deduct stock if parts
      for (const item of items) {
        const qty = Number(item.quantity);
        const price = Number(item.unitPrice);
        const gstRate = Number(item.gstRate || 0);

        if (qty <= 0 || price < 0) {
          throw new AppError('Quantity and price must be positive numbers.', 400, 'DIRECT_BILLING_INVALID_ITEM_VALUES');
        }

        const lineSubtotal = roundMoney(qty * price);
        const lineGst = roundMoney(lineSubtotal * (gstRate / 100));
        const lineTotal = roundMoney(lineSubtotal + lineGst);

        let costPrice = 0;

        if (item.itemId) {
          // Verify inventory item
          const invItem = this.db.prepare('SELECT item_name FROM inventory_items WHERE id = ?').get(item.itemId);
          if (!invItem) {
            throw new AppError(`Inventory item ID ${item.itemId} not found.`, 404, 'INVENTORY_ITEM_NOT_FOUND');
          }

          if (!item.warehouseId) {
            throw new AppError(`Warehouse ID is required for inventory part ${invItem.item_name}.`, 400, 'WAREHOUSE_REQUIRED');
          }

          // Deduct stock and retrieve cost
          const lineCost = this.deductStock(item.itemId, item.warehouseId, qty, invoiceId, createdBy);
          costPrice = roundMoney(lineCost / qty);
          totalPartsCost += lineCost;
          totalPartsRevenue += lineSubtotal;
        } else {
          totalLabourRevenue += lineSubtotal;
        }

        subtotal += lineSubtotal;
        gstTotal += lineGst;

        processedItems.push({
          itemId: item.itemId || null,
          description: item.description || (item.itemId ? 'Spare Part' : 'Labor Service'),
          quantity: qty,
          unitPrice: price,
          gstRate,
          gstAmount: lineGst,
          lineTotal,
          costPrice,
          warehouseId: item.warehouseId || null
        });
      }

      const grandTotal = Math.round(subtotal + gstTotal);
      
      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      if (isInterstate) {
        igst = roundMoney(gstTotal);
      } else {
        cgst = roundMoney(gstTotal / 2);
        sgst = roundMoney(gstTotal - cgst);
      }

      // Save processed invoice items
      const insertItem = this.db.prepare(`
        INSERT INTO direct_invoice_items (
          direct_invoice_id, item_id, description, quantity, unit_price, gst_rate, gst_amount, line_total, cost_price, warehouse_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of processedItems) {
        insertItem.run(
          invoiceId,
          item.itemId,
          item.description,
          item.quantity,
          item.unitPrice,
          item.gstRate,
          item.gstAmount,
          item.lineTotal,
          item.costPrice,
          item.warehouseId
        );
      }

      // 4. Compile accounting entries
      const salesEntries = [];
      salesEntries.push({ ledgerId: customerLedgerId, type: 'DEBIT', amount: grandTotal });

      if (totalPartsRevenue > 0) {
        salesEntries.push({ ledgerId: this.postingEngine.ledgerResolver.getLedgerId(companyId, 'parts_sales'), type: 'CREDIT', amount: totalPartsRevenue });
      }
      if (totalLabourRevenue > 0) {
        salesEntries.push({ ledgerId: this.postingEngine.ledgerResolver.getLedgerId(companyId, 'labour_sales'), type: 'CREDIT', amount: totalLabourRevenue });
      }
      
      if (igst > 0) {
        salesEntries.push({ ledgerId: this.postingEngine.ledgerResolver.getLedgerId(companyId, 'igst_output'), type: 'CREDIT', amount: igst });
      } else {
        if (cgst > 0) {
          salesEntries.push({ ledgerId: this.postingEngine.ledgerResolver.getLedgerId(companyId, 'cgst_output'), type: 'CREDIT', amount: cgst });
        }
        if (sgst > 0) {
          salesEntries.push({ ledgerId: this.postingEngine.ledgerResolver.getLedgerId(companyId, 'sgst_output'), type: 'CREDIT', amount: sgst });
        }
      }

      // Calculate round off
      const sumCredits = totalPartsRevenue + totalLabourRevenue + cgst + sgst + igst;
      const roundoff = roundMoney(grandTotal - sumCredits);
      if (Math.abs(roundoff) >= 0.01) {
        const roundOffLedgerId = this.postingEngine.ledgerResolver.getLedgerId(companyId, 'round_off');
        if (roundoff > 0) {
          salesEntries.push({ ledgerId: roundOffLedgerId, type: 'CREDIT', amount: roundoff });
        } else {
          salesEntries.push({ ledgerId: roundOffLedgerId, type: 'DEBIT', amount: Math.abs(roundoff) });
        }
      }

      // Post Sales Voucher
      const salesVoucher = this.postingEngine.post({
        companyId,
        voucherType: 'Sales',
        voucherDate: invoiceDate,
        referenceTable: 'direct_invoices',
        referenceId: invoiceId,
        narration: narration || `Direct counter sale invoice ${invoiceNumber}`,
        created_by: createdBy,
        entries: salesEntries
      });

      // Post COGS Voucher if applicable
      let cogsVoucherId = null;
      if (totalPartsCost > 0) {
        const cogsEntries = [
          { ledgerId: this.postingEngine.ledgerResolver.getLedgerId(companyId, 'cogs'), type: 'DEBIT', amount: totalPartsCost },
          { ledgerId: this.postingEngine.ledgerResolver.getLedgerId(companyId, 'inventory_stock'), type: 'CREDIT', amount: totalPartsCost }
        ];
        const cogsVoucher = this.postingEngine.post({
          companyId,
          voucherType: 'Journal',
          voucherDate: invoiceDate,
          referenceTable: 'direct_invoices',
          referenceId: invoiceId,
          narration: `Cost of goods sold for direct counter invoice ${invoiceNumber}`,
          created_by: createdBy,
          entries: cogsEntries
        });
        cogsVoucherId = cogsVoucher.voucherId;
      }

      // 5. Update main invoice document with final calculations and voucher links
      this.db.prepare(`
        UPDATE direct_invoices
        SET subtotal = ?, gst_total = ?, grand_total = ?, voucher_id = ?, cogs_voucher_id = ?, cgst_total = ?, sgst_total = ?, igst_total = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(subtotal, gstTotal, grandTotal, salesVoucher.voucherId, cogsVoucherId, cgst, sgst, igst, invoiceId);

      return {
        invoiceId,
        invoiceNumber,
        grandTotal,
        voucherId: salesVoucher.voucherId,
        cogsVoucherId
      };
    })();
  }

  /**
   * Cancels a direct invoice, cancels linked vouchers, and rolls back inventory stock.
   */
  cancelDirectInvoice(invoiceId, companyId = 1, userId = null) {
    return this.db.transaction(() => {
      const invoice = this.db.prepare('SELECT * FROM direct_invoices WHERE id = ? AND company_id = ?').get(invoiceId, companyId);
      if (!invoice) {
        throw new AppError('Direct invoice not found.', 404, 'INVOICE_NOT_FOUND');
      }

      if (invoice.status === 'CANCELLED') {
        throw new AppError('Invoice is already cancelled.', 400, 'INVOICE_ALREADY_CANCELLED');
      }

      // Assert that no payments are currently allocated to this invoice
      const allocations = this.db.prepare("SELECT COUNT(*) as count FROM receipt_allocations WHERE document_type = 'direct_invoice' AND document_id = ?").get(invoiceId);
      if (allocations && allocations.count > 0) {
        throw new AppError('Cannot cancel invoice with active payment allocations. Revert allocations first.', 400, 'ACTIVE_ALLOCATIONS_EXIST');
      }

      // 1. Rollback stock adjustments (Return stock IN)
      const items = this.db.prepare('SELECT * FROM direct_invoice_items WHERE direct_invoice_id = ?').all(invoiceId);
      for (const item of items) {
        if (item.item_id && item.warehouse_id) {
          // Adjust stock back IN
          const invItem = this.db.prepare('SELECT current_quantity, average_cost FROM inventory_items WHERE id = ?').get(item.item_id);
          const newQty = invItem.current_quantity + item.quantity;

          this.db.prepare('UPDATE inventory_items SET current_quantity = ? WHERE id = ?').run(newQty, item.item_id);

          // Update batch quantity
          if (item.batch_id) {
            const batch = this.db.prepare('SELECT quantity FROM inventory_batches WHERE id = ?').get(item.batch_id);
            if (batch) {
              this.db.prepare('UPDATE inventory_batches SET quantity = ? WHERE id = ?').run(batch.quantity + item.quantity, item.batch_id);
            }
          }

          // Create inventory transaction
          this.db.prepare(`
            INSERT INTO inventory_transactions (
              item_id, batch_id, warehouse_id, transaction_type, direction, reference_type, 
              reference_id, quantity, unit_cost, average_cost_after, quantity_after, notes, created_by
            ) VALUES (?, ?, ?, 'Return', 'IN', 'direct_invoices', ?, ?, ?, ?, ?, 'Direct invoice cancellation', ?)
          `).run(
            item.item_id,
            item.batch_id,
            item.warehouse_id,
            invoiceId,
            item.quantity,
            item.cost_price,
            invItem.average_cost,
            newQty,
            userId
          );
        }
      }

      // 2. Reverse accounting ledger lines
      if (invoice.voucher_id) {
        this.postingEngine.deleteVoucher(companyId, invoice.voucher_id);
      }
      if (invoice.cogs_voucher_id) {
        this.postingEngine.deleteVoucher(companyId, invoice.cogs_voucher_id);
      }

      // 3. Mark status as CANCELLED
      this.db.prepare("UPDATE direct_invoices SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(invoiceId);

      return true;
    })();
  }
}
