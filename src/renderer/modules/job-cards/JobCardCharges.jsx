import React from 'react';
export const money = (value) => `₹${Number(value || 0).toFixed(2)}`;
export default function JobCardCharges({ job, onRemove, removing }) {
  const parts = job.parts || [],
    labour = job.labour || [];
  const canRemove = job.status === 'DRAFT' && typeof onRemove === 'function';
  const sections = [
    ['Parts', 'parts', parts.filter((p) => p.item_type !== 'LUBRICANT')],
    ['Lubricants', 'parts', parts.filter((p) => p.item_type === 'LUBRICANT')],
    ['Outside Jobs', 'labour', labour.filter((p) => /^\[Outside Job\]/i.test(p.description))],
    ['Labour', 'labour', labour.filter((p) => !/^\[Outside Job\]/i.test(p.description))],
  ];
  // Only show sections that have lines; four empty tables were noise.
  const filled = sections.filter(([, , rows]) => rows.length);
  if (!filled.length)
    return (
      <p className="rounded-lg border border-dashed border-gray-300 p-4 text-base text-gray-600 dark:border-gray-700 dark:text-gray-400">
        No parts or labour added yet. Use “+ Add part” or “+ Add labour”.
      </p>
    );
  return (
    <div className="space-y-4">
      {filled.map(([title, kind, rows]) => (
        <section key={title}>
          <h3 className="font-semibold">{title}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    'Description',
                    'Quantity',
                    'Rate',
                    'GST',
                    'Total',
                    ...(canRemove ? [''] : []),
                  ].map((h) => (
                    <th className="p-2" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const qty = Number(row.quantity ?? 1),
                    rate = Number(row.selling_price ?? row.labour_charge ?? 0),
                    tax = Number(row.gst_amount ?? (rate * qty * Number(row.gst_rate || 0)) / 100);
                  return (
                    <tr className="border-t" key={row.id}>
                      <td className="p-2">{row.description}</td>
                      <td>{qty}</td>
                      <td>{money(rate)}</td>
                      <td>
                        {money(tax)} ({row.gst_rate || 0}%)
                      </td>
                      <td>{money(row.line_total ?? rate * qty + tax)}</td>
                      {canRemove && (
                        <td className="text-right">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:text-red-300"
                            disabled={removing}
                            onClick={() => onRemove(kind, row)}
                            aria-label={`Remove ${row.description}`}
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
