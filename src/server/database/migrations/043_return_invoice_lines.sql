-- Preserve original return amounts. Link historical lines only when their origin is unique.
ALTER TABLE customer_return_items ADD COLUMN invoice_item_id INTEGER REFERENCES invoice_items(id);
UPDATE customer_return_items AS ri SET invoice_item_id = (
  SELECT MIN(ii.id) FROM invoice_items ii JOIN customer_returns r ON r.invoice_id = ii.invoice_id
  WHERE r.id = ri.customer_return_id AND ii.inventory_item_id = ri.item_id AND ii.batch_id = ri.batch_id
  HAVING COUNT(*) = 1
);
CREATE INDEX idx_customer_return_items_invoice_line ON customer_return_items(invoice_item_id);

ALTER TABLE supplier_return_items ADD COLUMN source_table TEXT;
ALTER TABLE supplier_return_items ADD COLUMN source_item_id INTEGER;
ALTER TABLE supplier_return_items ADD COLUMN cgst_amount REAL;
ALTER TABLE supplier_return_items ADD COLUMN sgst_amount REAL;
ALTER TABLE supplier_return_items ADD COLUMN igst_amount REAL;
CREATE INDEX idx_supplier_return_items_source ON supplier_return_items(source_table, source_item_id);

-- Release historical excess allocations to the original receipts, without reversing cash.
-- Materialize the old amounts before changing any rows.
CREATE TEMP TABLE return_allocation_release AS
WITH paid AS (
  SELECT i.id, MAX(0, i.grand_total - COALESCE((SELECT SUM(total_refund_amount)
    FROM customer_returns WHERE invoice_id=i.id AND status='COMPLETED'),0)) AS net_total,
    i.amount_paid, COALESCE((SELECT SUM(allocated_amount) FROM receipt_allocations
      WHERE document_type='job_card_invoice' AND document_id=i.id),0) AS allocated
  FROM invoices i WHERE i.status='FINALIZED'
), allocation_limits AS (
  SELECT a.id, a.customer_receipt_id, a.document_id, a.allocated_amount,
    MAX(0, p.net_total - MAX(0, p.amount_paid-p.allocated)) AS allowed,
    COALESCE((SELECT SUM(previous.allocated_amount) FROM receipt_allocations previous
      WHERE previous.document_type='job_card_invoice' AND previous.document_id=a.document_id
        AND previous.id<a.id),0) AS prior_allocated
  FROM receipt_allocations a JOIN paid p ON p.id=a.document_id
  WHERE a.document_type='job_card_invoice'
)
SELECT *, ROUND(allocated_amount-MIN(allocated_amount, MAX(0,allowed-prior_allocated)),2) AS released
FROM allocation_limits WHERE allocated_amount>MAX(0,allowed-prior_allocated);

UPDATE customer_receipts SET unallocated_amount=ROUND(unallocated_amount+COALESCE((
  SELECT SUM(released) FROM return_allocation_release WHERE customer_receipt_id=customer_receipts.id),0),2)
WHERE id IN (SELECT customer_receipt_id FROM return_allocation_release);
UPDATE invoices SET amount_paid=ROUND(MAX(0,amount_paid-COALESCE((
  SELECT SUM(released) FROM return_allocation_release WHERE document_id=invoices.id),0)),2)
WHERE id IN (SELECT document_id FROM return_allocation_release);
DELETE FROM receipt_allocations WHERE id IN (
  SELECT id FROM return_allocation_release WHERE released>=allocated_amount);
UPDATE receipt_allocations SET allocated_amount=ROUND(allocated_amount-(
  SELECT released FROM return_allocation_release WHERE id=receipt_allocations.id),2)
WHERE id IN (SELECT id FROM return_allocation_release);
DROP TABLE return_allocation_release;

-- Credits settle documents without changing the original tax invoice or cash received.
UPDATE invoices SET payment_status = CASE
  WHEN amount_paid >= MAX(0, grand_total - COALESCE((SELECT SUM(total_refund_amount)
    FROM customer_returns WHERE invoice_id = invoices.id AND status = 'COMPLETED'), 0)) THEN 'PAID'
  WHEN amount_paid > 0 THEN 'PARTIAL' ELSE 'UNPAID' END
WHERE status = 'FINALIZED';
