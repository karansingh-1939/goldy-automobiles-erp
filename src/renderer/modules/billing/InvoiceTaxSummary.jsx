import React from 'react';
const money = (n) => `₹${Number(n || 0).toFixed(2)}`;

// Uses the tax amounts stored on each line, so interstate bills show IGST and
// discounted lines use their actual taxable value.
export default function InvoiceTaxSummary({ items }) {
  const rates = new Map();
  for (const item of items) {
    const rate = Number(item.gst_rate || 0);
    const taxable = Number(item.line_revenue ?? Number(item.unit_price) * Number(item.quantity));
    const hasSplit = item.cgst_amount !== undefined || item.igst_amount !== undefined;
    const tax = Number(item.line_total) - taxable;
    const row = rates.get(rate) || { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    row.taxable += taxable;
    if (hasSplit) {
      row.cgst += Number(item.cgst_amount || 0);
      row.sgst += Number(item.sgst_amount || 0);
      row.igst += Number(item.igst_amount || 0);
    } else {
      row.cgst += tax / 2;
      row.sgst += tax / 2;
    }
    rates.set(rate, row);
  }
  const showIgst = [...rates.values()].some((row) => row.igst > 0);
  return (
    <section>
      <h3 className="font-semibold">Tax Breakdown Summary</h3>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>GST rate</th>
            <th>Taxable value</th>
            <th>CGST</th>
            <th>SGST</th>
            {showIgst && <th>IGST</th>}
            <th>Total tax</th>
          </tr>
        </thead>
        <tbody>
          {[...rates].map(([rate, row]) => (
            <tr key={rate}>
              <td>{rate}%</td>
              <td>{money(row.taxable)}</td>
              <td>{money(row.cgst)}</td>
              <td>{money(row.sgst)}</td>
              {showIgst && <td>{money(row.igst)}</td>}
              <td>{money(row.cgst + row.sgst + row.igst)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
