-- Delete orphaned inventory transactions referencing deleted/purged batches
DELETE FROM inventory_transactions 
WHERE batch_id NOT IN (SELECT id FROM inventory_batches) 
  AND batch_id IS NOT NULL;
