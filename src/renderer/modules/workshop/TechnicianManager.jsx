import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import DataTable from '../../shared/components/DataTable.jsx';
import ServerPagination from '../../shared/components/ServerPagination.jsx';

const empty = { full_name: '', phone_number: '', specialization: '', notes: '' };
export default function TechnicianManager() {
  const { hasPermission } = usePermissions();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const [jobCardId, setJobCardId] = useState('');
  const list = useQuery({
    queryKey: ['technicians', page, search],
    queryFn: () =>
      api.get(`/api/v1/technicians?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`),
    enabled: hasPermission('job_cards.read'),
  });
  const queue = useQuery({
    queryKey: ['workshop-queue'],
    queryFn: () => api.get('/api/v1/workshop/queue'),
    enabled: hasPermission('job_cards.assign'),
  });
  const mutation = useMutation({
    mutationFn: ({ id, active, assign }) =>
      assign
        ? api.post(`/api/v1/technicians/${id}/assign`, { jobCardId: Number(jobCardId) })
        : active !== undefined
          ? api.patch(`/api/v1/technicians/${id}`, { is_active: active })
          : id
            ? api.patch(`/api/v1/technicians/${id}`, form)
            : api.post('/api/v1/technicians', form),
    onSuccess: (_, variables) => {
      client.invalidateQueries({ queryKey: ['technicians'] });
      client.invalidateQueries({ queryKey: ['timer-technicians'] });
      client.invalidateQueries({ queryKey: ['job-cards'] });
      if (!variables.assign) {
        setSelected(null);
        setForm(empty);
      }
      setJobCardId('');
    },
  });
  const columns = [
    { accessorKey: 'technician_code', header: 'Code' },
    { accessorKey: 'full_name', header: 'Mechanic' },
    { accessorKey: 'phone_number', header: 'Phone' },
    { accessorKey: 'specialization', header: 'Specialization' },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ getValue }) => (getValue() ? 'Active' : 'Inactive'),
    },
    { id: 'jobs', header: 'Active jobs', cell: ({ row }) => row.original.metrics?.activeJobs || 0 },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          {hasPermission('job_cards.write') && (
            <>
              <button
                className="rounded border px-2 py-1"
                disabled={mutation.isPending}
                onClick={() => {
                  setSelected(row.original);
                  setForm(
                    Object.fromEntries(
                      Object.keys(empty).map((key) => [key, row.original[key] || '']),
                    ),
                  );
                }}
                aria-label={`Edit ${row.original.full_name}`}
              >
                Edit
              </button>
              <button
                className="rounded border px-2 py-1"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ id: row.original.id, active: row.original.is_active ? 0 : 1 })
                }
              >
                {row.original.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </>
          )}
          {hasPermission('job_cards.assign') && row.original.is_active === 1 && (
            <button
              className="rounded border px-2 py-1"
              onClick={() => {
                setSelected(row.original);
                setForm(
                  Object.fromEntries(
                    Object.keys(empty).map((key) => [key, row.original[key] || '']),
                  ),
                );
              }}
              aria-label={`Assign ${row.original.full_name}`}
            >
              Assign
            </button>
          )}
        </div>
      ),
    },
  ];
  if (!hasPermission('job_cards.read'))
    return <p className="p-6">You do not have permission to view mechanics.</p>;
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">Technicians</h1>
        <p className="text-sm text-gray-500">Maintain mechanic details and assign open jobs.</p>
      </header>
      {mutation.error && (
        <p role="alert" className="text-red-600">
          {mutation.error.message}
        </p>
      )}
      {hasPermission('job_cards.write') && (
        <form
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 dark:border-gray-800 dark:bg-gray-900"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ id: selected?.id });
          }}
        >
          <h2 className="font-semibold sm:col-span-2">
            {selected ? `Edit ${selected.full_name}` : 'Add mechanic'}
          </h2>
          {[
            ['full_name', 'Mechanic name'],
            ['phone_number', 'Phone number'],
            ['specialization', 'Specialization'],
            ['notes', 'Mechanic notes'],
          ].map(([key, label]) => (
            <label key={key} className="text-sm">
              {label}
              <input
                className="block w-full rounded border p-2 dark:bg-gray-800"
                required={key === 'full_name' || key === 'phone_number'}
                maxLength={key === 'notes' ? 1000 : 120}
                value={form[key]}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, [key]: event.target.value }))
                }
              />
            </label>
          ))}
          <div className="flex gap-3">
            <button
              className="rounded border px-3 py-2 text-sm disabled:opacity-50"
              disabled={mutation.isPending}
            >
              Save mechanic
            </button>
            {selected && (
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => {
                  setSelected(null);
                  setForm(empty);
                }}
              >
                Cancel editing
              </button>
            )}
          </div>
        </form>
      )}
      {selected && selected.is_active === 1 && hasPermission('job_cards.assign') && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ id: selected.id, assign: true });
          }}
        >
          <label className="text-sm">
            Assign open job to {selected.full_name}
            <select
              className="block rounded border p-2 dark:bg-gray-800"
              required
              value={jobCardId}
              onChange={(event) => setJobCardId(event.target.value)}
            >
              <option value="">Choose open job</option>
              {(queue.data?.data || []).map((job) => (
                <option key={job.id} value={job.id}>
                  {job.job_card_number} · {job.registration_number}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded border px-3 py-2 text-sm"
            disabled={mutation.isPending || !jobCardId}
          >
            Assign job
          </button>
          {queue.error && <p role="alert">{queue.error.message}</p>}
        </form>
      )}
      <label className="block max-w-sm text-sm">
        Find mechanic
        <input
          className="block w-full rounded border p-2 dark:bg-gray-800"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
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
    </div>
  );
}
