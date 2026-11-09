import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { invalidateInventory } from '../../shared/api/inventory-cache.js';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import { useAppStore } from '../../shared/store/use-app-store.js';
import {
  Field,
  RecordSelect,
  Notice,
  Register,
  columnsFor,
  buttonClass,
} from '../inventory/inventory-ui.jsx';
import { masterResources, emptyMaster, masterPayload } from './master-resources.js';

export default function MasterManager({ resource = 'warehouses' }) {
  const [selected, setSelected] = useState(() =>
    masterResources[resource]
      ? resource
      : ['inventory-categories', 'inventory_categories'].includes(resource)
        ? 'inventoryCategories'
        : 'warehouses',
  );
  const { hasPermission } = usePermissions();
  return (
    <section className="p-6 space-y-5">
      <h1 className="text-xl font-bold">Reference masters</h1>
      <nav aria-label="Master types" className="flex flex-wrap gap-2">
        {Object.entries(masterResources)
          .filter(([, config]) => hasPermission(`${config.permission}.read`))
          .map(([key, config]) => (
            <button
              key={key}
              className={buttonClass}
              aria-pressed={selected === key}
              onClick={() => setSelected(key)}
            >
              {config.label}
            </button>
          ))}
        {hasPermission('inventory.read') && (
          <button
            className={buttonClass}
            aria-pressed={selected === 'starter'}
            onClick={() => setSelected('starter')}
          >
            Starter inventory
          </button>
        )}
      </nav>
      {selected === 'starter' ? (
        <StarterInventory />
      ) : hasPermission(`${masterResources[selected]?.permission}.read`) ? (
        <MasterEditor key={selected} config={masterResources[selected]} />
      ) : (
        <p>You do not have permission to read this master.</p>
      )}
    </section>
  );
}
function MasterEditor({ config }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(() => emptyMaster(config));
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(`${config.permission}.write`);
  const client = useQueryClient();
  const openDialog = useAppStore((state) => state.openDialog);
  const reset = () => {
    setEditing(null);
    setForm(emptyMaster(config));
  };
  const refresh = () => {
    client.invalidateQueries({ queryKey: ['inventory'] });
    client.invalidateQueries({ queryKey: [config.endpoint] });
    client.invalidateQueries({ queryKey: [config.endpoint.split('/').at(-1)] });
    if (config.permission === 'vehicles')
      client.invalidateQueries({ queryKey: ['history-vehicles'] });
  };
  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`${config.endpoint}/${editing}`, masterPayload(config, form))
        : api.post(config.endpoint, masterPayload(config, form)),
    onSuccess: () => {
      reset();
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id) => api.del(`${config.endpoint}/${id}`),
    onSuccess: () => {
      reset();
      refresh();
    },
  });
  const edit = (row) => {
    setEditing(row.id);
    setForm({ ...emptyMaster(config), ...row });
  };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{config.label}</h2>
      {canWrite && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="space-y-3"
        >
          <fieldset
            disabled={save.isPending || remove.isPending}
            className="grid gap-4 md:grid-cols-3"
          >
            {config.fields.map(([key, label, type = 'text', required = false]) =>
              ['customer', 'warehouse'].includes(type) ? (
                <RecordSelect
                  key={key}
                  label={label}
                  endpoint={type === 'customer' ? '/api/v1/customers' : '/api/v1/warehouses'}
                  required={required}
                  value={form[key] ?? ''}
                  onChange={(value) => setForm({ ...form, [key]: value })}
                />
              ) : type === 'checkbox' ? (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ) : (
                <Field
                  key={key}
                  label={label}
                  type={type}
                  required={required}
                  min={type === 'number' ? 0 : undefined}
                  step={type === 'number' ? 'any' : undefined}
                  value={form[key] ?? ''}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              ),
            )}
          </fieldset>
          <div className="flex gap-2">
            <button className={buttonClass} disabled={save.isPending || remove.isPending}>
              {editing ? 'Update record' : 'Create record'}
            </button>
            <button type="button" className={buttonClass} onClick={reset}>
              Reset form
            </button>
          </div>
        </form>
      )}
      <Notice
        error={save.error || remove.error}
        message={save.isSuccess ? 'Record saved.' : remove.isSuccess ? 'Record deleted.' : ''}
      />
      <Register
        endpoint={config.endpoint}
        search
        columns={[
          ...columnsFor(config.columns),
          {
            id: 'actions',
            header: 'Actions',
            cell: (info) => (
              <div className="flex gap-2">
                {canWrite && (
                  <>
                    <button
                      className={buttonClass}
                      aria-label={`Edit ${info.row.original.name || info.row.original.registration_number}`}
                      onClick={() => edit(info.row.original)}
                    >
                      Edit
                    </button>
                    <button
                      className={buttonClass}
                      disabled={remove.isPending}
                      onClick={() =>
                        openDialog({
                          title: 'Delete record',
                          message:
                            'Delete this reference record? Records used by transactions may be protected.',
                          onConfirm: () => remove.mutate(info.row.original.id),
                        })
                      }
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
function StarterInventory() {
  const { hasPermission } = usePermissions();
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ['inventory', 'seed-status'],
    queryFn: () => api.get('/api/v1/inventory/seed-status'),
  });
  const seed = useMutation({
    mutationFn: () => api.post('/api/v1/inventory/seed-starter', {}),
    onSuccess: () => invalidateInventory(client),
  });
  return (
    <div className="space-y-3">
      <p>
        {status.data?.loaded
          ? 'Starter inventory already loaded.'
          : 'Load the workshop starter catalogue once. Review the catalogue before counting stock.'}
      </p>
      <Notice
        error={status.error || seed.error}
        message={seed.isSuccess ? `${seed.data.itemsSeeded} starter items loaded.` : ''}
      />
      <button
        className={buttonClass}
        disabled={
          !hasPermission('inventory.write') ||
          status.isLoading ||
          !!status.error ||
          status.data?.loaded ||
          seed.isPending
        }
        onClick={() => seed.mutate()}
      >
        Load starter inventory
      </button>
      {status.error && <button onClick={() => status.refetch()}>Retry status check</button>}
    </div>
  );
}
