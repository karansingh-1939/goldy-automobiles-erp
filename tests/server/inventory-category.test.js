import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './helpers.js';
import { createInventoryService } from '../../src/server/modules/inventory/inventory.service.js';

test('inventory category filtering applies before pagination and combines with search', async () => {
  const context = await createTestContext();
  try {
    const service = createInventoryService(context.db);
    const categories = context.db
      .prepare('SELECT id FROM inventory_categories ORDER BY id LIMIT 2')
      .all();
    assert.equal(categories.length, 2);
    service.createItem({
      sku: 'CAT-A1',
      item_name: 'Shared oil A',
      category_id: categories[0].id,
      purchase_cost: 10,
      selling_price: 20,
    });
    service.createItem({
      sku: 'CAT-A2',
      item_name: 'Shared oil B',
      category_id: categories[0].id,
      purchase_cost: 10,
      selling_price: 20,
    });
    service.createItem({
      sku: 'CAT-B1',
      item_name: 'Shared oil C',
      category_id: categories[1].id,
      purchase_cost: 10,
      selling_price: 20,
    });
    const first = service.listItems({
      category_id: String(categories[0].id),
      search: 'Shared oil',
      pageSize: '1',
    });
    assert.equal(first.pagination.total, 2);
    assert.equal(first.pagination.totalPages, 2);
    assert.equal(first.data.length, 1);
    assert.equal(first.data[0].category_id, categories[0].id);
    const second = service.listItems({
      category_id: String(categories[0].id),
      search: 'Shared oil',
      pageSize: '1',
      page: '2',
    });
    assert.notEqual(second.data[0].id, first.data[0].id);
    const noMatch = service.listItems({
      category_id: String(categories[1].id),
      search: 'Shared oil A',
    });
    assert.equal(noMatch.pagination.total, 0);
    for (const value of ['abc', '1x', '-1', '1.5', '0'])
      assert.throws(
        () => service.listItems({ category_id: value }),
        /Category must be a positive integer/,
      );
  } finally {
    await context.close();
  }
});
