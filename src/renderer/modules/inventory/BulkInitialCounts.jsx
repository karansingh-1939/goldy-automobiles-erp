import React, { useState } from 'react';
import {
  Field,
  Notice,
  Register,
  columnsFor,
  buttonClass,
  useInventoryMutation,
} from './inventory-ui.jsx';
export default function BulkInitialCounts() {
  const [counts, setCounts] = useState({});
  const save = useInventoryMutation('/api/v1/inventory/bulk-save', () => setCounts({}));
  const entries = Object.entries(counts);
  return (
    <div className="space-y-3">
      <p>
        Initial setup counts compare total item stock and post changes in the default warehouse (ID
        1). For routine counts in another godown, use stock verification. Edits remain selected
        across pages.
      </p>
      <Register
        endpoint="/api/v1/inventory/items"
        search
        columns={[
          ...columnsFor(['sku', 'item_name', 'category_name', 'current_quantity']),
          {
            id: 'count',
            header: 'Physical count',
            cell: (info) => {
              const row = info.row.original;
              return (
                <Field
                  label={`Count ${row.sku}`}
                  type="number"
                  min="0"
                  step="any"
                  value={counts[row.id] ?? ''}
                  placeholder={String(row.current_quantity)}
                  onChange={(e) => setCounts({ ...counts, [row.id]: e.target.value })}
                />
              );
            },
          },
        ]}
      />
      <button
        className={buttonClass}
        disabled={
          save.isPending ||
          !entries.length ||
          entries.some(
            ([, value]) => value === '' || !Number.isFinite(Number(value)) || Number(value) < 0,
          )
        }
        onClick={() =>
          save.mutate({
            items: entries.map(([id, quantity]) => ({
              itemId: Number(id),
              quantity: Number(quantity),
            })),
          })
        }
      >
        Save {entries.length} initial counts
      </button>
      <Notice error={save.error} message={save.message} />
    </div>
  );
}
