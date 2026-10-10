import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import { localDate } from '../../../../public/local-date.js';

const money = (amount) => `₹${Number(amount || 0).toFixed(2)}`;
function Table({ caption, columns, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th key={key} scope="col" className="p-2">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id ? `${row.document_type || ''}-${row.id}` : row.customerId || index}
              className="border-t dark:border-gray-800"
            >
              {columns.map(([key, , format]) => (
                <td key={key} className="p-2">
                  {format ? format(row[key]) : (row[key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="p-3 text-sm text-gray-500">No records.</p>}
    </div>
  );
}

export default function WorkshopFinance() {
  const { hasPermission } = usePermissions();
  const client = useQueryClient();
  const [date, setDate] = useState(localDate());
  const [countedCash, setCountedCash] = useState('');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const enabled = hasPermission('accounting.read');
  const ageing = useQuery({
    queryKey: ['receivable-ageing'],
    queryFn: () => api.get('/api/v1/accounting/receivable-ageing'),
    enabled,
  });
  const cash = useQuery({
    queryKey: ['daily-cash', date],
    queryFn: () => api.get(`/api/v1/accounting/daily-cash?date=${date}`),
    enabled: enabled && Boolean(date),
  });
  const mutation = useMutation({
    mutationFn: () =>
      api.post('/api/v1/accounting/daily-cash', { date, countedCash: Number(countedCash), notes }),
    onSuccess: () => {
      setSaved(true);
      client.invalidateQueries({ queryKey: ['daily-cash', date] });
    },
  });
  if (!enabled) return <p className="p-6">You do not have permission to view workshop accounts.</p>;
  const balances = ageing.data?.data;
  const book = cash.data?.data;
  const panel =
    'space-y-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900';
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">Receivables & daily cash</h1>
        <p className="text-sm text-gray-500">
          Review current customer dues and compare the cash book with cash on hand.
        </p>
      </header>
      <section className={panel} aria-label="Receivable ageing">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Current receivable ageing</h2>
          <button
            className="rounded border px-3 py-2 text-sm"
            disabled={ageing.isFetching}
            onClick={() => ageing.refetch()}
          >
            Refresh receivables
          </button>
        </div>
        {ageing.isPending ? (
          <p>Loading receivables…</p>
        ) : ageing.error ? (
          <p role="alert" className="text-red-600">
            {ageing.error.message}
          </p>
        ) : (
          <>
            <p className="text-sm">
              Invoice age on {balances.date}. Current posted ledger credits reduce oldest unpaid
              documents for this report only. Opening or unmatched ledger dues appear as unaged.
              Ages are measured from invoice date, not payment terms.
            </p>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries({ ...balances.buckets, 'Total due': balances.totalDue }).map(
                ([key, value]) => (
                  <div key={key} className="rounded border p-3 dark:border-gray-700">
                    <dt className="text-xs text-gray-500">
                      {key === 'unaged' ? 'Unaged' : key === 'Total due' ? key : `${key} days`}
                    </dt>
                    <dd className="mt-1 font-semibold">{money(value)}</dd>
                  </div>
                ),
              )}
            </dl>
            <Table
              caption="Outstanding invoices after current credits"
              columns={[
                ['invoice_number', 'Invoice'],
                ['customer_name', 'Customer'],
                ['phone', 'Phone'],
                ['invoice_date', 'Date'],
                ['ageDays', 'Age (days)'],
                ['outstanding', 'Due', money],
              ]}
              rows={balances.documents}
            />
            <h3 className="font-semibold">Customer balances</h3>
            <Table
              caption="Current customer dues and credit balances"
              columns={[
                ['name', 'Customer'],
                ['phone', 'Phone'],
                ['due', 'Net due', money],
                ['credit', 'Credit balance', money],
                ['unaged', 'Unaged due', money],
              ]}
              rows={balances.customers}
            />
          </>
        )}
      </section>
      <section className={panel} aria-label="Daily cash reconciliation">
        <h2 className="text-lg font-bold">Daily cash reconciliation</h2>
        <label className="block text-sm">
          Cash count date
          <input
            className="mt-1 block rounded border p-2 dark:bg-gray-800"
            type="date"
            max={localDate()}
            required
            value={date}
            disabled={mutation.isPending}
            onChange={(event) => {
              setDate(event.target.value);
              setCountedCash('');
              setNotes('');
              setSaved(false);
            }}
          />
        </label>
        {cash.isPending ? (
          <p>Loading cash book…</p>
        ) : cash.error ? (
          <p role="alert" className="text-red-600">
            {cash.error.message}
          </p>
        ) : (
          book && (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Opening cash', book.opening],
                  ['Cash in', book.cashIn],
                  ['Cash out', book.cashOut],
                  ['Expected closing cash', book.expectedClosing],
                ].map(([label, amount]) => (
                  <div key={label}>
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="font-semibold">{money(amount)}</dd>
                  </div>
                ))}
              </dl>
              {hasPermission('accounting.write') && (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setSaved(false);
                    mutation.mutate();
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      Counted cash (₹)
                      <input
                        className="block w-full rounded border p-2 dark:bg-gray-800"
                        type="number"
                        required
                        min="0"
                        max="100000000"
                        step="0.01"
                        value={countedCash}
                        onChange={(event) => setCountedCash(event.target.value)}
                      />
                    </label>
                    <label className="text-sm">
                      Count notes
                      <input
                        className="block w-full rounded border p-2 dark:bg-gray-800"
                        required={Boolean(
                          countedCash !== '' && Number(countedCash) !== book.expectedClosing,
                        )}
                        maxLength={1000}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                      />
                    </label>
                  </div>
                  {countedCash !== '' && (
                    <p className="text-sm">
                      Variance: {money(Number(countedCash) - book.expectedClosing)}
                    </p>
                  )}
                  <button
                    className="rounded border px-3 py-2 text-sm disabled:opacity-50"
                    disabled={mutation.isPending || cash.isFetching || countedCash === ''}
                  >
                    Save cash count
                  </button>
                  {mutation.error && (
                    <p role="alert" className="text-red-600">
                      {mutation.error.message}
                    </p>
                  )}
                  {saved && <p role="status">Cash count saved.</p>}
                </form>
              )}
              <p className="text-xs text-gray-500">
                Each count records the book balance at that moment. Later or backdated postings can
                change the current book balance. Saving a count does not post an accounting
                adjustment.
              </p>
              <Table
                caption="Cash count history"
                columns={[
                  ['counted_at', 'Recorded at'],
                  ['counted_by_name', 'Counted by'],
                  ['expected_cash', 'Book at count', money],
                  ['counted_cash', 'Counted', money],
                  ['variance', 'Variance', money],
                  ['notes', 'Notes'],
                ]}
                rows={book.counts}
              />
            </>
          )
        )}
      </section>
    </div>
  );
}
