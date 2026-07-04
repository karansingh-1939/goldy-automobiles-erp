-- Set supplier_id to NULL on items referencing invalid suppliers
UPDATE inventory_items 
SET supplier_id = NULL 
WHERE supplier_id NOT IN (SELECT id FROM suppliers) 
  AND supplier_id IS NOT NULL;

-- Delete orphaned test adjustments, transfers, and purchase orders
DELETE FROM stock_adjustments 
WHERE batch_id NOT IN (SELECT id FROM inventory_batches) 
  AND batch_id IS NOT NULL;

DELETE FROM stock_transfers 
WHERE batch_id NOT IN (SELECT id FROM inventory_batches) 
  AND batch_id IS NOT NULL;

DELETE FROM purchase_orders 
WHERE supplier_id NOT IN (SELECT id FROM suppliers);
