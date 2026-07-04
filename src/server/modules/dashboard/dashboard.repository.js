export class DashboardRepository {
  constructor(db) {
    this.db = db;
  }

  getOperationsMetrics(todayDate) {
    const openJobCards = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM job_cards
      WHERE status = 'DRAFT'
    `).get().count;

    const completedJobCards = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM job_cards
      WHERE status = 'COMPLETED'
    `).get().count;

    const vehiclesServicedToday = this.db.prepare(`
      SELECT COUNT(DISTINCT vehicle_id) AS count
      FROM job_cards
      WHERE status = 'COMPLETED'
        AND DATE(closed_at) = DATE(?)
    `).get(todayDate).count;

    const todayJobCardsCount = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM job_cards
      WHERE DATE(opened_at) = DATE(?)
    `).get(todayDate).count;

    const pendingDeliveriesCount = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM job_cards
      WHERE status = 'DRAFT' AND promised_delivery_at IS NOT NULL
    `).get().count;

    return {
      openJobCards,
      completedJobCards,
      vehiclesServicedToday,
      todayJobCardsCount,
      pendingDeliveriesCount,
    };
  }

  getTotalItemCount() {
    return this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM inventory_items
      WHERE is_active = 1
    `).get().count;
  }

  getWarehouseStockSummary() {
    return this.db.prepare(`
      SELECT 
        warehouses.id AS warehouseId,
        warehouses.name AS warehouseName,
        warehouses.code AS warehouseCode,
        COALESCE(SUM(inventory_batches.quantity), 0) AS totalQuantity,
        ROUND(COALESCE(SUM(inventory_batches.quantity * inventory_batches.purchase_cost), 0), 2) AS totalValue
      FROM warehouses
      LEFT JOIN inventory_batches ON inventory_batches.warehouse_id = warehouses.id
      WHERE warehouses.is_active = 1
      GROUP BY warehouses.id, warehouses.name, warehouses.code
      ORDER BY warehouses.name
    `).all();
  }

  getSalesSummary(dateFrom, dateTo) {
    return this.db.prepare(`
      SELECT 
        COUNT(*) AS count,
        COALESCE(SUM(grand_total), 0) AS totalAmount
      FROM invoices
      WHERE status = 'FINALIZED'
        AND DATE(invoice_date) >= DATE(?)
        AND DATE(invoice_date) <= DATE(?)
    `).get(dateFrom, dateTo);
  }

  getRecentSales(limit) {
    return this.db.prepare(`
      SELECT 
        invoices.id,
        invoices.invoice_number AS invoiceNumber,
        invoices.invoice_date AS invoiceDate,
        invoices.grand_total AS grandTotal,
        customers.name AS customerName
      FROM invoices
      JOIN customers ON customers.id = invoices.customer_id
      WHERE invoices.status = 'FINALIZED'
      ORDER BY invoices.invoice_date DESC, invoices.id DESC
      LIMIT ?
    `).all(limit);
  }

  getTopServices(limit) {
    return this.db.prepare(`
      SELECT 
        TRIM(description) AS description,
        COUNT(*) AS count,
        SUM(quantity) AS totalQuantity,
        ROUND(SUM(line_revenue), 2) AS totalRevenue
      FROM invoice_items
      JOIN invoices ON invoices.id = invoice_items.invoice_id
      WHERE invoices.status = 'FINALIZED'
        AND invoice_items.item_type IN ('LABOR', 'SERVICE', 'OUTSIDE_JOB')
      GROUP BY TRIM(description)
      ORDER BY count DESC, totalRevenue DESC
      LIMIT ?
    `).all(limit);
  }

  getRevenueByCategory(dateFrom, dateTo) {
    return this.db.prepare(`
      SELECT 
        item_type AS category,
        ROUND(SUM(line_revenue), 2) AS revenue
      FROM invoice_items
      JOIN invoices ON invoices.id = invoice_items.invoice_id
      WHERE invoices.status = 'FINALIZED'
        AND DATE(invoices.invoice_date) >= DATE(?)
        AND DATE(invoices.invoice_date) <= DATE(?)
      GROUP BY item_type
      ORDER BY revenue DESC
    `).all(dateFrom, dateTo);
  }
}
