import React, { useState } from 'react';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import {
  Field,
  RecordSelect,
  Notice,
  buttonClass,
  inputClass,
  useInventoryMutation,
} from './inventory-ui.jsx';
import BulkInitialCounts from './BulkInitialCounts.jsx';

const defaults = {
  item_id: '',
  warehouse_id: '',
  to_warehouse_id: '',
  supplier_id: '',
  batch_id: '',
  batch_number: '',
  quantity: '',
  unit_cost: '0',
  manufacture_date: '',
  expiry_date: '',
  reason: '',
  adjustment_type: 'IN',
  category: 'NORMAL',
};
export default function StockOperations() {
  const [mode, setMode] = useState('opening-stock');
  const [form, setForm] = useState(defaults);
  const { hasPermission } = usePermissions();
  const save = useInventoryMutation(`/api/v1/inventory/${mode}`, () => setForm(defaults));
  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  if (!hasPermission('inventory.adjust'))
    return <p>Stock changes require inventory adjustment permission.</p>;
  const submit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      item_id: Number(form.item_id),
      warehouse_id: Number(form.warehouse_id),
      supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
      batch_id: form.batch_id ? Number(form.batch_id) : null,
      quantity: Number(form.quantity),
      unit_cost: Number(form.unit_cost),
    };
    if (mode === 'transfers') {
      payload.from_warehouse_id = payload.warehouse_id;
      payload.to_warehouse_id = Number(form.to_warehouse_id);
    }
    save.mutate(payload);
  };
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold">Stock operations</h2>
      <label className="block">
        Operation
        <select
          aria-label="Stock operation"
          className={inputClass}
          value={mode}
          onChange={(e) => {
            setMode(e.target.value);
            setForm(defaults);
            save.reset();
          }}
        >
          <option value="opening-stock">Opening stock</option>
          <option value="adjustments">Stock adjustment</option>
          <option value="transfers">Warehouse transfer</option>
          <option value="bulk">Bulk initial counts</option>
        </select>
      </label>
      {mode === 'bulk' ? (
        <BulkInitialCounts />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={save.isPending} className="grid gap-4 md:grid-cols-3">
            <RecordSelect
              label="Item"
              endpoint="/api/v1/inventory/items"
              value={form.item_id}
              onChange={(value) => setForm({ ...form, item_id: value, batch_id: '' })}
              optionLabel={(row) => `${row.sku} — ${row.item_name}`}
            />
            <RecordSelect
              label="Warehouse"
              endpoint="/api/v1/warehouses"
              value={form.warehouse_id}
              onChange={(value) => setForm({ ...form, warehouse_id: value, batch_id: '' })}
            />
            {mode === 'transfers' && (
              <RecordSelect
                label="Destination warehouse"
                endpoint="/api/v1/warehouses"
                value={form.to_warehouse_id}
                onChange={(value) => setForm({ ...form, to_warehouse_id: value })}
              />
            )}
            {mode === 'opening-stock' && (
              <RecordSelect
                label="Supplier"
                endpoint="/api/v1/suppliers"
                required={false}
                value={form.supplier_id}
                onChange={(value) => setForm({ ...form, supplier_id: value })}
              />
            )}
            <Field
              label="Quantity"
              type="number"
              min="0.000001"
              step="any"
              required
              value={form.quantity}
              onChange={update('quantity')}
            />
            {mode !== 'transfers' && (
              <Field
                label="Unit cost"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.unit_cost}
                onChange={update('unit_cost')}
              />
            )}
            {mode === 'opening-stock' ? (
              <>
                <Field
                  label="Batch number"
                  value={form.batch_number}
                  onChange={update('batch_number')}
                />
                <Field
                  label="Manufacture date"
                  type="date"
                  value={form.manufacture_date}
                  onChange={update('manufacture_date')}
                />
                <Field
                  label="Expiry date"
                  type="date"
                  value={form.expiry_date}
                  onChange={update('expiry_date')}
                />
              </>
            ) : (
              <RecordSelect
                label="Batch (optional, otherwise FIFO)"
                endpoint="/api/v1/batches"
                value={form.batch_id}
                required={false}
                onChange={(value) => setForm({ ...form, batch_id: value })}
                optionLabel={(row) =>
                  `${row.batch_number} (item ${row.item_id}, warehouse ${row.warehouse_id}, qty ${row.quantity})`
                }
              />
            )}
            {mode === 'adjustments' && (
              <>
                <label>
                  Direction
                  <select
                    className={inputClass}
                    value={form.adjustment_type}
                    onChange={update('adjustment_type')}
                  >
                    <option value="IN">Increase</option>
                    <option value="OUT">Decrease</option>
                  </select>
                </label>
                <label>
                  Reason category
                  <select
                    className={inputClass}
                    value={form.category}
                    onChange={update('category')}
                  >
                    {['NORMAL', 'DAMAGED', 'LOST', 'EXPIRED', 'OPENING_CORRECTION'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <Field
              label="Reason"
              required={mode === 'adjustments'}
              value={form.reason}
              onChange={update('reason')}
            />
          </fieldset>
          <button className={buttonClass} disabled={save.isPending}>
            {mode === 'opening-stock'
              ? 'Post opening stock'
              : mode === 'transfers'
                ? 'Transfer stock'
                : 'Post adjustment'}
          </button>
          <Notice error={save.error} message={save.message} />
        </form>
      )}
    </section>
  );
}
