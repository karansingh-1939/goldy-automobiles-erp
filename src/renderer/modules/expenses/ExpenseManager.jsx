import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import { useAppStore } from '../../shared/store/use-app-store.js';
import DataTable from '../../shared/components/DataTable.jsx';
import ServerPagination from '../../shared/components/ServerPagination.jsx';
import { localDate } from '../../../../public/local-date.js';

const categories = [
  'Rent',
  'Salary',
  'Electricity',
  'Internet',
  'Fuel',
  'Maintenance',
  'Miscellaneous',
];
const empty = () => ({
  expense_date: localDate(),
  category: 'Miscellaneous',
  amount: '',
  description: '',
});
export default function ExpenseManager() {
  const { hasPermission } = usePermissions();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const list = useQuery({
    queryKey: ['expenses', page, category],
    queryFn: () =>
      api.get(`/api/v1/expenses?page=${page}&pageSize=20&category=${encodeURIComponent(category)}`),
    enabled: hasPermission('expenses.read'),
  });
  const mutation = useMutation({
    mutationFn: ({ id, remove = false }) =>
      remove
        ? api.del(`/api/v1/expenses/${id}`)
        : id
          ? api.patch(`/api/v1/expenses/${id}`, { ...form, amount: Number(form.amount) })
          : api.post('/api/v1/expenses', { ...form, amount: Number(form.amount) }),
    onSuccess: () => {
      client.invalidateQueries();
      setSelected(null);
      setForm(empty());
    },
  });
  const columns = [
    { accessorKey: 'expense_date', header: 'Date' },
    { accessorKey: 'category', header: 'Category' },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ getValue }) => `₹${Number(getValue()).toFixed(2)}`,
    },
    { accessorKey: 'description', header: 'Description' },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) =>
        hasPermission('expenses.write') && (
          <div className="flex gap-2">
            <button
              className="rounded border px-2 py-1"
              disabled={mutation.isPending}
              onClick={() => {
                setSelected(row.original.id);
                setForm({
                  expense_date: row.original.expense_date,
                  category: row.original.category,
                  amount: row.original.amount,
                  description: row.original.description || '',
                });
              }}
              aria-label={`Edit expense ${row.original.id}`}
            >
              Edit
            </button>
            <button
              className="rounded border px-2 py-1"
              disabled={mutation.isPending}
              onClick={() =>
                useAppStore.getState().openDialog({
                  title: 'Delete this expense?',
                  message: 'The expense and its accounting effect will be reversed.',
                  onConfirm: () => mutation.mutate({ id: row.original.id, remove: true }),
                })
              }
              aria-label={`Delete expense ${row.original.id}`}
            >
              Delete
            </button>
          </div>
        ),
    },
  ];
  if (!hasPermission('expenses.read'))
    return <p className="p-6">You do not have permission to view expenses.</p>;
  const input = 'block w-full rounded border p-2 dark:bg-gray-800';
  const change = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">Workshop expenses</h1>
        <p className="text-sm text-gray-500">Track operating costs and their accounting entries.</p>
      </header>
      {mutation.error && (
        <p role="alert" className="text-red-600">
          {mutation.error.message}
        </p>
      )}
      {hasPermission('expenses.write') && (
        <form
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 dark:border-gray-800 dark:bg-gray-900"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ id: selected });
          }}
        >
          <h2 className="font-semibold sm:col-span-2">
            {selected ? 'Edit expense' : 'Record expense'}
          </h2>
          <label className="text-sm">
            Expense date
            <input
              className={input}
              type="date"
              required
              max={localDate()}
              value={form.expense_date}
              onChange={(event) => change('expense_date', event.target.value)}
            />
          </label>
          <label className="text-sm">
            Expense category
            <select
              className={input}
              value={form.category}
              onChange={(event) => change('category', event.target.value)}
            >
              {categories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Amount (₹)
            <input
              className={input}
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.amount}
              onChange={(event) => change('amount', event.target.value)}
            />
          </label>
          <label className="text-sm">
            Description
            <input
              className={input}
              maxLength={1000}
              value={form.description}
              onChange={(event) => change('description', event.target.value)}
            />
          </label>
          <div className="flex gap-3">
            <button
              className="rounded border px-3 py-2 text-sm disabled:opacity-50"
              disabled={mutation.isPending}
            >
              Save expense
            </button>
            {selected && (
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => {
                  setSelected(null);
                  setForm(empty());
                }}
              >
                Cancel editing
              </button>
            )}
          </div>
        </form>
      )}
      <label className="block max-w-xs text-sm">
        Filter by category
        <select
          className={input}
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All categories</option>
          {categories.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
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
