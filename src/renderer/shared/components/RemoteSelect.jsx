import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/api-client.js';
import ServerPagination from './ServerPagination.jsx';

export default function RemoteSelect({
  id,
  endpoint,
  queryKey,
  value,
  onChange,
  searchLabel,
  optionLabel,
  placeholder = 'Select a record...',
  required = true,
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [queryKey, 'selector', search, page],
    queryFn: ({ signal }) =>
      api.get(`${endpoint}?search=${encodeURIComponent(search)}&page=${page}&pageSize=20`, {
        signal,
      }),
  });
  const records = query.data?.data || [];
  const inPage = records.find((record) => String(record.id) === String(value));
  const selectedQuery = useQuery({
    queryKey: [queryKey, 'selector-record', value],
    queryFn: ({ signal }) => api.get(`${endpoint}/${value}`, { signal }),
    enabled: Boolean(value) && !inPage,
  });
  const selected = inPage || selectedQuery.data?.data;
  const totalPages = Math.max(1, query.data?.pagination?.totalPages || 1);
  const error = query.error || (value && !inPage ? selectedQuery.error : null);
  useEffect(() => {
    if (query.data && page > totalPages) setPage(totalPages);
  }, [query.data, page, totalPages]);

  return (
    <div className="mt-1 space-y-2">
      <input
        type="search"
        aria-label={searchLabel}
        placeholder={searchLabel}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 focus-ring"
      />
      <select
        id={id}
        required={required}
        value={value}
        disabled={query.isLoading || Boolean(error)}
        aria-busy={query.isFetching}
        onChange={(event) => {
          const next = event.target.value;
          onChange(
            next,
            next ? records.find((record) => String(record.id) === next) || selected : null,
          );
        }}
        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus-ring"
      >
        <option value="">{query.isLoading ? 'Loading records...' : placeholder}</option>
        {selected && !inPage && <option value={selected.id}>{optionLabel(selected)}</option>}
        {records.map((record) => (
          <option key={record.id} value={record.id}>
            {optionLabel(record)}
          </option>
        ))}
      </select>
      {error ? (
        <div role="alert" className="text-sm text-red-600">
          {error.message}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => {
              query.refetch();
              if (value && !inPage) selectedQuery.refetch();
            }}
          >
            Retry
          </button>
        </div>
      ) : records.length === 0 && !query.isLoading ? (
        <p className="text-xs text-gray-500">No matching records.</p>
      ) : null}
      {totalPages > 1 && (
        <ServerPagination
          page={page}
          totalPages={totalPages}
          onChange={setPage}
          disabled={query.isFetching}
        />
      )}
    </div>
  );
}
