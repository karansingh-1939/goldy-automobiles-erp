import React, { useState } from 'react';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import { api } from '../../shared/api/api-client.js';
import { invalidateInventory } from '../../shared/api/inventory-cache.js';
import {
  Field,
  RecordSelect,
  Notice,
  Register,
  columnsFor,
  buttonClass,
  inputClass,
  useInventoryMutation,
} from './inventory-ui.jsx';
import BulkStockVerification from './BulkStockVerification.jsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function StockVerificationManager() {
  const { hasPermission } = usePermissions();
  const client = useQueryClient();
  const canAdjust = hasPermission('inventory.adjust');
  const [mode, setMode] = useState('Single Item');
  const [form, setForm] = useState({
    warehouse_id: '',
    item_id: '',
    batch_id: '',
    counted_quantity: '',
    notes: '',
  });
  const [action, setAction] = useState(null);
  const save = useInventoryMutation('/api/v1/inventory/verifications', () =>
    setForm({ ...form, counted_quantity: '', notes: '' }),
  );
  const batchQuery = useQuery({
    queryKey: ['inventory', 'verification-batches', form.item_id],
    queryFn: ({ signal }) => api.get(`/api/v1/inventory/items/${form.item_id}/batches`, { signal }),
    enabled: !!form.item_id,
  });
  const batches = (batchQuery.data?.data || []).filter(
    (row) => String(row.warehouse_id) === String(form.warehouse_id),
  );
  const system = batches
    .filter((row) => !form.batch_id || String(row.id) === String(form.batch_id))
    .reduce((sum, row) => sum + Number(row.quantity), 0);
  const submit = (e) => {
    e.preventDefault();
    save.mutate({
      ...form,
      item_id: Number(form.item_id),
      warehouse_id: Number(form.warehouse_id),
      batch_id: form.batch_id ? Number(form.batch_id) : null,
      counted_quantity: Number(form.counted_quantity),
      verification_type: 'Single Item',
    });
  };
  const [decisionError, setDecisionError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const decide = async (row, kind) => {
    setAction(row);
    setProcessing(true);
    setDecisionError(null);
    try {
      await api.post(`/api/v1/inventory/verifications/${row.id}/${kind}`, {});
      invalidateInventory(client);
    } catch (error) {
      setDecisionError(error);
    } finally {
      setProcessing(false);
    }
  };
  return (
    <section className="p-6 space-y-5">
      <h1 className="text-xl font-bold">Stock verification</h1>
      <p>Counts create pending verifications. Review and approve each variance to change stock.</p>
      {canAdjust && (
        <>
          <label>
            Verification scope
            <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option>Single Item</option>
              <option>Warehouse</option>
              <option>Full Inventory</option>
            </select>
          </label>
          {mode === 'Single Item' ? (
            <form onSubmit={submit} className="space-y-4">
              <fieldset disabled={save.isPending} className="grid gap-4 md:grid-cols-3">
                <RecordSelect
                  label="Warehouse"
                  endpoint="/api/v1/warehouses"
                  value={form.warehouse_id}
                  onChange={(value) => setForm({ ...form, warehouse_id: value, batch_id: '' })}
                />
                <RecordSelect
                  label="Item"
                  endpoint="/api/v1/inventory/items"
                  value={form.item_id}
                  onChange={(value) => setForm({ ...form, item_id: value, batch_id: '' })}
                  optionLabel={(row) => `${row.sku} — ${row.item_name}`}
                />
                <label>
                  Batch
                  <select
                    aria-label="Verification batch"
                    className={inputClass}
                    value={form.batch_id}
                    onChange={(e) => setForm({ ...form, batch_id: e.target.value })}
                  >
                    <option value="">All batches in selected warehouse</option>
                    {batches.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.batch_number} — {row.quantity}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Counted quantity"
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={form.counted_quantity}
                  onChange={(e) => setForm({ ...form, counted_quantity: e.target.value })}
                />
                <Field
                  label="Verification notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
                <p>
                  System quantity: {system}. Variance:{' '}
                  {form.counted_quantity === '' ? '—' : Number(form.counted_quantity) - system}
                </p>
              </fieldset>
              <Notice error={batchQuery.error || save.error} message={save.message} />
              <button
                className={buttonClass}
                disabled={save.isPending || batchQuery.isFetching || !!batchQuery.error}
              >
                Submit verification
              </button>
            </form>
          ) : (
            <BulkStockVerification scope={mode} />
          )}
        </>
      )}
      <h2 className="text-lg font-bold">Verification history</h2>
      <Notice error={decisionError} />
      <VerificationHistory
        canAdjust={canAdjust}
        processing={processing}
        action={action}
        decide={decide}
      />
    </section>
  );
}

function VerificationHistory({ canAdjust, processing, action, decide }) {
  return (
    <Register
      key={`${action?.id}-${processing}`}
      endpoint="/api/v1/inventory/verifications"
      columns={[
        ...columnsFor([
          'verification_number',
          'audit_session_id',
          'verification_type',
          'item_name',
          'sku',
          'warehouse_name',
          'batch_number',
          'previous_quantity',
          'counted_quantity',
          'difference',
          'status',
          'adjustment_id',
          'verified_by_name',
          'verified_at',
          'notes',
        ]),
        {
          id: 'actions',
          header: 'Review',
          cell: (info) => {
            const row = info.row.original;
            return row.status === 'PENDING' && canAdjust ? (
              <div className="flex gap-2">
                <button
                  disabled={processing}
                  className={buttonClass}
                  aria-label={`Approve ${row.verification_number}`}
                  onClick={() => decide(row, 'approve')}
                >
                  Approve
                </button>
                <button
                  disabled={processing}
                  className={buttonClass}
                  aria-label={`Reject ${row.verification_number}`}
                  onClick={() => decide(row, 'reject')}
                >
                  Reject
                </button>
              </div>
            ) : null;
          },
        },
      ]}
    />
  );
}
