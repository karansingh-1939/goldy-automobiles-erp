import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { invalidateInventory } from '../../shared/api/inventory-cache.js';
import { Field, RecordSelect, Notice, buttonClass } from './inventory-ui.jsx';

const defaults = {
  sku: '',
  item_name: '',
  barcode: '',
  hsn_code: '',
  category_id: '',
  supplier_id: '',
  purchase_cost: '',
  selling_price: '',
  reorder_level: 5,
  gst_rate: 18,
  unit_of_measure: 'pcs',
  warranty_period_months: 0,
  is_active: true,
};
export default function InventoryItemForm({ item, onClose }) {
  const [form, setForm] = useState({ ...defaults, ...item });
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        itemName: form.item_name,
        sku: form.sku || undefined,
        category_id: form.category_id ? Number(form.category_id) : null,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
      };
      for (const key of [
        'purchase_cost',
        'selling_price',
        'reorder_level',
        'gst_rate',
        'warranty_period_months',
      ])
        payload[key] = Number(form[key]);
      return item
        ? api.patch(`/api/v1/inventory/items/${item.id}`, payload)
        : api.post('/api/v1/inventory/items', payload);
    },
    onSuccess: () => {
      invalidateInventory(client);
      onClose();
    },
  });
  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return (
    <section className="rounded-lg border border-gray-300 p-4 dark:border-gray-700 space-y-3">
      <h2 className="text-lg font-bold">{item ? 'Edit item' : 'Add item'}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-4"
      >
        <fieldset disabled={save.isPending} className="grid gap-4 md:grid-cols-3">
          <Field
            label="SKU"
            value={form.sku}
            onChange={update('sku')}
            placeholder="Generated if blank"
          />
          <Field label="Item name" required value={form.item_name} onChange={update('item_name')} />
          <Field label="Barcode" value={form.barcode ?? ''} onChange={update('barcode')} />
          <Field label="HSN code" value={form.hsn_code ?? ''} onChange={update('hsn_code')} />
          <RecordSelect
            label="Category"
            endpoint="/api/v1/inventory-categories"
            required={false}
            value={form.category_id ?? ''}
            onChange={(value) => setForm({ ...form, category_id: value })}
          />
          <RecordSelect
            label="Supplier"
            endpoint="/api/v1/suppliers"
            required={false}
            value={form.supplier_id ?? ''}
            onChange={(value) => setForm({ ...form, supplier_id: value })}
          />
          <Field
            label="Purchase cost"
            type="number"
            min="0"
            step="0.01"
            required
            value={form.purchase_cost}
            onChange={update('purchase_cost')}
          />
          <Field
            label="Selling price"
            type="number"
            min="0"
            step="0.01"
            required
            value={form.selling_price}
            onChange={update('selling_price')}
          />
          <Field
            label="Minimum stock"
            inputMode="decimal"
            pattern="[0-9]+(\.[0-9]+)?"
            required
            value={form.reorder_level}
            onChange={update('reorder_level')}
          />
          <Field
            label="GST rate"
            inputMode="decimal"
            required
            value={form.gst_rate}
            onChange={update('gst_rate')}
          />
          <Field
            label="Unit"
            required
            value={form.unit_of_measure}
            onChange={update('unit_of_measure')}
          />
          <Field
            label="Warranty months"
            inputMode="numeric"
            value={form.warranty_period_months}
            onChange={update('warranty_period_months')}
          />
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={!!form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Active item
          </label>
        </fieldset>
        <Notice error={save.error} />
        <div className="flex gap-2">
          <button className={buttonClass} disabled={save.isPending}>
            Save item
          </button>
          <button type="button" className={buttonClass} disabled={save.isPending} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
      <p className="text-sm">
        After saving a new item, use Stock operations to enter its opening quantity and warehouse.
      </p>
    </section>
  );
}
