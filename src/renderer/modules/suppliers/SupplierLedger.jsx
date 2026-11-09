import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import RemoteSelect from '../../shared/components/RemoteSelect.jsx';
import DataTable from '../../shared/components/DataTable.jsx';
import ServerPagination from '../../shared/components/ServerPagination.jsx';

export default function SupplierLedger() {
  const { hasPermission } = usePermissions();
  const [supplierId, setSupplierId] = useState('');
  const [page, setPage] = useState(1);
  const [dates, setDates] = useState({ dateFrom: '', dateTo: '' });
  const allowed = hasPermission('purchases.read');
  const invalid = dates.dateFrom && dates.dateTo && dates.dateFrom > dates.dateTo;
  const profile = useQuery({
    queryKey: ['ledger-supplier', supplierId],
    queryFn: () => api.get(`/api/v1/suppliers/${supplierId}`),
    enabled: allowed && Boolean(supplierId),
  });
  const ledger = useQuery({
    queryKey: ['supplier-ledger', supplierId, page, dates],
    queryFn: () =>
      api.get(
        `/api/v1/purchases/suppliers/${supplierId}/ledger?${new URLSearchParams({ page, pageSize: 20, ...dates })}`,
      ),
    enabled: allowed && Boolean(supplierId) && !invalid,
  });
  const balance = useQuery({
    queryKey: ['supplier-current-balance', supplierId],
    queryFn: () => api.get(`/api/v1/purchases/suppliers/${supplierId}/ledger?page=1&pageSize=1`),
    enabled: allowed && Boolean(supplierId),
  });
  if (!allowed) return <p className="p-6">You do not have permission to view supplier ledgers.</p>;
  const supplier = profile.data?.data;
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">Supplier ledger</h1>
      <div className="max-w-lg">
        <label htmlFor="ledger-supplier">Supplier</label>
        <RemoteSelect
          id="ledger-supplier"
          endpoint="/api/v1/suppliers"
          queryKey="suppliers"
          searchLabel="Find ledger supplier"
          value={supplierId}
          optionLabel={(row) => row.name}
          onChange={(id) => {
            setSupplierId(id);
            setPage(1);
          }}
        />
      </div>
      {supplierId && (
        <>
          <div className="flex flex-wrap gap-3">
            {Object.entries({ dateFrom: 'From date', dateTo: 'To date' }).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  className="block rounded border p-2 dark:bg-gray-800"
                  type="date"
                  value={dates[key]}
                  onChange={(event) => {
                    setDates({ ...dates, [key]: event.target.value });
                    setPage(1);
                  }}
                />
              </label>
            ))}
            <button
              type="button"
              onClick={() => {
                profile.refetch();
                ledger.refetch();
                balance.refetch();
              }}
            >
              Refresh ledger
            </button>
          </div>
          {invalid && <p role="alert">From date must be on or before to date.</p>}
          {profile.error && <p role="alert">{profile.error.message}</p>}
          {supplier && (
            <section className="rounded border p-4">
              <h2 className="font-semibold">{supplier.name}</h2>
              <p>
                {supplier.phone} · {supplier.email || 'No email'} · GSTIN{' '}
                {supplier.gstin || 'Unregistered'}
              </p>
              <p>
                {supplier.address} {supplier.city} {supplier.state}
              </p>
            </section>
          )}
          {balance.error ? (
            <p role="alert">Current balance unavailable: {balance.error.message}</p>
          ) : balance.isPending ? (
            <p>Loading current balance...</p>
          ) : (
            <p>
              Current outstanding (all dates): ₹
              {Number(balance.data?.data?.[0]?.balance_after || 0).toFixed(2)}
            </p>
          )}
          {!invalid && (
            <>
              <DataTable
                data={ledger.data?.data || []}
                isLoading={ledger.isPending}
                error={ledger.error}
                enablePagination={false}
                columns={[
                  { accessorKey: 'entry_date', header: 'Date' },
                  { accessorKey: 'entry_type', header: 'Transaction' },
                  {
                    id: 'reference',
                    header: 'Reference',
                    cell: ({ row }) =>
                      `${row.original.reference_type || ''} #${row.original.reference_id || ''}`,
                  },
                  ...[
                    ['debit', 'Debit (paid/returned)'],
                    ['credit', 'Credit (purchased)'],
                    ['balance_after', 'Running balance'],
                  ].map(([key, header]) => ({
                    accessorKey: key,
                    header,
                    cell: ({ getValue }) => `₹${Number(getValue() || 0).toFixed(2)}`,
                  })),
                  { accessorKey: 'notes', header: 'Notes' },
                ]}
              />
              <ServerPagination
                page={page}
                totalPages={ledger.data?.pagination?.totalPages || 1}
                disabled={ledger.isFetching || Boolean(ledger.error)}
                onChange={setPage}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
