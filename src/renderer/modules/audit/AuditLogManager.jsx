import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import DataTable from '../../shared/components/DataTable.jsx';
import ServerPagination from '../../shared/components/ServerPagination.jsx';

export default function AuditLogManager() {
  const { hasPermission } = usePermissions();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const list = useQuery({
    queryKey: ['audit-logs', page, search],
    queryFn: () =>
      api.get(`/api/v1/audit-logs?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`),
    enabled: hasPermission('audit.read'),
  });
  const columns = [
    { accessorKey: 'createdAt', header: 'Recorded at (UTC)' },
    { accessorKey: 'userName', header: 'Staff' },
    { accessorKey: 'action', header: 'Action' },
    { accessorKey: 'entityType', header: 'Module' },
    { accessorKey: 'entityId', header: 'Record ID' },
    {
      id: 'details',
      header: 'Details',
      cell: ({ row }) => (
        <button
          className="rounded border px-2 py-1"
          onClick={() => setSelected(row.original)}
          aria-label={`View audit ${row.original.id}`}
        >
          View changes
        </button>
      ),
    },
  ];
  if (!hasPermission('audit.read'))
    return <p className="p-6">You do not have permission to view audit logs.</p>;
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">Audit logs</h1>
        <p className="text-sm text-gray-500">Review recorded staff actions and changes.</p>
      </header>
      <label className="block max-w-sm text-sm">
        Find audit records
        <input
          className="block w-full rounded border p-2 dark:bg-gray-800"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Staff, action or module"
        />
      </label>
      <DataTable
        columns={columns}
        data={list.data?.data || []}
        isLoading={list.isPending}
        error={list.error}
        enablePagination={false}
      />
      <ServerPagination
        page={page}
        totalPages={list.data?.pagination?.totalPages || 1}
        disabled={list.isFetching || Boolean(list.error)}
        onChange={setPage}
      />
      {selected && (
        <section
          className="space-y-3 rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
          aria-label="Audit details"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              Audit #{selected.id} · {selected.action}
            </h2>
            <button className="rounded border px-2 py-1" onClick={() => setSelected(null)}>
              Close details
            </button>
          </div>
          {[
            ['Before', selected.oldValue],
            ['After', selected.newValue],
          ].map(([label, value]) => (
            <div key={label}>
              <h3 className="text-sm font-semibold">{label}</h3>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-3 text-xs dark:bg-gray-800">
                {value ? JSON.stringify(value, null, 2) : 'No snapshot recorded.'}
              </pre>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
