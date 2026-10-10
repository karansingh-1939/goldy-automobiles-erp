ALTER TABLE direct_invoice_items ADD COLUMN line_cost REAL NOT NULL DEFAULT 0;
UPDATE direct_invoice_items SET line_cost = ROUND(quantity * cost_price, 2);

ALTER TABLE customer_return_items ADD COLUMN cgst_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE customer_return_items ADD COLUMN sgst_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE customer_return_items ADD COLUMN igst_amount REAL NOT NULL DEFAULT 0;

UPDATE customer_return_items AS ri SET
  cgst_amount = COALESCE((SELECT ROUND(SUM(ii.cgst_amount) * ri.quantity / SUM(ii.quantity), 2)
    FROM invoice_items ii JOIN customer_returns r ON r.invoice_id = ii.invoice_id
    WHERE r.id = ri.customer_return_id AND ii.inventory_item_id = ri.item_id AND ii.batch_id IS ri.batch_id), 0),
  sgst_amount = COALESCE((SELECT ROUND(SUM(ii.sgst_amount) * ri.quantity / SUM(ii.quantity), 2)
    FROM invoice_items ii JOIN customer_returns r ON r.invoice_id = ii.invoice_id
    WHERE r.id = ri.customer_return_id AND ii.inventory_item_id = ri.item_id AND ii.batch_id IS ri.batch_id), 0),
  igst_amount = COALESCE((SELECT ROUND(SUM(ii.igst_amount) * ri.quantity / SUM(ii.quantity), 2)
    FROM invoice_items ii JOIN customer_returns r ON r.invoice_id = ii.invoice_id
    WHERE r.id = ri.customer_return_id AND ii.inventory_item_id = ri.item_id AND ii.batch_id IS ri.batch_id), 0);
