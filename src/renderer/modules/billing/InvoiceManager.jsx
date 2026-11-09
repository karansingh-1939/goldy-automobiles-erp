import InvoiceTaxSummary from './InvoiceTaxSummary.jsx';
import { amountInWords } from './amount-in-words.js';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../shared/api/api-client.js';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import ServerPagination from '../../shared/components/ServerPagination.jsx';
const money = (n) => `₹${Number(n || 0).toFixed(2)}`;
export default function InvoiceManager() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [id, setId] = useState(params.get('id') || ''),
    [confirm, setConfirm] = useState(false);
  const { hasPermission } = usePermissions();
  const client = useQueryClient();
  const canRead = hasPermission('invoices.read');
  const list = useQuery({
    queryKey: ['invoices', search, page],
    queryFn: ({ signal }) =>
      api.get(`/api/v1/invoices?search=${encodeURIComponent(search)}&page=${page}&pageSize=20`, {
        signal,
      }),
    enabled: canRead,
  });
  const detail = useQuery({
    queryKey: ['invoice', id],
    queryFn: ({ signal }) => api.get(`/api/v1/invoices/${id}`, { signal }),
    enabled: canRead && Boolean(id),
  });
  const invoice = detail.data?.data;
  const customer = useQuery({
    queryKey: ['invoice-customer', invoice?.customer_id],
    queryFn: () => api.get(`/api/v1/customers/${invoice.customer_id}`),
    enabled: Boolean(invoice?.customer_id),
  });
  const vehicle = useQuery({
    queryKey: ['invoice-vehicle', invoice?.vehicle_id],
    queryFn: () => api.get(`/api/v1/vehicles/${invoice.vehicle_id}`),
    enabled: Boolean(invoice?.vehicle_id),
  });
  const company = useQuery({
    queryKey: ['invoice-company'],
    queryFn: () => api.get('/api/v1/settings/company'),
    enabled: canRead,
  });
  const cancel = useMutation({
    mutationFn: () => api.post(`/api/v1/invoices/${id}/cancel`, {}),
    onSuccess: () => {
      setConfirm(false);
      client.invalidateQueries({ queryKey: ['invoice', id] });
      client.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
  if (!canRead) return <p className="p-6">Invoice read permission required.</p>;
  const sections = [
    ['Parts Consumption', (i) => i.item_type === 'PART'],
    ['Lubricants', (i) => i.item_type === 'LUBRICANT'],
    [
      'Outside Jobs',
      (i) => i.item_type === 'OUTSIDE_JOB' || /^\[Outside Job\]/i.test(i.description),
    ],
    [
      'Labour (In-House)',
      (i) =>
        !['PART', 'LUBRICANT', 'OUTSIDE_JOB'].includes(i.item_type) &&
        !/^\[Outside Job\]/i.test(i.description),
    ],
  ];
  return (
    <div className="p-6 space-y-5">
      <style>{`@media print { body * { visibility:hidden; } #invoice-print, #invoice-print * { visibility:visible; } #invoice-print {position:absolute;left:0;top:0;width:100%;background:white;color:black;} #invoice-print .internal-profit{display:none;} }`}</style>
      <h1 className="text-2xl font-bold">Invoice Register</h1>
      <input
        aria-label="Search invoices"
        placeholder="Search invoice number"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="rounded border p-2"
      />
      {list.isLoading && <p role="status">Loading invoices...</p>}
      {list.error && (
        <p role="alert">
          {list.error.message} <button onClick={() => list.refetch()}>Retry</button>
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {['Invoice', 'Date', 'Customer', 'Vehicle', 'Total', 'Status', 'Action'].map((t) => (
                <th className="p-2" key={t}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.data?.data?.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-2">{row.invoice_number}</td>
                <td>{row.invoice_date}</td>
                <td>{row.customer_name || `Customer #${row.customer_id}`}</td>
                <td>
                  {row.registration_number || (row.vehicle_id ? `Vehicle #${row.vehicle_id}` : '—')}
                </td>
                <td>{money(row.grand_total)}</td>
                <td>{row.status}</td>
                <td>
                  <button
                    className="underline"
                    aria-label={`View ${row.invoice_number}`}
                    onClick={() => {
                      setId(row.id);
                      setConfirm(false);
                      cancel.reset();
                    }}
                  >
                    View invoice
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data?.data?.length === 0 && <p>No invoices found.</p>}
      </div>
      <ServerPagination
        page={page}
        totalPages={list.data?.pagination?.totalPages || 1}
        onChange={setPage}
        disabled={list.isFetching}
      />
      {detail.isLoading && <p role="status">Loading invoice...</p>}
      {detail.error && (
        <p role="alert">
          {detail.error.message} <button onClick={() => detail.refetch()}>Retry</button>
        </p>
      )}
      {invoice && (
        <>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => window.print()} className="rounded border p-2">
              Print invoice
            </button>
            {invoice.status !== 'CANCELLED' && hasPermission('invoices.cancel') && (
              <button className="rounded border p-2" onClick={() => setConfirm(true)}>
                Cancel invoice
              </button>
            )}
          </div>
          {confirm && (
            <section
              role="alertdialog"
              aria-label="Cancel invoice confirmation"
              className="rounded border border-red-400 p-4"
            >
              <p>
                This reverses invoice accounting and stock movements. Allocated payments and returns
                must be reversed first.
              </p>
              <button disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                Confirm cancellation
              </button>{' '}
              <button disabled={cancel.isPending} onClick={() => setConfirm(false)}>
                Keep invoice
              </button>
            </section>
          )}
          {cancel.error && <p role="alert">{cancel.error.message}</p>}
          <article
            id="invoice-print"
            className="space-y-5 rounded border bg-white p-6 text-gray-900"
          >
            <header>
              <h2 className="text-xl font-bold">
                {company.data?.data?.name || 'GOLDY AUTOMOBILE'}
              </h2>
              <p>{company.data?.data?.address}</p>
              <p>
                {company.data?.data?.phone} · GSTIN: {company.data?.data?.gstin || '—'}
              </p>
              <h3 className="font-bold">TAX INVOICE · {invoice.invoice_number}</h3>
              <p>
                {invoice.invoice_date} · {invoice.status}
              </p>
            </header>
            {[customer, vehicle, company].some((q) => q.error) && (
              <p role="alert">
                Some company or party information could not load.{' '}
                <button
                  onClick={() => {
                    customer.refetch();
                    vehicle.refetch();
                    company.refetch();
                  }}
                >
                  Retry details
                </button>
              </p>
            )}
            <p>
              Bill to: {customer.data?.data?.name || `Customer #${invoice.customer_id}`} ·{' '}
              {customer.data?.data?.phone}
              <br />
              {customer.data?.data?.address} {customer.data?.data?.city}
            </p>
            <p>
              Vehicle: {vehicle.data?.data?.registration_number || invoice.vehicle_id || '—'} ·{' '}
              {vehicle.data?.data?.make} {vehicle.data?.data?.model}
              <br />
              Engine: {vehicle.data?.data?.engine_number || '—'} · Chassis:{' '}
              {vehicle.data?.data?.chassis_number || '—'} · Odometer:{' '}
              {invoice.odometer_reading ?? '—'}
            </p>
            {sections.map(([title, filter]) => {
              const rows = (invoice.items || []).filter(filter);
              if (!rows.length) return null;
              return (
                <section key={title}>
                  <h3 className="font-semibold">{title}</h3>
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        {[
                          'Description',
                          'HSN/SAC',
                          'Qty',
                          'Rate',
                          'Taxable',
                          'GST %',
                          'Tax',
                          'Total',
                        ].map((t) => (
                          <th key={t}>{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((item, index) => {
                        const taxable = Number(item.unit_price) * Number(item.quantity),
                          tax = Number(item.line_total) - taxable;
                        return (
                          <tr key={item.id || index}>
                            <td>{item.description}</td>
                            <td>{item.hsn_code || '—'}</td>
                            <td>{item.quantity}</td>
                            <td>{money(item.unit_price)}</td>
                            <td>{money(taxable)}</td>
                            <td>{item.gst_rate}%</td>
                            <td>{money(tax)}</td>
                            <td>{money(item.line_total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              );
            })}
            <InvoiceTaxSummary items={invoice.items || []} />
            <p>Total amount in words: {amountInWords(invoice.grand_total)}</p>
            <dl className="grid grid-cols-2 gap-2">
              <dt>Taxable subtotal</dt>
              <dd>{money(invoice.subtotal)}</dd>
              <dt>GST total</dt>
              <dd>{money(invoice.gst_total)}</dd>
              <dt>Grand total</dt>
              <dd className="font-bold">{money(invoice.grand_total)}</dd>
              <dt>Amount paid</dt>
              <dd>{money(invoice.amount_paid)}</dd>
            </dl>
            {invoice.revenue !== undefined && (
              <p className="internal-profit">
                Internal: Revenue {money(invoice.revenue)} · Cost {money(invoice.cost_total)} ·
                Gross profit {money(invoice.gross_profit)} · Net profit {money(invoice.net_profit)}
              </p>
            )}
            <p>Thank you for your business.</p>
          </article>
        </>
      )}
    </div>
  );
}
