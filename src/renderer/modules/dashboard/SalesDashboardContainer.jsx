import React, { useEffect } from 'react';
import { useSalesDashboard } from './hooks/useSalesDashboard.js';
import { DateFilterHeader } from './components/DateFilterHeader.jsx';
import { KpiSection } from './components/KpiSection.jsx';
import { TopCustomersCard } from './components/TopCustomersCard.jsx';
import { TopServicesCard } from './components/TopServicesCard.jsx';
import { RecentSalesTable } from './components/RecentSalesTable.jsx';

/**
 * Sales Dashboard Container Page.
 * Coordinates page layout grids, custom hooks execution, error boundaries, and empty/loading states.
 */
export default function SalesDashboardContainer() {
  const {
    date,
    setDate,
    data,
    isLoading,
    error,
    refresh
  } = useSalesDashboard();

  // 1. Handle 401 Unauthorized rejections
  useEffect(() => {
    if (error && error.status === 401) {
      sessionStorage.removeItem('goldy_auth_token');
      window.location.href = '/index.html';
    }
  }, [error]);

  if (error) {
    // 2. Handle 401 Redirect render state
    if (error.status === 401) {
      return (
        <div className="flex items-center justify-center min-h-[400px]" aria-live="polite">
          <p className="text-sm text-gray-500 font-medium">Redirecting to login...</p>
        </div>
      );
    }

    // 3. Handle 403 Forbidden permission rejections
    if (error.status === 403) {
      return (
        <main className="max-w-7xl mx-auto p-6" aria-labelledby="permission-error-title">
          <div className="flex flex-col items-center justify-center p-12 bg-red-50 border border-red-200 rounded-xl text-center shadow-sm">
            <svg
              className="h-12 w-12 text-red-500 mb-4"
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
                d="M12 15v2m0-8V5m0 16a9 9 0 110-18 9 9 0 010 18z"
              />
            </svg>
            <h2 id="permission-error-title" className="text-xl font-bold text-red-800">
              Access Denied
            </h2>
            <p className="text-sm text-red-600 mt-2 max-w-md">
              You do not have the required permissions ('dashboard.read') to view the Sales Dashboard. Please contact your administrator.
            </p>
          </div>
        </main>
      );
    }

    // 4. Handle 500 / Unexpected connection crashes
    return (
      <main className="max-w-7xl mx-auto p-6" aria-labelledby="load-error-title">
        <div className="flex flex-col items-center justify-center p-12 bg-gray-50 border border-gray-200 rounded-xl text-center shadow-sm">
          <svg
            className="h-12 w-12 text-gray-400 mb-4"
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
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h2 id="load-error-title" className="text-xl font-bold text-gray-900">
            Failed to Load Sales Dashboard
          </h2>
          <p className="text-sm text-gray-500 mt-2 mb-6 max-w-md">
            {error.message || 'An unexpected error occurred while loading dashboard metrics.'}
          </p>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center px-5 py-2.5 bg-blue-600 border border-transparent rounded-lg font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  // 5. Successful Render layout (using loaded or null-safe initial state)
  return (
    <main className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Row 1: Header Filter */}
      <DateFilterHeader
        date={date}
        onDateChange={setDate}
        onRefresh={refresh}
        isLoading={isLoading}
      />

      {/* Row 2: KPI Metrics */}
      <KpiSection
        summary={data.summary}
        isLoading={isLoading}
      />

      {/* Row 3: Graphic Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopCustomersCard
          customers={data.topCustomers}
          isLoading={isLoading}
        />
        <TopServicesCard
          services={data.topServices}
          isLoading={isLoading}
        />
      </div>

      {/* Row 4: Recent Sales List Table */}
      <RecentSalesTable
        sales={data.recentSales}
        isLoading={isLoading}
      />
    </main>
  );
}
