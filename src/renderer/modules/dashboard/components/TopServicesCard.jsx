import React, { useMemo } from 'react';
import { BaseChart } from '../../../shared/components/BaseChart.jsx';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PALETTE = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // purple-500
  '#ec4899', // pink-500
];

/**
 * Top Services Card Component.
 * Visualizes the breakdown of top services performed by count and revenue.
 *
 * @param {object} props
 * @param {Array} props.services - List of service metrics from the API
 * @param {boolean} props.isLoading - Whether the component is in a loading state
 */
export function TopServicesCard({ services, isLoading }) {
  const hasData = services && services.length > 0;

  const chartData = useMemo(() => {
    if (!hasData) return null;

    return {
      labels: services.map((s) => s.description),
      datasets: [
        {
          data: services.map((s) => s.count),
          backgroundColor: PALETTE.slice(0, services.length),
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 4,
        },
      ],
    };
  }, [services, hasData]);

  const chartOptions = useMemo(() => {
    return {
      cutout: '65%', // Thin donut shape
      plugins: {
        legend: {
          display: false, // We use our own custom list layout for better space efficiency
        },
        tooltip: {
          callbacks: {
            label: () => null,
            title: (tooltipItems) => {
              const index = tooltipItems[0].dataIndex;
              return services[index]?.description || '';
            },
            beforeBody: (tooltipItems) => {
              const index = tooltipItems[0].dataIndex;
              const s = services[index];
              if (!s) return [];
              return [
                `Count: ${s.count}`,
                `Total Quantity: ${s.totalQuantity}`,
                `Total Revenue: ${inrFormatter.format(s.totalRevenue)}`,
              ];
            },
          },
        },
      },
    };
  }, [services]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col min-h-[380px]">
      <h2 className="text-lg font-bold text-gray-900 mb-4 tracking-tight">
        Top Services Performed
      </h2>

      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-6">
        {isLoading ? (
          // Skeleton UI with no layout shifts
          <div
            className="w-full h-full flex flex-col md:flex-row items-center gap-6 animate-pulse"
            aria-hidden="true"
          >
            <div className="w-[180px] h-[180px] rounded-full border-[18px] border-gray-200 flex items-center justify-center" />
            <div className="flex-1 flex flex-col gap-4 w-full">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex justify-between items-center w-full">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-4 bg-gray-150 rounded w-1/4" />
                </div>
              ))}
            </div>
          </div>
        ) : !hasData ? (
          // Empty State
          <div className="text-sm text-gray-400 font-medium text-center">
            No service sales data available.
          </div>
        ) : (
          <>
            {/* Doughnut Chart Canvas */}
            <div className="w-[180px] h-[180px] relative shrink-0">
              <BaseChart type="doughnut" data={chartData} options={chartOptions} />
            </div>

            {/* Custom Interactive Legend List */}
            <div className="flex-grow w-full max-h-[220px] overflow-y-auto">
              <ul className="divide-y divide-gray-100">
                {services.map((service, index) => (
                  <li
                    key={service.description}
                    className="py-2.5 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: PALETTE[index % PALETTE.length] }}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold text-gray-800 truncate">
                        {service.description}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="block text-sm font-bold text-gray-900">
                        {inrFormatter.format(service.totalRevenue)}
                      </span>
                      <span className="block text-xs font-medium text-gray-500">
                        {service.count} {service.count === 1 ? 'job' : 'jobs'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
