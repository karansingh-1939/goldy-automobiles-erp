import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { useAppStore } from '../../shared/store/use-app-store.js';
import { localDate } from '../../../../public/local-date.js';

const input =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-800';
const rupees = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));

function PayForm({ staff, kind, accounts, month, onDone }) {
  const client = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);
  const defaultDeduct = Math.min(staff.advanceDue || 0, staff.monthlySalary || 0);
  const [form, setForm] = useState({
    amount: kind === 'SALARY' ? staff.monthlySalary || '' : '',
    advanceDeducted: kind === 'SALARY' ? defaultDeduct : 0,
    accountId: accounts.find((account) => account.kind === 'CASH')?.id || '',
    date: localDate(),
  });
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const net = Number(form.amount || 0) - Number(form.advanceDeducted || 0);
  const save = useMutation({
    mutationFn: () =>
      kind === 'SALARY'
        ? api.post(`/api/v1/staff-pay/${staff.id}/pay`, {
            month,
            amount: Number(form.amount),
            advanceDeducted: Number(form.advanceDeducted || 0),
            accountId: Number(form.accountId),
            date: form.date,
          })
        : api.post(`/api/v1/staff-pay/${staff.id}/advance`, {
            amount: Number(form.amount),
            accountId: Number(form.accountId),
            date: form.date,
          }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['staff-pay'] });
      client.invalidateQueries({ queryKey: ['money-accounts'] });
      addNotification(kind === 'SALARY' ? 'Salary paid.' : 'Advance given.', 'success');
      onDone();
    },
    onError: (error) => addNotification(error.message || 'Could not save.', 'error'),
  });
  return (
    <form
      className="mt-3 grid gap-3 rounded-lg border bg-gray-50 p-3 sm:grid-cols-2 dark:bg-gray-800/40"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label className="text-sm font-medium">
        {kind === 'SALARY' ? `Salary for ${month} (₹)` : 'Advance amount (₹)'}
        <input
          className={input}
          type="number"
          min="0.01"
          step="0.01"
          required
          value={form.amount}
          onChange={(e) => set('amount', e.target.value)}
        />
      </label>
      {kind === 'SALARY' && staff.advanceDue > 0 && (
        <label className="text-sm font-medium">
          Cut from advance (₹) — {rupees(staff.advanceDue)} due
          <input
            className={input}
            type="number"
            min="0"
            step="0.01"
            max={staff.advanceDue}
            value={form.advanceDeducted}
            onChange={(e) => set('advanceDeducted', e.target.value)}
          />
        </label>
      )}
      <label className="text-sm font-medium">
        Paid from
        <select
          className={input}
          value={form.accountId}
          onChange={(e) => set('accountId', e.target.value)}
          required={kind !== 'SALARY' || net > 0}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.kind === 'CASH' ? 'Cash' : account.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        Date
        <input
          className={input}
          type="date"
          required
          value={form.date}
          onChange={(e) => set('date', e.target.value)}
        />
      </label>
      {kind === 'SALARY' && (
        <p className="text-base font-semibold sm:col-span-2">Hand over: {rupees(net)}</p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-lg bg-brand-600 px-5 py-2 font-semibold text-white disabled:opacity-60"
        >
          {kind === 'SALARY' ? 'Pay salary' : 'Give advance'}
        </button>
        <button type="button" className="rounded-lg border px-5 py-2" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SalaryInput({ staff }) {
  const client = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);
  const [value, setValue] = useState(staff.monthlySalary || '');
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/staff-pay/${staff.id}/salary`, { monthlySalary: Number(value || 0) }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['staff-pay'] });
      addNotification('Monthly salary saved.', 'success');
    },
    onError: (error) => addNotification(error.message, 'error'),
  });
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label className="text-sm">
        Monthly salary (₹)
        <input
          className={input}
          type="number"
          min="0"
          step="1"
          value={value}
          aria-label={`Monthly salary for ${staff.name}`}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      {Number(value || 0) !== Number(staff.monthlySalary || 0) && (
        <button type="submit" className="rounded-lg border px-3 py-2 text-sm">
          Save
        </button>
      )}
    </form>
  );
}

export default function StaffPay() {
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [open, setOpen] = useState(null); // { id, kind }
  const staff = useQuery({
    queryKey: ['staff-pay', month],
    queryFn: () => api.get(`/api/v1/staff-pay?month=${month}`),
  });
  const accountsQuery = useQuery({
    queryKey: ['money-accounts'],
    queryFn: () => api.get('/api/v1/accounting/money-accounts'),
  });
  const rows = Array.isArray(staff.data?.data) ? staff.data.data : [];
  const accounts = Array.isArray(accountsQuery.data?.data) ? accountsQuery.data.data : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Staff &amp; Salary</h1>
          <p className="text-gray-500">
            Set each person&apos;s salary, give advances and pay salary. Accounts update by
            themselves.
          </p>
        </div>
        <label className="text-sm font-medium">
          Month
          <input
            className={input}
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
      </header>
      {staff.error && <p role="alert">Staff list could not be loaded.</p>}
      {!rows.length && !staff.isPending && (
        <p className="rounded-xl border bg-white p-5 dark:bg-gray-900">
          No staff yet. Add mechanics under More tools → Mechanics.
        </p>
      )}
      {rows.map((person) => (
        <section
          key={person.id}
          className="rounded-xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{person.name}</h2>
              <p className="text-sm text-gray-500">
                {person.salaryPaid
                  ? `Salary for ${month} paid (${rupees(person.paidThisMonth)})`
                  : `Salary for ${month} not paid yet`}
                {person.advanceDue > 0 ? ` · Advance due ${rupees(person.advanceDue)}` : ''}
              </p>
            </div>
            <SalaryInput key={`${person.id}-${person.monthlySalary}`} staff={person} />
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border px-4 py-2"
                onClick={() => setOpen({ id: person.id, kind: 'ADVANCE' })}
              >
                Give advance
              </button>
              <button
                type="button"
                disabled={person.salaryPaid}
                className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
                onClick={() => setOpen({ id: person.id, kind: 'SALARY' })}
              >
                Pay salary
              </button>
            </div>
          </div>
          {open?.id === person.id && (
            <PayForm
              staff={person}
              kind={open.kind}
              accounts={accounts}
              month={month}
              onDone={() => setOpen(null)}
            />
          )}
        </section>
      ))}
    </div>
  );
}
