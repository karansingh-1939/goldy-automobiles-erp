import { AppError } from '../../shared/errors/app-error.js';

/**
 * Service to manage Supplier Master Registry and AP Ledgers.
 */
export class SupplierService {
  /**
   * @param {object} db - Database connection instance
   * @param {object} postingEngine - Injected PostingEngine instance
   */
  constructor(db, postingEngine) {
    this.db = db;
    this.postingEngine = postingEngine;
  }

  /**
   * Creates a new supplier and initializes their AP ledger.
   */
  createSupplier(companyId, payload) {
    const { name, phone, email, gstin, address, openingBalance = 0 } = payload;
    if (!name) {
      throw new AppError('Supplier name is required.', 400, 'SUPPLIER_NAME_REQUIRED');
    }

    if (gstin && gstin.length !== 15) {
      throw new AppError('GSTIN must be exactly 15 characters.', 400, 'INVALID_GSTIN');
    }

    return this.db.transaction(() => {
      // 1. Insert supplier base record
      const result = this.db
        .prepare(
          `
        INSERT INTO suppliers (name, phone, email, gstin, address, opening_balance)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          name,
          phone || null,
          email || null,
          gstin || null,
          address || null,
          Number(openingBalance),
        );

      const supplierId = result.lastInsertRowid;

      // 2. Instantiate AP ledger
      const ledgerId = this.postingEngine.getOrCreateSupplierLedger(companyId, supplierId);

      // If supplier has opening balance, we can optionally post a journal entry or record it in AP balance cache.
      if (Number(openingBalance) !== 0) {
        this.postingEngine.updateRunningBalance(
          companyId,
          ledgerId,
          'Credit',
          'CREDIT',
          Math.abs(Number(openingBalance)),
        );
      }

      return this.getSupplier(supplierId);
    })();
  }

  /**
   * Retrieves a single supplier by ID.
   */
  getSupplier(id) {
    const supplier = this.db
      .prepare(
        `
      SELECT s.*, l.name AS ledger_name, 
        COALESCE(lb.running_balance, 0) AS current_balance
      FROM suppliers s
      LEFT JOIN ledgers l ON s.ledger_id = l.id
      LEFT JOIN ledger_balances lb ON s.ledger_id = lb.ledger_id
      WHERE s.id = ?
    `,
      )
      .get(id);

    if (!supplier) {
      throw new AppError('Supplier not found.', 404, 'SUPPLIER_NOT_FOUND');
    }

    return supplier;
  }

  /**
   * Lists suppliers with filters.
   */
  listSuppliers(filters = {}) {
    const { search, isActive } = filters;
    let sql = `
      SELECT s.*, COALESCE(lb.running_balance, 0) AS current_balance
      FROM suppliers s
      LEFT JOIN ledger_balances lb ON s.ledger_id = lb.ledger_id
      WHERE 1=1
    `;
    const params = [];

    if (isActive !== undefined) {
      sql += ' AND s.is_active = ?';
      params.push(Number(isActive));
    }

    if (search) {
      sql += ' AND (s.name LIKE ? OR s.phone LIKE ? OR s.email LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY s.name ASC';
    return this.db.prepare(sql).all(...params);
  }

  /**
   * Updates an existing supplier record and synchronizes their AP ledger name.
   */
  updateSupplier(id, payload) {
    const { name, phone, email, gstin, address, isActive } = payload;
    const supplier = this.getSupplier(id);

    if (name === '') {
      throw new AppError('Supplier name cannot be empty.', 400, 'SUPPLIER_NAME_REQUIRED');
    }

    if (gstin && gstin.length !== 15) {
      throw new AppError('GSTIN must be exactly 15 characters.', 400, 'INVALID_GSTIN');
    }

    return this.db.transaction(() => {
      this.db
        .prepare(
          `
        UPDATE suppliers
        SET name = COALESCE(?, name),
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            gstin = COALESCE(?, gstin),
            address = COALESCE(?, address),
            is_active = COALESCE(?, is_active),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        )
        .run(
          name || null,
          phone || null,
          email || null,
          gstin || null,
          address || null,
          isActive !== undefined ? Number(isActive) : null,
          id,
        );

      // If supplier name has changed, rename the general ledger account
      if (name && name !== supplier.name) {
        const newLedgerName = `Supplier: ${name}`;
        this.db
          .prepare('UPDATE ledgers SET name = ? WHERE id = ?')
          .run(newLedgerName, supplier.ledger_id);
      }

      return this.getSupplier(id);
    })();
  }
}
