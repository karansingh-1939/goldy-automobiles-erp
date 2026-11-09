// Stock writes affect registers and the selectors cached by other workshop screens.
export function invalidateInventory(client) {
  return Promise.all(
    [
      'inventory',
      'inventory-items',
      'item-batches',
      'job-part-batches',
      '/api/v1/inventory/items',
      'dashboard-inventory',
    ].map((key) => client.invalidateQueries({ queryKey: [key] })),
  );
}
