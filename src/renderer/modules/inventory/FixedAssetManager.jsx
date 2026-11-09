import React, { useState } from 'react';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import { localDate } from '../../../../public/local-date.js';
import {
  Field,
  RecordSelect,
  Notice,
  Register,
  columnsFor,
  buttonClass,
  useInventoryMutation,
} from './inventory-ui.jsx';

const empty = () => ({
  asset_name: '',
  sku: '',
  category: 'Equipment',
  supplier_id: '',
  invoice_number: '',
  purchase_date: localDate(),
  purchase_cost: '',
  gst_amount: '0',
  serial_number: '',
  warranty_info: '',
  notes: '',
});
export default function FixedAssetManager() {
  const [form, setForm] = useState(empty);
  const { hasPermission } = usePermissions();
  const save = useInventoryMutation('/api/v1/inventory/assets', () => setForm(empty()));
  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const fields = [
    ['asset_name', 'Asset name'],
    ['sku', 'Asset SKU'],
    ['category', 'Asset category'],
    ['invoice_number', 'Invoice number'],
    ['purchase_date', 'Purchase date', 'date'],
    ['purchase_cost', 'Purchase cost', 'number'],
    ['gst_amount', 'GST amount', 'number'],
    ['serial_number', 'Serial number'],
    ['warranty_info', 'Warranty information'],
    ['notes', 'Asset notes'],
  ];
  return (
    <section className="p-6 space-y-5">
      <h1 className="text-xl font-bold">Fixed assets</h1>
      <p>Register workshop equipment separately from stock sold to customers.</p>
      {hasPermission('inventory.write') && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              ...form,
              supplier_id: Number(form.supplier_id),
              purchase_cost: Number(form.purchase_cost),
              gst_amount: Number(form.gst_amount),
            });
          }}
        >
          <fieldset disabled={save.isPending} className="grid gap-4 md:grid-cols-3">
            {fields.map(([key, label, type = 'text']) => (
              <Field
                key={key}
                label={label}
                type={type}
                min={type === 'number' ? 0 : undefined}
                step={type === 'number' ? '0.01' : undefined}
                required={[
                  'asset_name',
                  'sku',
                  'invoice_number',
                  'purchase_date',
                  'purchase_cost',
                ].includes(key)}
                value={form[key]}
                onChange={update(key)}
              />
            ))}
            <RecordSelect
              label="Supplier"
              endpoint="/api/v1/suppliers"
              value={form.supplier_id}
              onChange={(value) => setForm({ ...form, supplier_id: value })}
            />
          </fieldset>
          <button className={buttonClass} disabled={save.isPending}>
            Register asset
          </button>
          <Notice error={save.error} message={save.message} />
        </form>
      )}
      <Register
        endpoint="/api/v1/inventory/assets"
        search
        columns={[
          ...columnsFor([
            'sku',
            'asset_name',
            'category',
            'supplier_name',
            'invoice_number',
            'purchase_date',
            'purchase_cost',
            'gst_amount',
          ]),
          {
            id: 'total',
            header: 'Total cost',
            cell: (info) =>
              (
                Number(info.row.original.purchase_cost) + Number(info.row.original.gst_amount)
              ).toFixed(2),
          },
          ...columnsFor(['serial_number', 'warranty_info', 'status', 'notes']),
        ]}
        emptyStateMessage="No fixed assets registered."
      />
    </section>
  );
}
