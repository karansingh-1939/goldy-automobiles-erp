import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import DataTable from '../../shared/components/DataTable.jsx';
import InventoryItemForm from './InventoryItemForm.jsx';
import { Register, RecordSelect, columnsFor, buttonClass } from './inventory-ui.jsx';

export default function InventoryCatalog() {
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [category, setCategory] = useState('');
  const { hasPermission } = usePermissions();
  const batches = useQuery({
    queryKey: ['item-batches', selected?.id],
    queryFn: ({ signal }) => api.get(`/api/v1/inventory/items/${selected.id}/batches`, { signal }),
    enabled: !!selected,
  });
  return (
    <div className="space-y-5">
      <div className="flex justify-between">
        <h2 className="text-lg font-bold">Items registry</h2>
        {hasPermission('inventory.write') && (
          <button
            className={buttonClass}
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            Add item
          </button>
        )}
      </div>
      {showForm && (
        <InventoryItemForm
          key={editing?.id || 'new'}
          item={editing}
          onClose={() => setShowForm(false)}
        />
      )}
      <RecordSelect
        label="Filter category"
        endpoint="/api/v1/inventory-categories"
        required={false}
        value={category}
        onChange={setCategory}
      />
      <Register
        key={category}
        endpoint="/api/v1/inventory/items"
        params={{ category_id: category }}
        search
        onRowClick={setSelected}
        columns={[
          ...columnsFor([
            'sku',
            'item_name',
            'category_name',
            'purchase_cost',
            'selling_price',
            'current_quantity',
            'reorder_level',
            'is_active',
          ]),
          {
            id: 'edit',
            header: 'Actions',
            cell: (info) =>
              hasPermission('inventory.write') ? (
                <button
                  className={buttonClass}
                  aria-label={`Edit ${info.row.original.item_name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(info.row.original);
                    setShowForm(true);
                  }}
                >
                  Edit
                </button>
              ) : null,
          },
        ]}
      />
      {selected && (
        <section className="space-y-3">
          <h3 className="font-semibold">Batches: {selected.item_name}</h3>
          <DataTable
            data={batches.data?.data || []}
            isLoading={batches.isLoading}
            error={batches.error}
            columns={columnsFor([
              'batch_number',
              'warehouse_name',
              'supplier_name',
              'quantity',
              'purchase_cost',
              'selling_price',
              'manufacture_date',
              'expiry_date',
            ])}
            emptyStateMessage="No batches. Add opening stock or receive a purchase."
          />
          <button className={buttonClass} onClick={() => setSelected(null)}>
            Close batches
          </button>
        </section>
      )}
    </div>
  );
}
