ALTER TABLE quotations ADD COLUMN tax_type TEXT NOT NULL DEFAULT 'EXCLUSIVE' CHECK (tax_type IN ('EXCLUSIVE', 'INCLUSIVE'));
ALTER TABLE sales_orders ADD COLUMN tax_type TEXT NOT NULL DEFAULT 'EXCLUSIVE' CHECK (tax_type IN ('EXCLUSIVE', 'INCLUSIVE'));

-- Recover inclusive pricing only where stored line totals prove the basis.
-- Existing prices, invoices and accounting entries remain unchanged.
UPDATE quotations SET tax_type = 'INCLUSIVE'
WHERE EXISTS (SELECT 1 FROM quotation_items i WHERE i.quotation_id = quotations.id AND i.gst_amount > 0
  AND ABS(i.line_total - MAX(0, i.quantity * i.unit_price - i.discount_amount)) < 0.011)
AND NOT EXISTS (SELECT 1 FROM quotation_items i WHERE i.quotation_id = quotations.id
  AND ABS(i.line_total - MAX(0, i.quantity * i.unit_price - i.discount_amount)) >= 0.011);

UPDATE sales_orders SET tax_type = 'INCLUSIVE'
WHERE EXISTS (SELECT 1 FROM sales_order_items i WHERE i.sales_order_id = sales_orders.id AND i.gst_amount > 0
  AND ABS(i.line_total - MAX(0, i.quantity * i.unit_price - i.discount_amount)) < 0.011)
AND NOT EXISTS (SELECT 1 FROM sales_order_items i WHERE i.sales_order_id = sales_orders.id
  AND ABS(i.line_total - MAX(0, i.quantity * i.unit_price - i.discount_amount)) >= 0.011);
