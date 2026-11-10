import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { useAppStore } from '../../shared/store/use-app-store.js';
import RemoteSelect from '../../shared/components/RemoteSelect.jsx';
import { localDate } from '../../../../public/local-date.js';

const input =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-800';
const card =
  'space-y-3 rounded-xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900';
const rupees = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));

const CHOICES = {
  IN: [
    ['customer', 'A customer paid me'],
    ['owner', 'I put my own money in'],
    ['loan', 'I received a loan'],
    ['income', 'Other income'],
  ],
  OUT: [
    ['supplier', 'I paid a supplier'],
    ['expense-screen', 'Shop expense (rent, electricity...)'],
    ['owner', 'I took money out for myself'],
    ['loan', 'I repaid a loan'],
    ['expense', 'Other expense'],
  ],
};

function useMoneyAccounts() {
  const query = useQuery({
    queryKey: ['money-accounts'],
    queryFn: () => api.get('/api/v1/accounting/money-accounts'),
  });
  return Array.isArray(query.data?.data) ? query.data.data : [];
}

function AccountSelect({ value, onChange, accounts }) {
  return (
    <label className="block text-sm font-medium">
      Cash or bank
      <select className={input} value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Choose...</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.kind === 'CASH' ? 'Cash' : `${account.name} (bank / UPI / card)`}
          </option>
        ))}
      </select>
    </label>
  );
}

