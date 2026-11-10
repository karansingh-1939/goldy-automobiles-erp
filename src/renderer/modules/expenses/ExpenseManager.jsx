import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import { useAppStore } from '../../shared/store/use-app-store.js';
import DataTable from '../../shared/components/DataTable.jsx';
import ServerPagination from '../../shared/components/ServerPagination.jsx';
import { localDate } from '../../../../public/local-date.js';
import {
  decodeExpenseDescription,
  encodeExpenseDescription,
  paymentModeFromText,
} from './expense-description.js';

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
  payment_mode: 'CASH',
  payment_account_id: '',
  notes: '',
});
const PAID_BY = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', BANK: 'Bank transfer' };
export default function ExpenseManager() {
  const { hasPermission } = usePermissions();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [dates, setDates] = useState({ dateFrom: '', dateTo: '' });
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const moneyAccounts = useQuery({
    queryKey: ['money-accounts'],
    queryFn: () => api.get('/api/v1/accounting/money-accounts'),
  });
  const banks = (Array.isArray(moneyAccounts.data?.data) ? moneyAccounts.data.data : []).filter(
    (account) => account.kind === 'BANK',
  );
  const invalidDates = dates.dateFrom && dates.dateTo && dates.dateFrom > dates.dateTo;
  const params = new URLSearchParams({ category, ...dates });
  const enabled = hasPermission('expenses.read') && !invalidDates;
  const summary = useQuery({
    queryKey: ['expense-summary', category, dates],
    queryFn: () => api.get(`/api/v1/expenses/summary?${params}`),
    enabled,
  });
  const list = useQuery({
    queryKey: ['expenses', page, category, dates],
    queryFn: () => api.get(`/api/v1/expenses?page=${page}&pageSize=20&${params}`),
    enabled,
  });
  const mutation = useMutation({
    mutationFn: ({ id, remove = false }) => {
      const payload = {
        expense_date: form.expense_date,
        category: form.category,
        amount: Number(form.amount),
        description: encodeExpenseDescription(form),
        payment_mode: form.payment_mode,
        payment_account_id:
          form.payment_mode === 'CASH' ? null : Number(form.payment_account_id) || null,
      };
      return remove
        ? api.del(`/api/v1/expenses/${id}`)
        : id
          ? api.patch(`/api/v1/expenses/${id}`, payload)
          : api.post('/api/v1/expenses', payload);
    },
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
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ getValue }) => decodeExpenseDescription(getValue()).description,
    },
    {
      id: 'payment',
      header: 'Payment metadata',
      cell: ({ row }) =>
        PAID_BY[row.original.payment_mode] ||
        decodeExpenseDescription(row.original.description).paymentMethod,
    },
    {
      id: 'notes',
      header: 'Notes',
      cell: ({ row }) => decodeExpenseDescription(row.original.description).notes,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) =>
        hasPermission('expenses.write') && (
          <div className="flex gap-2">
            <button
              className="rounded border px-2 py-1"
              disabled={mutation.isPending}
              aria-label={`Edit expense ${row.original.id}`}
              onClick={() => {
                setSelected(row.original.id);
                setForm({
                  expense_date: row.original.expense_date,
                  category: row.original.category,
                  amount: row.original.amount,
                  ...decodeExpenseDescription(row.original.description),
                  payment_mode:
                    row.original.payment_mode ||
                    paymentModeFromText(
                      decodeExpenseDescription(row.original.description).paymentMethod,
                    ),
                  payment_account_id: row.original.payment_account_id || '',
                });
              }}
            >
              Edit
            </button>
            <button
              className="rounded border px-2 py-1"
              disabled={mutation.isPending}
              aria-label={`Delete expense ${row.original.id}`}
              onClick={() =>
                useAppStore.getState().openDialog({
                  title: 'Delete this expense?',
                  message: 'The expense and its accounting effect will be reversed.',
                  onConfirm: () => mutation.mutate({ id: row.original.id, remove: true }),
                })
              }
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
            if (!mutation.isPending) mutation.mutate({ id: selected });
          }}
        >
          <fieldset className="contents" disabled={mutation.isPending}>
            <h2 className="font-semibold sm:col-span-2">
              {selected ? 'Edit expense' : 'Record expense'}
            </h2>
            <label>
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
            <label>
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
            <label>
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
            <label>
              Description
              <input
                className={input}
                maxLength={1000}
                value={form.description}
                onChange={(event) => change('description', event.target.value)}
              />
            </label>
            <label>
              Paid by
              <select
                className={input}
                value={form.payment_mode}
                onChange={(event) => change('payment_mode', event.target.value)}
              >
                {Object.entries(PAID_BY).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {form.payment_mode !== 'CASH' && (
              <label>
                From bank account
                <select
                  className={input}
                  value={form.payment_account_id}
                  onChange={(event) => change('payment_account_id', event.target.value)}
                >
                  <option value="">
                    {banks.length === 1 ? banks[0].name : 'Choose bank account'}
                  </option>
                  {banks.length > 1 &&
                    banks.map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Expense notes
              <input
                className={input}
                value={form.notes}
                maxLength={300}
                pattern="[^\]]*"
                onChange={(event) => change('notes', event.target.value)}
              />
            </label>
            <p className="text-sm text-gray-500 sm:col-span-2">
              Payment method is descriptive metadata. Expense vouchers currently post to cash in
              hand; reconcile non-cash payments with your accountant.
            </p>
            <div className="flex gap-3">
              <button
                className="rounded border px-3 py-2 disabled:opacity-50"
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
          </fieldset>
        </form>
      )}
      <div className="flex flex-wrap gap-3">
        <label>
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
        {Object.entries({ dateFrom: 'Expense from date', dateTo: 'Expense to date' }).map(
          ([key, label]) => (
            <label key={key}>
              {label}
              <input
                className={input}
                type="date"
                value={dates[key]}
                onChange={(event) => {
                  setDates({ ...dates, [key]: event.target.value });
                  setPage(1);
                }}
              />
            </label>
          ),
        )}
      </div>
      {invalidDates && <p role="alert">From date must be on or before to date.</p>}
      {summary.error && (
        <p role="alert">
          Expense summary unavailable: {summary.error.message}
          <button className="ml-2 underline" onClick={() => summary.refetch()}>
            Retry summary
          </button>
        </p>
      )}
      {!invalidDates && summary.data?.data && (
        <section className="space-y-2 rounded border p-4">
          <h2 className="font-semibold">Expense summary</h2>
          <p>
            Today (selected category): ₹{Number(summary.data.data.todayTotal).toFixed(2)} · This
            month (selected category): ₹{Number(summary.data.data.monthTotal).toFixed(2)}
          </p>
          <p>Filtered total: ₹{Number(summary.data.data.total).toFixed(2)}</p>
          <ul>
            {(summary.data.data.byCategory || []).map((row) => (
              <li key={row.category}>
                {row.category}: ₹{Number(row.amount).toFixed(2)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!invalidDates && (
        <>
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
        </>
      )}
    </div>
  );
}
