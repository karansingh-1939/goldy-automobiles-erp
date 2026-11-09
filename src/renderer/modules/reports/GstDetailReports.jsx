import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import DataTable from '../../shared/components/DataTable.jsx';
import { downloadCsv } from '../../shared/utils/export-csv.js';

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;
const taxColumns = [
  ['gstRate', 'GST rate (%)'],
  ['taxableValue', 'Taxable value'],
  ['cgstAmount', 'CGST'],
  ['sgstAmount', 'SGST'],
  ['igstAmount', 'IGST'],
  ['totalTax', 'Total tax'],
];
const hsnColumns = [['hsnSac', 'HSN/SAC'], ['quantity', 'Quantity'], ...taxColumns.slice(1)];

export default function GstDetailReports({ dateFrom, dateTo }) {
  const [type, setType] = useState('');
  const [exportError, setExportError] = useState('');
  const range = new URLSearchParams({ dateFrom, dateTo }).toString();
  const query = useQuery({
    queryKey: ['gst-detail', type, dateFrom, dateTo],
    queryFn: () => api.get(`/api/v1/gst/${type}?${range}`),
    enabled: Boolean(type) && dateFrom <= dateTo,
  });
  const data = query.data?.data;
  const columns = type === 'gstr3b' ? taxColumns : hsnColumns;
  const rows = type === 'gstr3b' ? data?.rateBreakdown || [] : Array.isArray(data) ? data : [];
  const error =
    dateFrom > dateTo ? new Error('From date must be on or before To date.') : query.error;
  const dataset = (key) => data?.[key] || {};
  return (
    <section className="space-y-4 rounded-xl border p-4" aria-label="Detailed GST reports">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded border px-3 py-2"
          onClick={() => {
            setType('gstr3b');
            setExportError('');
          }}
        >
          GSTR-3B / Input tax credit
        </button>
        <button
          type="button"
          className="rounded border px-3 py-2"
          onClick={() => {
            setType('hsn-summary');
            setExportError('');
          }}
        >
          HSN/SAC summary
        </button>
      </div>
      {type && (
        <>
          {error && (
            <p role="alert" className="text-red-600">
              {error.message}
              <button type="button" className="ml-3 underline" onClick={() => query.refetch()}>
                Retry
              </button>
            </p>
          )}
          {type === 'gstr3b' && data && !error && (
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['outwardSupplies', 'Outward supplies', 'outward'],
                ['eligibleItc', 'Eligible input tax credit', 'itc'],
              ].map(([key, label, test]) => (
                <div key={key}>
                  <h3 className="font-semibold">{label}</h3>
                  <dl className="grid grid-cols-2 gap-2">
                    {[
                      ['taxableValue', 'Taxable value'],
                      ['centralTax', 'CGST'],
                      ['stateUtTax', 'SGST'],
                      ['integratedTax', 'IGST'],
                      ['totalTax', 'Total tax'],
                    ].map(([field, title]) => (
                      <React.Fragment key={field}>
                        <dt>{title}</dt>
                        <dd data-testid={`${test}-${field}`}>{money(dataset(key)[field])}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500">
            Uses posted invoice, credit-note and purchase tax components for the selected dates.
            Input tax is not estimated from current inventory rates.
          </p>
          {!error && (
            <DataTable
              columns={columns.map(([accessorKey, header]) => ({ accessorKey, header }))}
              data={rows}
              isLoading={query.isLoading}
              emptyStateMessage="No detailed tax records for this range."
            />
          )}
          <button
            type="button"
            disabled={!data || query.isFetching || Boolean(error)}
            className="rounded border px-3 py-2 disabled:opacity-50"
            onClick={() => {
              try {
                downloadCsv(
                  `${type}_${dateFrom}_${dateTo}.csv`,
                  columns.map(([, label]) => label),
                  rows.map((row) => columns.map(([key]) => row[key])),
                );
              } catch (err) {
                setExportError(err.message || 'CSV export failed.');
              }
            }}
          >
            Export detailed GST CSV
          </button>
          {exportError && <p role="alert">{exportError}</p>}
        </>
      )}
    </section>
  );
}
