import React, { useMemo } from 'react';
import { BaseChart } from '../../../shared/components/BaseChart.jsx';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Top Customers Card Component.
 * Visualizes customer revenue, cost, and profit breakdowns in a horizontal bar chart.
 *
 * @param {object} props
 * @param {Array} props.customers - List of customer metric records from the API
 * @param {boolean} props.isLoading - Whether the component is in a loading state
 */
export function TopCustomersCard({ customers, isLoading }) {
  const hasData = customers && customers.length > 0;

  const chartData = useMemo(() => {
    if (!hasData) return null;

    const labels = customers.map((c) => c.customer);
    const revenueData = customers.map((c) => c.revenue);
    const profitData = customers.map((c) => c.profit);

    return {
      labels,
      datasets: [
        {
          label: 'Revenue',
          data: revenueData,
          backgroundColor: '#3b82f6', // Tailwind blue-500
          borderRadius: 4,
          barThickness: 12,
        },
        {
          label: 'Gross Profit',
          data: profitData,
          backgroundColor: '#10b981', // Tailwind emerald-500
          borderRadius: 4,
          barThickness: 12,
        },
      ],
    };
  }, [customers, hasData]);

  const chartOptions = useMemo(() => {
    return {
      indexAxis: 'y', // Renders the bar chart horizontally
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            callback: (value) => {
              // Abbreviate currency for readable axis markers
              if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
              if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
              return `₹${value}`;
            },
          },
        },
        y: {
          grid: { display: false },
        },
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 12, usePointStyle: true },
        },
        tooltip: {
          callbacks: {
            // Show custom triple breakdown on hover
            label: () => null, // Suppress default line behavior
            title: (tooltipItems) => {
              const index = tooltipItems[0].dataIndex;
              return customers[index]?.customer || '';
            },
            beforeBody: (tooltipItems) => {
              const index = tooltipItems[0].dataIndex;
              const c = customers[index];
              if (!c) return [];
              return [
                `Revenue: ${inrFormatter.format(c.revenue)}`,
                `Cost: ${inrFormatter.format(c.cost)}`,
                `Profit: ${inrFormatter.format(c.profit)}`,
              ];
            },
          },
        },
      },
    };
  }, [customers]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col min-h-[380px]">
      <h2 className="text-lg font-bold text-gray-900 mb-4 tracking-tight">
        Top Customers (by Value)
      </h2>

      <div className="flex-1 relative min-h-[260px] flex items-center justify-center">
        {isLoading ? (
          // Skeleton UI with no layout shifts
          <div className="w-full h-full flex flex-col justify-between py-2" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 w-full animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/4" />
                <div className="flex-1 flex flex-col gap-2">
                  <div className="h-3 bg-gray-250 rounded w-4/5" />
                  <div className="h-3 bg-gray-150 rounded w-3/5" />
                </div>
              </div>
            ))}
          </div>
        ) : !hasData ? (
          // Empty State
          <div className="text-sm text-gray-400 font-medium text-center">
            No customer sales data available.
          </div>
        ) : (
          // Valid Canvas Rendering
          <BaseChart type="bar" data={chartData} options={chartOptions} />
        )}
      </div>
    </div>
  );
}
