import React from 'react';

/**
 * Controlled DateFilterHeader Component.
 * Contains page title, native date picker, and manual refresh button.
 *
 * @param {object} props
 * @param {string} props.date - The selected date string (YYYY-MM-DD)
 * @param {function} props.onDateChange - Callback fired on date input change
 * @param {function} props.onRefresh - Callback fired on refresh button click
 * @param {boolean} props.isLoading - Whether the page is currently fetching data
 */
export function DateFilterHeader({ date, onDateChange, onRefresh, isLoading }) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-200">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Sales Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Real-time summary of sales, top performance metrics, and recent work invoices.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <label htmlFor="dashboard-date-picker" className="sr-only">
            Select Dashboard Date
          </label>
          <input
            id="dashboard-date-picker"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            disabled={isLoading}
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400 transition"
          />
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="Refresh data"
          className="inline-flex items-center justify-center p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition"
        >
          <svg
            className={`h-5 w-5 ${isLoading ? 'animate-spin text-blue-550' : 'text-gray-500'}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M21 20v-5h-.581m0 0a8.003 8.003 0 11-15.357-2"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
