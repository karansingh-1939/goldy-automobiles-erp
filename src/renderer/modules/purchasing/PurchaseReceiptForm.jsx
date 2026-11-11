import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { invalidateInventory } from '../../shared/api/inventory-cache.js';
import RemoteSelect from '../../shared/components/RemoteSelect.jsx';
import { localDate } from '../../../../public/local-date.js';

const emptyLine = () => ({
  item_id: '',
  warehouse_id: '',
  batch_number: '',
  quantity: '1',
  purchase_cost: '',
  selling_price: '',
  gst_rate: '18',
  manufacture_date: '',
  expiry_date: '',
});
export default function PurchaseReceiptForm({ onSaved, onCancel }) {
  const client = useQueryClient();
  const [header, setHeader] = useState({
    supplier_id: '',
    receipt_number: '',
    receipt_date: localDate(),
    notes: '',
  });
  const [supplier, setSupplier] = useState(null);
  const [lines, setLines] = useState([emptyLine()]);
  // Pre-select the main godown so the owner rarely has to choose one.
  const warehouses = useQuery({
    queryKey: ['warehouses', 'purchase-default'],
    queryFn: () => api.get('/api/v1/warehouses?page=1&pageSize=50'),
  });
  const warehouseRows = Array.isArray(warehouses.data?.data) ? warehouses.data.data : [];
  const defaultWarehouse =
    warehouseRows.find((row) => Number(row.is_default) === 1) ||
    warehouseRows.find((row) => row.code === 'MAIN') ||
    warehouseRows[0];
  const singleWarehouse = warehouseRows.length === 1;
  const warehouseFor = (line) => line.warehouse_id || defaultWarehouse?.id || '';
  const update = (index, values) =>
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...values } : row)));
  const save = useMutation({
    mutationFn: () =>
      api.post('/api/v1/purchases/receipts', {
        ...header,
        supplier_id: Number(header.supplier_id),
        items: lines.map((line) => ({
          ...line,
          item_id: Number(line.item_id),
          warehouse_id: Number(warehouseFor(line)),
          quantity: Number(line.quantity),
          purchase_cost: Number(line.purchase_cost),
          selling_price: Number(line.selling_price),
          gst_rate: Number(line.gst_rate),
          manufacture_date: line.manufacture_date || null,
          expiry_date: line.expiry_date || null,
        })),
      }),
    onSuccess: (response) => {
      client.invalidateQueries({ queryKey: ['purchase-receipts'] });
      invalidateInventory(client);
      onSaved(response.data);
    },
  });
  const subtotal = lines.reduce(
    (sum, line) => sum + Math.round(Number(line.quantity) * Number(line.purchase_cost) * 100) / 100,
    0,
  );
  const tax = lines.reduce(
    (sum, line) =>
      sum +
      Math.round(Number(line.quantity) * Number(line.purchase_cost) * Number(line.gst_rate)) / 100,
    0,
  );
  const input = 'block w-full rounded border p-2 dark:bg-gray-800';
  return (
    <form
      className="space-y-4 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate();
      }}
    >
      <h2 className="text-lg font-semibold">Enter supplier bill</h2>
      <fieldset disabled={save.isPending} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="receipt-supplier">Supplier</label>
            <RemoteSelect
              id="receipt-supplier"
              endpoint="/api/v1/suppliers"
              queryKey="suppliers"
              searchLabel="Find supplier"
              value={header.supplier_id}
              optionLabel={(row) => `${row.name}${row.is_active ? '' : ' (inactive)'}`}
              onChange={(value, record) => {
                setHeader({ ...header, supplier_id: value });
                setSupplier(record);
              }}
            />
            {supplier && <p>GSTIN: {supplier.gstin || 'Unregistered'}</p>}
          </div>
          {['receipt_number', 'receipt_date', 'notes'].map((key) => (
            <label key={key}>
              {
                {
                  receipt_number: 'Supplier invoice number',
                  receipt_date: 'Invoice date',
                  notes: 'Receipt notes',
                }[key]
              }
              <input
                className={input}
                required={key !== 'notes'}
                type={key === 'receipt_date' ? 'date' : 'text'}
                value={header[key]}
                onChange={(event) => setHeader({ ...header, [key]: event.target.value })}
              />
            </label>
          ))}
        </div>
        {lines.map((line, index) => (
          <fieldset key={index} className="grid gap-3 rounded border p-3 sm:grid-cols-3">
            <legend>Receipt line {index + 1}</legend>
            <div>
              <label htmlFor={`receipt-item-${index}`}>Inventory item {index + 1}</label>
              <RemoteSelect
                id={`receipt-item-${index}`}
                endpoint="/api/v1/inventory/items"
                queryKey="inventory-items"
                searchLabel={`Find item ${index + 1}`}
                value={line.item_id}
                optionLabel={(row) => `${row.item_name} (${row.sku})`}
                onChange={(value, record) =>
                  update(index, {
                    item_id: value,
                    purchase_cost: record?.purchase_cost ?? '',
                    selling_price: record?.selling_price ?? '',
                    gst_rate: record?.gst_rate ?? '18',
                  })
                }
              />
            </div>
            {!singleWarehouse && (
              <div>
                <label htmlFor={`receipt-warehouse-${index}`}>Warehouse {index + 1}</label>
                <RemoteSelect
                  id={`receipt-warehouse-${index}`}
                  endpoint="/api/v1/warehouses"
                  queryKey="warehouses"
                  searchLabel={`Find warehouse ${index + 1}`}
                  value={warehouseFor(line)}
                  optionLabel={(row) => `${row.name} (${row.code})`}
                  onChange={(value) => update(index, { warehouse_id: value })}
                />
              </div>
            )}
            {Object.entries({
              batch_number: 'Batch number (optional)',
              quantity: 'Quantity',
              purchase_cost: 'Purchase cost',
              selling_price: 'Selling price',
              gst_rate: 'GST rate (%)',
              manufacture_date: 'Manufacture date',
              expiry_date: 'Expiry date',
            }).map(([key, label]) => (
              <label key={key}>
                {label} {index + 1}
                <input
                  className={input}
                  type={key.endsWith('_date') ? 'date' : key === 'batch_number' ? 'text' : 'number'}
                  required={!key.endsWith('_date') && key !== 'batch_number'}
                  placeholder={key === 'batch_number' ? 'Bill number is used if blank' : undefined}
                  min={key === 'quantity' ? '0.001' : '0'}
                  max={key === 'gst_rate' ? '100' : undefined}
                  step="any"
                  value={line[key]}
                  onChange={(event) => update(index, { [key]: event.target.value })}
                />
              </label>
            ))}
            <button
              type="button"
              disabled={lines.length === 1}
              onClick={() => setLines(lines.filter((_, i) => i !== index))}
            >
              Remove line {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="rounded border px-3 py-2"
          onClick={() => setLines([...lines, emptyLine()])}
        >
          Add receipt line
        </button>
        <p>
          Preview subtotal ₹{subtotal.toFixed(2)} · GST ₹{tax.toFixed(2)} · Total ₹
          {(subtotal + tax).toFixed(2)}
        </p>
        <p className="text-sm text-gray-500">
          Saving posts the supplier balance and increases warehouse stock. Final totals are
          calculated by the server.
        </p>
        <div className="flex gap-3">
          <button className="rounded border px-3 py-2">
            {save.isPending ? 'Saving receipt...' : 'Save & update stock'}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel receipt
          </button>
        </div>
      </fieldset>
      {save.error && (
        <p role="alert" className="text-red-600">
          {save.error.message}
        </p>
      )}
    </form>
  );
}
