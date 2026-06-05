import React from 'react';
import { KpiCard } from './KpiCard.jsx';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/**
 * KPI Section Component.
 * Maps dashboard summary numbers to individual KpiCards.
 * 
 * @param {object} props
 * @param {object} props.summary - The dashboard summary DTO containing count aggregates
 * @param {number} props.summary.invoicesToday - Count of finalized invoices today
 * @param {number} props.summary.invoicesThisMonth - Count of finalized invoices this month
 * @param {number} props.summary.averageInvoiceValue - Average invoice value
 * @param {boolean} props.isLoading - Whether the cards are currently loading
 */
export function KpiSection({ summary, isLoading }) {
  const { invoicesToday = 0, invoicesThisMonth = 0, averageInvoiceValue = 0 } = summary || {};

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <KpiCard
        title="Invoices Today"
        value={invoicesToday}
        isLoading={isLoading}
      />
      <KpiCard
        title="Invoices This Month"
        value={invoicesThisMonth}
        isLoading={isLoading}
      />
      <KpiCard
        title="Average Invoice Value"
        value={inrFormatter.format(averageInvoiceValue)}
        isLoading={isLoading}
      />
    </div>
  );
}