function MoneyForm({ direction, accounts, onDone }) {
  const client = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);
  const [kind, setKind] = useState('');
  const [form, setForm] = useState({
    accountId: '',
    partyId: '',
    amount: '',
    date: localDate(),
    note: '',
  });
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const account = accounts.find((row) => String(row.id) === String(form.accountId));
  const mode =
    account?.kind === 'CASH'
      ? { paymentMode: 'CASH' }
      : { paymentMode: 'BANK', bankLedgerId: account?.id };

  const save = useMutation({
    mutationFn: () => {
      const amount = Number(form.amount);
      if (kind === 'customer')
        return api.post('/api/v1/accounting/receipts', {
          customerId: Number(form.partyId),
          receiptDate: form.date,
          amount,
          ...mode,
          narration: form.note || 'Payment received',
          autoAllocate: true,
        });
      if (kind === 'supplier')
        return api.post('/api/v1/accounting/payments', {
          supplierId: Number(form.partyId),
          paymentDate: form.date,
          amount,
          ...mode,
          narration: form.note || 'Payment to supplier',
          autoAllocate: true,
        });
      return api.post('/api/v1/accounting/money-entries', {
        direction,
        accountId: Number(form.accountId),
        party: kind,
        amount,
        date: form.date,
        note: form.note,
      });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['money-accounts'] });
      client.invalidateQueries({ queryKey: ['workshop-finance'] });
      addNotification(
        direction === 'IN' ? 'Money received is saved.' : 'Money paid is saved.',
        'success',
      );
      onDone();
    },
    onError: (error) => addNotification(error.message || 'Could not save.', 'error'),
  });

  if (!kind)
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {CHOICES[direction].map(([value, label]) =>
          value === 'expense-screen' ? (
            <a
              key={value}
              href="#/expenses"
              className="rounded-lg border p-4 text-left text-base hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {label}
            </a>
          ) : (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className="rounded-lg border p-4 text-left text-base hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {label}
            </button>
          ),
        )}
      </div>
    );

  const label = CHOICES[direction].find(([value]) => value === kind)?.[1];
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <p className="font-semibold">{label}</p>
      {(kind === 'customer' || kind === 'supplier') && (
        <div>
          <label htmlFor="money-party" className="block text-sm font-medium">
            {kind === 'customer' ? 'Customer' : 'Supplier'}
          </label>
          <RemoteSelect
            id="money-party"
            endpoint={kind === 'customer' ? '/api/v1/customers' : '/api/v1/suppliers'}
            queryKey={kind === 'customer' ? 'customers' : 'suppliers'}
            searchLabel={kind === 'customer' ? 'Find customer by name or phone' : 'Find supplier'}
            value={form.partyId}
            optionLabel={(row) => `${row.name}${row.phone ? ` · ${row.phone}` : ''}`}
            onChange={(value) => set('partyId', value)}
          />
        </div>
      )}
      <label className="block text-sm font-medium">
        Amount (₹)
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
      <AccountSelect
        accounts={accounts}
        value={form.accountId}
        onChange={(value) => set('accountId', value)}
      />
      <label className="block text-sm font-medium">
        Date
        <input
          className={input}
          type="date"
          required
          value={form.date}
          onChange={(e) => set('date', e.target.value)}
        />
      </label>
      <label className="block text-sm font-medium">
        Note (optional)
        <input className={input} value={form.note} onChange={(e) => set('note', e.target.value)} />
      </label>
      {kind === 'customer' && (
        <p className="text-xs text-gray-500">
          The payment is applied to this customer&apos;s oldest unpaid bills first.
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-lg bg-brand-600 px-5 py-2 font-semibold text-white disabled:opacity-60"
        >
          {save.isPending ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="rounded-lg border px-5 py-2" onClick={() => setKind('')}>
          Back
        </button>
      </div>
    </form>
  );
}

function OpeningBalances({ accounts }) {
  const client = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);
  const empty = { type: 'cash', id: '', amount: '' };
  const [lines, setLines] = useState([empty]);
  const [date, setDate] = useState(localDate());
  const update = (index, values) =>
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...values } : row)));
  const save = useMutation({
    mutationFn: () =>
      api.post('/api/v1/accounting/opening-balances', {
        date,
        lines: lines.map((line) => ({
          type: line.type,
          id: Number(line.id),
          amount: Number(line.amount),
        })),
      }),
    onSuccess: () => {
      setLines([empty]);
      client.invalidateQueries({ queryKey: ['money-accounts'] });
      addNotification('Starting balances saved.', 'success');
    },
    onError: (error) =>
      addNotification(error.message || 'Could not save starting balances.', 'error'),
  });
  return (
    <form
      className={card}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="text-lg font-semibold">Starting balances from old books</h2>
      <p className="text-sm text-gray-500">
        Enter once when you start: cash in the drawer, money in each bank, what each customer still
        owes you, and what you still owe each supplier.
      </p>
      <label className="block max-w-xs text-sm font-medium">
        As on date
        <input
          className={input}
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      {lines.map((line, index) => (
        <fieldset key={index} className="grid gap-2 rounded border p-3 sm:grid-cols-3">
          <legend className="text-sm">Balance {index + 1}</legend>
          <label className="text-sm">
            What
            <select
              className={input}
              value={line.type}
              onChange={(e) => update(index, { type: e.target.value, id: '' })}
            >
              <option value="cash">Cash / bank</option>
              <option value="customer">Customer owes me</option>
              <option value="supplier">I owe supplier</option>
            </select>
          </label>
          {line.type === 'cash' ? (
            <AccountSelect
              accounts={accounts}
              value={line.id}
              onChange={(value) => update(index, { id: value })}
            />
          ) : (
            <div>
              <label htmlFor={`opening-party-${index}`} className="text-sm">
                {line.type === 'customer' ? 'Customer' : 'Supplier'}
              </label>
              <RemoteSelect
                id={`opening-party-${index}`}
                endpoint={line.type === 'customer' ? '/api/v1/customers' : '/api/v1/suppliers'}
                queryKey={line.type === 'customer' ? 'customers' : 'suppliers'}
                searchLabel="Find by name"
                value={line.id}
                optionLabel={(row) => row.name}
                onChange={(value) => update(index, { id: value })}
              />
            </div>
          )}
          <label className="text-sm">
            Amount (₹)
            <input
              className={input}
              type="number"
              min="0.01"
              step="0.01"
              required
              value={line.amount}
              onChange={(e) => update(index, { amount: e.target.value })}
            />
          </label>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border px-4 py-2"
          onClick={() => setLines([...lines, empty])}
        >
          Add another
        </button>
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-lg bg-brand-600 px-5 py-2 font-semibold text-white disabled:opacity-60"
        >
          Save starting balances
        </button>
      </div>
    </form>
  );
}

export default function MoneyInOut() {
  const client = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);
  const accounts = useMoneyAccounts();
  const [direction, setDirection] = useState('');
  const [bankName, setBankName] = useState('');
  const addBank = useMutation({
    mutationFn: () => api.post('/api/v1/accounting/money-accounts', { name: bankName }),
    onSuccess: () => {
      setBankName('');
      client.invalidateQueries({ queryKey: ['money-accounts'] });
      addNotification('Bank account added.', 'success');
    },
    onError: (error) =>
      addNotification(error.message || 'Could not add the bank account.', 'error'),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Money In / Money Out</h1>
        <p className="text-gray-500">
          Record money you receive or pay. The accounts are updated for you.
        </p>
      </header>

      <section className={card}>
        <h2 className="text-lg font-semibold">Your money now</h2>
        <ul className="divide-y dark:divide-gray-800">
          {accounts.map((account) => (
            <li key={account.id} className="flex justify-between py-2 text-base">
              <span>{account.kind === 'CASH' ? 'Cash in hand' : account.name}</span>
              <span className="font-semibold">{rupees(account.balance)}</span>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addBank.mutate();
          }}
        >
          <label className="flex-1 text-sm font-medium">
            Add your bank account
            <input
              className={input}
              placeholder="e.g. SBI Current Account"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={addBank.isPending}
            className="rounded-lg border px-4 py-2"
          >
            Add bank
          </button>
        </form>
      </section>

      <section className={card}>
        {!direction ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setDirection('IN')}
              className="rounded-xl bg-green-600 p-6 text-xl font-bold text-white hover:bg-green-700"
            >
              Money In
            </button>
            <button
              type="button"
              onClick={() => setDirection('OUT')}
              className="rounded-xl bg-red-600 p-6 text-xl font-bold text-white hover:bg-red-700"
            >
              Money Out
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {direction === 'IN' ? 'Money In' : 'Money Out'}
              </h2>
              <button type="button" className="text-sm underline" onClick={() => setDirection('')}>
                Close
              </button>
            </div>
            <MoneyForm direction={direction} accounts={accounts} onDone={() => setDirection('')} />
          </div>
        )}
      </section>

      <OpeningBalances accounts={accounts} />
    </div>
  );
}
