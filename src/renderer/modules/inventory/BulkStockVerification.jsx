import React, { useState } from 'react';
import { api } from '../../shared/api/api-client.js';
import DataTable from '../../shared/components/DataTable.jsx';
import {
  Field,
  RecordSelect,
  Notice,
  columnsFor,
  buttonClass,
  useInventoryMutation,
} from './inventory-ui.jsx';

export default function BulkStockVerification({ scope }) {
  const [warehouse, setWarehouse] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadedScope, setLoadedScope] = useState('');
  const [counts, setCounts] = useState({});
  const save = useInventoryMutation('/api/v1/inventory/verifications', () => {
    setRows([]);
    setCounts({});
    setLoadedScope('');
  });
  const load = async () => {
    setLoading(true);
    setError(null);
    setRows([]);
    setCounts({});
    try {
      let page = 1,
        all = [],
        totalPages = 1;
      do {
        const result = await api.get(`/api/v1/batches?page=${page}&pageSize=100`);
        all.push(...result.data);
        totalPages = result.pagination?.totalPages || 1;
        page++;
      } while (page <= totalPages);
      all = all.filter(
        (row) => scope !== 'Warehouse' || String(row.warehouse_id) === String(warehouse),
      );
      setRows(all);
      setCounts(
        Object.fromEntries(all.map((row) => [row.id, { count: String(row.quantity), notes: '' }])),
      );
      setLoadedScope(`${scope}-${warehouse}`);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };
  const valid =
    rows.length > 0 &&
    loadedScope === `${scope}-${warehouse}` &&
    rows.every(
      (row) =>
        counts[row.id]?.count !== '' &&
        Number.isFinite(Number(counts[row.id]?.count)) &&
        Number(counts[row.id]?.count) >= 0,
    );
  const change = (id, key, value) =>
    setCounts({ ...counts, [id]: { ...counts[id], [key]: value } });
  return (
    <div className="space-y-4">
      <p>
        Load every batch in the selected scope, then record counts. Submitting creates pending
        records for review.
      </p>
      {scope === 'Warehouse' && (
        <RecordSelect
          label="Audit warehouse"
          endpoint="/api/v1/warehouses"
          value={warehouse}
          onChange={setWarehouse}
        />
      )}
      <button
        className={buttonClass}
        disabled={loading || save.isPending || (scope === 'Warehouse' && !warehouse)}
        onClick={load}
      >
        Load count sheet
      </button>
      <Notice error={error || save.error} message={save.message} />
      {loadedScope && loadedScope !== `${scope}-${warehouse}` && (
        <p role="status">Scope changed. Load a fresh count sheet before submitting.</p>
      )}
      <DataTable
        data={rows}
        isLoading={loading}
        columns={[
          ...columnsFor(['item_id', 'warehouse_id', 'batch_number', 'quantity']),
          {
            id: 'count',
            header: 'Count',
            cell: (info) => (
              <Field
                label={`Count batch ${info.row.original.batch_number}`}
                type="number"
                min="0"
                step="any"
                value={counts[info.row.original.id]?.count ?? ''}
                disabled={save.isPending}
                onChange={(e) => change(info.row.original.id, 'count', e.target.value)}
              />
            ),
          },
          {
            id: 'difference',
            header: 'Variance',
            cell: (info) =>
              Number(counts[info.row.original.id]?.count) - Number(info.row.original.quantity),
          },
          {
            id: 'notes',
            header: 'Notes',
            cell: (info) => (
              <Field
                label={`Notes batch ${info.row.original.batch_number}`}
                value={counts[info.row.original.id]?.notes ?? ''}
                disabled={save.isPending}
                onChange={(e) => change(info.row.original.id, 'notes', e.target.value)}
              />
            ),
          },
        ]}
        emptyStateMessage="No batches loaded. Record opening stock or purchasing first."
      />
      <button
        className={buttonClass}
        disabled={!valid || save.isPending}
        onClick={() =>
          save.mutate({
            verification_type: scope,
            verifications: rows.map((row) => ({
              item_id: row.item_id,
              warehouse_id: row.warehouse_id,
              batch_id: row.id,
              counted_quantity: Number(counts[row.id].count),
              notes: counts[row.id].notes,
            })),
          })
        }
      >
        Submit {rows.length} batch counts
      </button>
    </div>
  );
}
