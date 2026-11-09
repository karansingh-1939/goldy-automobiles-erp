import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { invalidateInventory } from '../../shared/api/inventory-cache.js';
import DataTable from '../../shared/components/DataTable.jsx';
import ServerPagination from '../../shared/components/ServerPagination.jsx';
import RemoteSelect from '../../shared/components/RemoteSelect.jsx';

export const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800';
export const buttonClass =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800';
export function Field({ label, ...props }) {
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      <input aria-label={label} className={inputClass} {...props} />
    </label>
  );
}
export function RecordSelect({
  label,
  endpoint,
  value,
  onChange,
  required = true,
  optionLabel = (row) => row.name,
}) {
  const id = React.useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <RemoteSelect
        id={id}
        endpoint={endpoint}
        queryKey={endpoint}
        value={value}
        onChange={onChange}
        required={required}
        searchLabel={`Search ${label.toLowerCase()}`}
        optionLabel={optionLabel}
      />
    </div>
  );
}
export function Notice({ error, message }) {
  return error ? (
    <p role="alert" className="text-sm text-red-600">
      {error.message}
    </p>
  ) : message ? (
    <p role="status" className="text-sm text-green-700 dark:text-green-400">
      {message}
    </p>
  ) : null;
}
export function columnsFor(fields) {
  return fields.map((field) => ({
    accessorKey: field,
    header: field.replaceAll('_', ' '),
    cell: (info) => String(info.getValue() ?? '—'),
  }));
}
export function useInventoryMutation(endpoint, onSuccess) {
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const mutation = useMutation({
    mutationFn: (payload) => api.post(endpoint, payload),
    onSuccess: (result) => {
      invalidateInventory(client);
      setMessage('Saved successfully.');
      onSuccess?.(result);
    },
    onMutate: () => setMessage(''),
  });
  return { ...mutation, message };
}
export function Register({
  endpoint,
  columns,
  queryKey = endpoint,
  params = {},
  search = false,
  emptyStateMessage,
  onRowClick,
}) {
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState('');
  const query = useQuery({
    queryKey: ['inventory', queryKey, params, page, term],
    queryFn: ({ signal }) =>
      api.get(
        `${endpoint}?${new URLSearchParams({ ...params, page: String(page), pageSize: '20', search: term })}`,
        { signal },
      ),
  });
  return (
    <div className="space-y-3">
      {search && (
        <Field
          label="Search records"
          type="search"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setPage(1);
          }}
        />
      )}
      <DataTable
        columns={columns}
        data={query.data?.data || []}
        isLoading={query.isLoading}
        error={query.error}
        enablePagination={!query.data?.pagination}
        emptyStateMessage={emptyStateMessage}
        onRowClick={onRowClick}
      />
      {query.error && (
        <button className={buttonClass} onClick={() => query.refetch()}>
          Retry
        </button>
      )}
      {query.data?.pagination && (
        <ServerPagination
          page={page}
          totalPages={Math.max(1, query.data.pagination.totalPages || 1)}
          onChange={setPage}
          disabled={query.isFetching}
        />
      )}
    </div>
  );
}
