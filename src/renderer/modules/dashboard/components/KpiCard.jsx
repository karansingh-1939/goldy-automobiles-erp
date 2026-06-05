import React from 'react';

/**
 * Reusable KPI Card Component.
 * Supports skeleton loading states to prevent layout shifts.
 * 
 * @param {object} props
 * @param {string} props.title - The label of the KPI metric
 * @param {string|number} props.value - The resolved metric value
 * @param {boolean} props.isLoading - Whether the card is in a loading state
 */
export function KpiCard({ title, value, isLoading }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col justify-between min-h-[120px]">
      <span className="text-sm font-medium text-gray-500 tracking-wide uppercase">
        {title}
      </span>
      <div className="mt-2">
        {isLoading ? (
          <div className="h-9 w-2/3 bg-gray-250 rounded animate-pulse" aria-hidden="true" />
        ) : (
          <span className="text-3xl font-bold text-gray-900 tracking-tight">
            {value}
          </span>
        )}
      </div>
    </div>
  );
}
