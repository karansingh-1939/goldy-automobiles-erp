import React from 'react';
export const money = (value) => `₹${Number(value || 0).toFixed(2)}`;
export default function JobCardCharges({ job }) {
  const parts = job.parts || [],
    labour = job.labour || [];
  const sections = [
    ['Parts Consumption', parts.filter((p) => p.item_type !== 'LUBRICANT')],
    ['Lubricants', parts.filter((p) => p.item_type === 'LUBRICANT')],
    ['Outside Jobs', labour.filter((p) => /^\[Outside Job\]/i.test(p.description))],
    ['Labour (In-House)', labour.filter((p) => !/^\[Outside Job\]/i.test(p.description))],
  ];
  return (
    <div className="space-y-4">
      {sections.map(([title, rows]) => (
        <section key={title}>
          <h3 className="font-semibold">{title}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {['Description', 'Quantity', 'Rate', 'GST', 'Total'].map((h) => (
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && <p className="p-2 text-sm text-gray-500">No charges recorded.</p>}
          </div>
        </section>
      ))}
    </div>
  );
}
