import React from 'react';
const money = (n) => `₹${Number(n || 0).toFixed(2)}`;
export default function InvoiceTaxSummary({ items }) {
  const rates = new Map();
  for (const item of items) {
    const rate = Number(item.gst_rate || 0),
      taxable = Number(item.unit_price) * Number(item.quantity),
      tax = Number(item.line_total) - taxable;
    const row = rates.get(rate) || { taxable: 0, tax: 0 };
    row.taxable += taxable;
    row.tax += tax;
    rates.set(rate, row);
  }
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
            <th>Total tax</th>
          </tr>
        </thead>
        <tbody>
          {[...rates].map(([rate, row]) => (
            <tr key={rate}>
              <td>{rate}%</td>
              <td>{money(row.taxable)}</td>
              <td>{money(row.tax / 2)}</td>
              <td>{money(row.tax / 2)}</td>
              <td>{money(row.tax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
