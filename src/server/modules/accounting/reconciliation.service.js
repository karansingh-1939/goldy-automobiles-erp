function roundMoney(val) {
  return Math.round(val * 100) / 100;
}

/**
 * Service to execute system-wide data integrity and accounting checks.
 * Detects discrepancies between document statuses, ledger balances, and allocation audit trails.
 */
export class ReconciliationService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Run all reconciliation checks.
   * @returns {object} Audit report listing any discrepancies
   */
  runReconciliation(companyId = 1) {
    const ledgerDiscrepancies = this.checkLedgerBalances(companyId);
    const allocationDiscrepancies = this.checkAllocationIntegrity(companyId);
    const tbBalanced = this.checkTrialBalanceBalanced(companyId);

    const inventoryDiscrepancies = this.checkInventoryStockIntegrity();
    const returnDiscrepancies = this.checkReturnLimitsIntegrity(companyId);

    const isHealthy =
      ledgerDiscrepancies.length === 0 &&
      allocationDiscrepancies.length === 0 &&
      tbBalanced.isBalanced &&
      inventoryDiscrepancies.length === 0 &&
      returnDiscrepancies.length === 0;

    return {
      timestamp: new Date().toISOString(),
      companyId,
      isHealthy,
      checks: {
        ledgers: {
          passed: ledgerDiscrepancies.length === 0,
          discrepancies: ledgerDiscrepancies,
        },
        allocations: {
          passed: allocationDiscrepancies.length === 0,
          discrepancies: allocationDiscrepancies,
        },
        inventory: {
          passed: inventoryDiscrepancies.length === 0,
          discrepancies: inventoryDiscrepancies,
        },
        returns: {
          passed: returnDiscrepancies.length === 0,
          discrepancies: returnDiscrepancies,
        },
        trialBalance: tbBalanced,
      },
    };
  }

  /**
   * Verifies that cached ledger_balances match the sum of detailed journal entries.
   */
  checkLedgerBalances(companyId) {
    const discrepancies = [];

    // Fetch all ledgers and their running balances
    const ledgers = this.db
      .prepare('SELECT id, name, opening_balance, nature FROM ledgers WHERE company_id = ?')
      .all(companyId);

    for (const l of ledgers) {
      // Sum CGST/SGST/Debit/Credit journal entries
      const summary = this.db
        .prepare(
          `
        SELECT 
          COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) AS debits,
          COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) AS credits
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id AND v.company_id = ? AND v.status <> 'CANCELLED'
        WHERE je.ledger_id = ?
      `,
        )
        .get(companyId, l.id);

      let calculated = l.opening_balance;
      if (l.nature === 'Debit') {
        calculated += summary.debits - summary.credits;
      } else {
        calculated += summary.credits - summary.debits;
      }
      calculated = roundMoney(calculated);

      // Fetch cached balance
      const cachedRow = this.db
        .prepare(
          'SELECT running_balance FROM ledger_balances WHERE company_id = ? AND ledger_id = ?',
        )
        .get(companyId, l.id);
      const cached = cachedRow ? roundMoney(cachedRow.running_balance) : 0;

      if (Math.abs(calculated - cached) > 0.01) {
        discrepancies.push({
          ledgerId: l.id,
          ledgerName: l.name,
          expectedBalance: calculated,
          cachedBalance: cached,
          discrepancy: roundMoney(calculated - cached),
        });
      }
    }

    return discrepancies;
  }

  /**
   * Verifies that customer receipts and invoice amount_paid figures match receipt_allocations entries,
   * and verifies that supplier payments and purchase_bill amount_paid figures match supplier_allocations.
   */
  checkAllocationIntegrity(companyId) {
    const discrepancies = [];

    // 1. Verify customer receipts unallocated balances
    const receipts = this.db
      .prepare(
        "SELECT id, receipt_number, amount, unallocated_amount FROM customer_receipts WHERE company_id = ? AND status = 'ACTIVE'",
      )
      .all(companyId);
    for (const r of receipts) {
      const allocatedSum = this.db
        .prepare(
          'SELECT COALESCE(SUM(allocated_amount), 0) AS total FROM receipt_allocations WHERE customer_receipt_id = ?',
        )
        .get(r.id).total;
      const calculatedUnallocated = roundMoney(r.amount - allocatedSum);

      if (Math.abs(calculatedUnallocated - r.unallocated_amount) > 0.01) {
        discrepancies.push({
          type: 'customer_receipt',
          id: r.id,
          number: r.receipt_number,
          message: `Unallocated balance mismatch. Document unallocated: ${r.unallocated_amount}, calculated: ${calculatedUnallocated}.`,
        });
      }
    }

    // 2. Verify direct invoice amount_paid balances
    const directInvoices = this.db
      .prepare(
        "SELECT id, invoice_number, grand_total, amount_paid FROM direct_invoices WHERE company_id = ? AND status <> 'CANCELLED'",
      )
      .all(companyId);
    for (const di of directInvoices) {
      const allocatedSum = this.db
        .prepare(
          "SELECT COALESCE(SUM(allocated_amount), 0) AS total FROM receipt_allocations WHERE document_type = 'direct_invoice' AND document_id = ?",
        )
        .get(di.id).total;
      if (Math.abs(roundMoney(allocatedSum) - di.amount_paid) > 0.01) {
        discrepancies.push({
          type: 'direct_invoice',
          id: di.id,
          number: di.invoice_number,
          message: `Amount paid mismatch. Document paid: ${di.amount_paid}, allocations sum: ${allocatedSum}.`,
        });
      }
    }

    // 3. Verify job card invoices amount_paid balances
    const invoices = this.db
      .prepare(
        "SELECT id, invoice_number, grand_total, amount_paid FROM invoices WHERE status = 'FINALIZED'",
      )
      .all();
    for (const inv of invoices) {
      const allocatedSum = this.db
        .prepare(
          "SELECT COALESCE(SUM(allocated_amount), 0) AS total FROM receipt_allocations WHERE document_type = 'job_card_invoice' AND document_id = ?",
        )
        .get(inv.id).total;
      if (Math.abs(roundMoney(allocatedSum) - inv.amount_paid) > 0.01) {
        discrepancies.push({
          type: 'job_card_invoice',
          id: inv.id,
          number: inv.invoice_number,
          message: `Amount paid mismatch. Invoice paid: ${inv.amount_paid}, allocations sum: ${allocatedSum}.`,
        });
      }
    }

    // 4. Verify supplier payments unallocated balances (New in Sprint 4)
    const payments = this.db
      .prepare(
        "SELECT id, payment_number, amount, unallocated_amount FROM supplier_payments WHERE company_id = ? AND status = 'ACTIVE'",
      )
      .all(companyId);
    for (const p of payments) {
      const allocatedSum = this.db
        .prepare(
          'SELECT COALESCE(SUM(allocated_amount), 0) AS total FROM supplier_allocations WHERE supplier_payment_id = ?',
        )
        .get(p.id).total;
      const calculatedUnallocated = roundMoney(p.amount - allocatedSum);

      if (Math.abs(calculatedUnallocated - p.unallocated_amount) > 0.01) {
        discrepancies.push({
          type: 'supplier_payment',
          id: p.id,
          number: p.payment_number,
          message: `Unallocated balance mismatch. Document unallocated: ${p.unallocated_amount}, calculated: ${calculatedUnallocated}.`,
        });
      }
    }

    // 5. Verify purchase bills amount_paid balances (New in Sprint 4)
    const purchaseBills = this.db
      .prepare(
        "SELECT id, bill_number, grand_total, amount_paid FROM purchase_bills WHERE company_id = ? AND status <> 'CANCELLED'",
      )
      .all(companyId);
    for (const pb of purchaseBills) {
      const allocatedSum = this.db
        .prepare(
          "SELECT COALESCE(SUM(allocated_amount), 0) AS total FROM supplier_allocations WHERE document_type = 'purchase_bill' AND document_id = ?",
        )
        .get(pb.id).total;
      if (Math.abs(roundMoney(allocatedSum) - pb.amount_paid) > 0.01) {
        discrepancies.push({
          type: 'purchase_bill',
          id: pb.id,
          number: pb.bill_number,
          message: `Amount paid mismatch. Document paid: ${pb.amount_paid}, allocations sum: ${allocatedSum}.`,
        });
      }
    }

    return discrepancies;
  }

  /**
   * Verifies that the net sum of all ledgers is 0 (double-entry Trial Balance balance checks).
   */
  checkTrialBalanceBalanced(companyId) {
    const summary = this.db
      .prepare(
        `
      SELECT 
        COALESCE(SUM(CASE WHEN je.entry_type = 'DEBIT' THEN je.amount ELSE 0 END), 0) AS debits,
        COALESCE(SUM(CASE WHEN je.entry_type = 'CREDIT' THEN je.amount ELSE 0 END), 0) AS credits
      FROM journal_entries je
      JOIN vouchers v ON je.voucher_id = v.id AND v.company_id = ? AND v.status <> 'CANCELLED'
    `,
      )
      .get(companyId);

    const debits = roundMoney(summary.debits);
    const credits = roundMoney(summary.credits);
    const diff = roundMoney(Math.abs(debits - credits));

    return {
      debits,
      credits,
      isBalanced: diff < 0.01,
      difference: diff,
    };
  }

  /**
   * Re-calculates and repairs cached ledger balances in ledger_balances.
   */
  repairLedgerBalances(companyId) {
    this.db.transaction(() => {
      // Clear cache
      this.db.prepare('DELETE FROM ledger_balances WHERE company_id = ?').run(companyId);

      const ledgers = this.db
        .prepare('SELECT id, opening_balance, nature FROM ledgers WHERE company_id = ?')
        .all(companyId);

      for (const l of ledgers) {
        const summary = this.db
          .prepare(
            `
          SELECT 
            COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN je.amount ELSE 0 END), 0) AS debits,
            COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN je.amount ELSE 0 END), 0) AS credits
          FROM journal_entries je
          JOIN vouchers v ON je.voucher_id = v.id AND v.company_id = ? AND v.status <> 'CANCELLED'
          WHERE je.ledger_id = ?
        `,
          )
          .get(companyId, l.id);

        let calculated = l.opening_balance;
        if (l.nature === 'Debit') {
          calculated += summary.debits - summary.credits;
        } else {
          calculated += summary.credits - summary.debits;
        }
        calculated = roundMoney(calculated);

        this.db
          .prepare(
            `
          INSERT INTO ledger_balances (company_id, ledger_id, running_balance)
          VALUES (?, ?, ?)
        `,
          )
          .run(companyId, l.id, calculated);
      }
    })();
  }

  checkInventoryStockIntegrity() {
    const discrepancies = [];
    const items = this.db
      .prepare('SELECT id, sku, item_name, current_quantity FROM inventory_items')
      .all();
    for (const item of items) {
      const batchSum = this.db
        .prepare(
          'SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory_batches WHERE item_id = ?',
        )
        .get(item.id).total;
      if (Math.abs(Number(item.current_quantity) - Number(batchSum)) > 0.001) {
        discrepancies.push({
          itemId: item.id,
          sku: item.sku,
          itemName: item.item_name,
          currentQuantity: item.current_quantity,
          batchQuantitySum: batchSum,
          discrepancy: Math.round((Number(item.current_quantity) - Number(batchSum)) * 100) / 100,
        });
      }
    }
    return discrepancies;
  }

  checkReturnLimitsIntegrity(companyId) {
    const discrepancies = [];
    const rows = this.db
      .prepare(
        `
      SELECT 
        ri.item_id,
        ri.customer_return_id,
        r.invoice_id,
        r.return_number,
        item.sku,
        SUM(ri.quantity) AS total_returned,
        ii.quantity AS original_quantity
      FROM customer_return_items ri
      JOIN customer_returns r ON ri.customer_return_id = r.id
      JOIN inventory_items item ON ri.item_id = item.id
      JOIN invoice_items ii ON r.invoice_id = ii.invoice_id AND ri.item_id = ii.inventory_item_id
      WHERE r.company_id = ? AND r.status <> 'CANCELLED'
      GROUP BY r.invoice_id, ri.item_id
    `,
      )
      .all(companyId);

    for (const row of rows) {
      if (Number(row.total_returned) > Number(row.original_quantity)) {
        discrepancies.push({
          invoiceId: row.invoice_id,
          itemId: row.item_id,
          sku: row.sku,
          totalReturned: row.total_returned,
          originalQuantity: row.original_quantity,
          discrepancy:
            Math.round((Number(row.total_returned) - Number(row.original_quantity)) * 100) / 100,
        });
      }
    }
    return discrepancies;
  }
}
