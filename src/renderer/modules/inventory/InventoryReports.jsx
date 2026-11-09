import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import {
  Register,
  RecordSelect,
  Field,
  columnsFor,
  buttonClass,
  inputClass,
  Notice,
} from './inventory-ui.jsx';

const fields = {
  summary: ['sku', 'item_name', 'current_quantity', 'reorder_level', 'selling_price'],
  valuation: ['sku', 'item_name', 'current_quantity', 'average_cost', 'stock_value'],
  'low-stock': ['sku', 'item_name', 'current_quantity', 'reorder_level', 'shortage'],
  movements: [
    'created_at',
    'item_name',
    'warehouse_name',
    'direction',
    'quantity',
    'quantity_after',
    'unit_cost',
    'transaction_type',
    'notes',
    'user_name',
  ],
};
export default function InventoryReports() {
  const [report, setReport] = useState('summary');
  const [item, setItem] = useState('');
  const [method, setMethod] = useState('AVCO');
  const [date, setDate] = useState('');
  const stats = useQuery({
    queryKey: ['inventory', 'dashboard-stats'],
    queryFn: () => api.get('/api/v1/inventory/dashboard-stats'),
  });
  const params =
    report === 'movements'
      ? { itemId: item }
      : report === 'valuation'
        ? { method, ...(date ? { date } : {}) }
        : {};
  const valuation = useQuery({
    queryKey: ['inventory', 'valuation-totals', params],
    queryFn: () => api.get(`/api/v1/inventory/reports/valuation?${new URLSearchParams(params)}`),
    enabled: report === 'valuation',
  });
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold">Inventory reports</h2>
      <Notice error={stats.error} />
      {stats.data && (
        <p>
          Items: {stats.data.totalItems} · Stock value: ₹{Number(stats.data.totalValue).toFixed(2)}{' '}
          · Low stock: {stats.data.lowStockCount} · Out of stock: {stats.data.outOfStockCount}
        </p>
      )}
      <label>
        Report
        <select className={inputClass} value={report} onChange={(e) => setReport(e.target.value)}>
          <option value="summary">Stock summary</option>
          <option value="valuation">Stock valuation</option>
          <option value="low-stock">Low stock</option>
          <option value="movements">Stock movements</option>
        </select>
      </label>
      {report === 'movements' && (
        <RecordSelect
          label="Movement item"
          endpoint="/api/v1/inventory/items"
          value={item}
          onChange={setItem}
          required={false}
          optionLabel={(row) => `${row.sku} — ${row.item_name}`}
        />
      )}
      {report === 'valuation' && (
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            Valuation method
            <select
              className={inputClass}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {['AVCO', 'FIFO', 'LIFO', 'BATCH'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <Field
            label="Valuation as of"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {valuation.data?.totals && (
            <p>
              Total quantity: {valuation.data.totals.quantity} · Total value: ₹
              {Number(valuation.data.totals.value).toFixed(2)}
            </p>
          )}
        </div>
      )}
      <Register
        key={`${report}-${item}-${method}-${date}`}
        endpoint={`/api/v1/inventory/reports/${report}`}
        params={params}
        columns={[
          ...columnsFor(fields[report].filter((field) => field !== 'shortage')),
          ...(report === 'low-stock'
            ? [
                {
                  id: 'shortage',
                  header: 'Shortage',
                  cell: (info) =>
                    Math.max(
                      0,
                      Number(info.row.original.reorder_level) -
                        Number(info.row.original.current_quantity),
                    ),
                },
              ]
            : []),
          ...(report === 'movements'
            ? [
                {
                  id: 'previous_quantity',
                  header: 'Previous quantity',
                  cell: (info) => {
                    const row = info.row.original;
                    return (
                      Number(row.quantity_after) +
                      (row.direction === 'IN' ? -1 : 1) * Number(row.quantity)
                    );
                  },
                },
              ]
            : []),
        ]}
      />
      <button className={buttonClass} onClick={() => window.print()}>
        Print report
      </button>
    </section>
  );
}
