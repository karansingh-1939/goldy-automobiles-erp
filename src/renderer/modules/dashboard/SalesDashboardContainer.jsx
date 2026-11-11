import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { useSalesDashboard } from './hooks/use-sales-dashboard.js';
import { DateFilterHeader } from './components/DateFilterHeader.jsx';

import { KpiCard } from './components/KpiCard.jsx';
import { TopCustomersCard } from './components/TopCustomersCard.jsx';
import { TopServicesCard } from './components/TopServicesCard.jsx';
import { RecentSalesTable } from './components/RecentSalesTable.jsx';
import { BackupHealthBanner } from './components/BackupHealthBanner.jsx';
import {
  AlertTriangle,
  UserPlus,
  Database,
  Wrench,
  Wallet,
  ShoppingCart,
  Package,
} from 'lucide-react';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export default function SalesDashboardContainer() {
  const {
    date,
    setDate,
    data,
    isLoading: salesLoading,
    error: salesError,
    refresh: refreshSales,
  } = useSalesDashboard();

  // 1. Parallel fetch extra metrics using TanStack Query
  const {
    data: operationsData,
    isLoading: opsLoading,
    error: operationsError,
    refetch: refreshOperations,
  } = useQuery({
    queryKey: ['dashboard-operations', date],
    queryFn: () => api.get(`/api/v1/dashboard/operations?date=${date}`),
    enabled: !!date,
    retry: false,
  });

  const {
    data: financialData,
    isLoading: finLoading,
    error: financialError,
    refetch: refreshFinancial,
  } = useQuery({
    queryKey: ['dashboard-financial', date],
    queryFn: () => api.get(`/api/v1/dashboard/financial?date=${date}`),
    enabled: !!date,
    retry: false,
  });

  const {
    data: inventoryData,
    isLoading: invLoading,
    error: inventoryError,
    refetch: refreshInventory,
  } = useQuery({
    queryKey: ['dashboard-inventory'],
    queryFn: () => api.get('/api/v1/dashboard/inventory'),
    retry: false,
  });

  const error = salesError || operationsError || financialError || inventoryError;
  const refresh = () => {
    refreshSales();
    refreshOperations();
    refreshFinancial();
    refreshInventory();
  };

  // Handle Auth Expired redirection
  useEffect(() => {
    if (error && error.status === 401) {
      sessionStorage.removeItem('goldy_auth_token');
      window.location.href = '/index.html';
    }
  }, [error]);

  if (error) {
    if (error.status === 401) {
      return (
        <div className="flex items-center justify-center min-h-[400px]" aria-live="polite">
          <p className="text-sm text-gray-500 font-medium">Redirecting to login...</p>
        </div>
      );
    }

    if (error.status === 403) {
      return (
        <main className="max-w-7xl mx-auto p-6" aria-labelledby="permission-error-title">
          <div className="flex flex-col items-center justify-center p-12 bg-red-50 border border-red-200 rounded-xl text-center shadow-sm">
            <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
            <h2 id="permission-error-title" className="text-xl font-bold text-red-800">
              Access Denied
            </h2>
            <p className="text-sm text-red-600 mt-2 max-w-md">
              You do not have the required permissions ('dashboard.read') to view the Sales
              Dashboard.
            </p>
          </div>
        </main>
      );
    }

    return (
      <main className="max-w-7xl mx-auto p-6" aria-labelledby="load-error-title">
        <div className="flex flex-col items-center justify-center p-12 bg-gray-50 border border-gray-200 rounded-xl text-center shadow-sm">
          <AlertTriangle className="h-12 w-12 text-gray-400 mb-4" />
          <h2 id="load-error-title" className="text-xl font-bold text-gray-900">
            Failed to Load Dashboard
          </h2>
          <p className="text-sm text-gray-500 mt-2 mb-6 max-w-md">
            {error.message || 'An unexpected error occurred while loading dashboard metrics.'}
          </p>
          <button
            type="button"
            onClick={refresh}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition shadow-sm"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  // Bind Metrics with null-safeties
  const todayRevenue = financialData?.today?.revenue || 0;
  const monthlyRevenue = financialData?.thisMonth?.revenue || 0;
  const netProfit = financialData?.thisMonth?.netProfit || 0;
  const outstandingAmount = financialData?.outstandingAmount || 0;

  const openJobCards = operationsData?.openJobCards || 0;
  const pendingDeliveries = operationsData?.pendingDeliveriesCount || 0;

  const lowStockCount = inventoryData?.lowStockCount || 0;
  const totalValuation = inventoryData?.totalValuation || 0;

  const overallLoading = salesLoading || opsLoading || finLoading || invLoading;

  // Plain-language list of things the owner should act on.
  const alerts = [];
  if (lowStockCount > 0) {
    alerts.push({
      id: 'low-stock',
      severity: 'high',
      message: `${lowStockCount} ${lowStockCount === 1 ? 'item is' : 'items are'} running low. Time to reorder.`,
      href: '#/inventory',
      action: 'See stock',
    });
  }
  if (outstandingAmount > 100000) {
    alerts.push({
      id: 'receivables',
      severity: 'medium',
      message: `Customers owe you ${inrFormatter.format(outstandingAmount)} in total.`,
      href: '#/cash-receivables',
      action: 'See dues',
    });
  }
  if (pendingDeliveries > 0) {
    alerts.push({
      id: 'deliveries',
      severity: 'low',
      message: `${pendingDeliveries} ${pendingDeliveries === 1 ? 'car has' : 'cars have'} a promised delivery date.`,
      href: '#/workshop',
      action: 'See cars',
    });
  }

  const shortcuts = [
    ['#/job-cards', Wrench, 'New job card'],
    ['#/money', Wallet, 'Money in / out'],
    ['#/customers', UserPlus, 'Add customer'],
    ['#/purchasing', ShoppingCart, 'Buy stock'],
    ['#/inventory', Package, 'Stock list'],
    ['#/settings', Database, 'Back up data'],
  ];

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-6">
      <BackupHealthBanner />
      <DateFilterHeader
        date={date}
        onDateChange={setDate}
        onRefresh={refresh}
        isLoading={overallLoading}
      />

      <section
        aria-labelledby="shortcuts-title"
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm"
      >
        <h2
          id="shortcuts-title"
          className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3"
        >
          Start something
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {shortcuts.map(([href, Icon, label]) => (
            <a
              key={href}
              href={href}
              className="flex flex-col items-center justify-center gap-2 p-4 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-brand-50 hover:border-brand-300 dark:hover:bg-gray-800 transition-colors focus-ring"
            >
              <Icon className="h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {label}
              </span>
            </a>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          title="Sales today"
          value={inrFormatter.format(todayRevenue)}
          isLoading={overallLoading}
        />
        <KpiCard
          title="Sales this month"
          value={inrFormatter.format(monthlyRevenue)}
          isLoading={overallLoading}
        />
        <KpiCard
          title="Profit this month (after expenses)"
          value={inrFormatter.format(netProfit)}
          isLoading={overallLoading}
        />
        <KpiCard
          title="Customers owe you"
          value={inrFormatter.format(outstandingAmount)}
          isLoading={overallLoading}
        />
        <KpiCard title="Cars in the workshop" value={openJobCards} isLoading={overallLoading} />
        <KpiCard
          title="Stock value"
          value={inrFormatter.format(totalValuation)}
          isLoading={overallLoading}
        />
      </div>

      <section
        aria-labelledby="attention-title"
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm"
      >
        <h2
          id="attention-title"
          className="flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-gray-200 mb-3"
        >
          <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
          Needs attention
        </h2>
        {alerts.length ? (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span
                  className={`text-base ${
                    alert.severity === 'high'
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-gray-800 dark:text-gray-200'
                  }`}
                >
                  {alert.message}
                </span>
                <a
                  href={alert.href}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  {alert.action}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-base text-gray-600 dark:text-gray-400">
            Nothing needs attention right now.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopCustomersCard customers={data.topCustomers} isLoading={overallLoading} />
        <TopServicesCard services={data.topServices} isLoading={overallLoading} />
      </div>

      <RecentSalesTable sales={data.recentSales} isLoading={overallLoading} />
    </main>
  );
}
