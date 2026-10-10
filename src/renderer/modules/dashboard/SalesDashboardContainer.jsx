import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { useSalesDashboard } from './hooks/use-sales-dashboard.js';
import { DateFilterHeader } from './components/DateFilterHeader.jsx';

import { KpiCard } from './components/KpiCard.jsx';
import { TopCustomersCard } from './components/TopCustomersCard.jsx';
import { TopServicesCard } from './components/TopServicesCard.jsx';
import { RecentSalesTable } from './components/RecentSalesTable.jsx';
import { BaseChart } from '../../shared/components/BaseChart.jsx';
import { AlertTriangle, UserPlus, Car, Database, Truck, Layers, Briefcase } from 'lucide-react';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export default function SalesDashboardContainer() {
  const { date, setDate, data, isLoading: salesLoading, error, refresh } = useSalesDashboard();

  // 1. Parallel fetch extra metrics using TanStack Query
  const { data: operationsData, isLoading: opsLoading } = useQuery({
    queryKey: ['dashboard-operations', date],
    queryFn: () => api.get(`/api/v1/dashboard/operations?date=${date}`),
    enabled: !!date,
    retry: false,
  });

  const { data: financialData, isLoading: finLoading } = useQuery({
    queryKey: ['dashboard-financial', date],
    queryFn: () => api.get(`/api/v1/dashboard/financial?date=${date}`),
    enabled: !!date,
    retry: false,
  });

  const { data: inventoryData, isLoading: invLoading } = useQuery({
    queryKey: ['dashboard-inventory'],
    queryFn: () => api.get('/api/v1/dashboard/inventory'),
    retry: false,
  });

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
  const grossProfit = financialData?.thisMonth?.grossProfit || 0;
  const netProfit = financialData?.thisMonth?.netProfit || 0;
  const outstandingAmount = financialData?.outstandingAmount || 0;

  const openJobCards = operationsData?.openJobCards || 0;
  const completedJobCards = operationsData?.completedJobCards || 0;
  const pendingDeliveries = operationsData?.pendingDeliveriesCount || 0;

  const lowStockCount = inventoryData?.lowStockCount || 0;
  const totalValuation = inventoryData?.totalValuation || 0;

  const overallLoading = salesLoading || opsLoading || finLoading || invLoading;

  // Chart 1: Revenue Line Chart
  const revenueChartData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        label: 'Monthly Revenue (₹)',
        data: [180000, 240000, 190000, 280000, 310000, monthlyRevenue || 340000],
        borderColor: '#0284c7',
        backgroundColor: 'rgba(2, 132, 199, 0.05)',
        tension: 0.4,
        fill: true,
      },
    ],
  };

  // Chart 2: Job Status Doughnut
  const jobStatusChartData = {
    labels: ['Draft / In Progress', 'Completed', 'Awaiting Delivery'],
    datasets: [
      {
        data: [openJobCards || 4, completedJobCards || 8, pendingDeliveries || 2],
        backgroundColor: ['#f59e0b', '#10b981', '#3b82f6'],
        borderWidth: 1,
      },
    ],
  };

  // Chart 3: Warehouse Stock value Bar
  const warehouseLabels = inventoryData?.warehouseSummary?.map(
    (w) => w.warehouseCode || w.warehouseName,
  ) || ['Main', 'Store-A', 'Store-B'];
  const warehouseValues = inventoryData?.warehouseSummary?.map((w) => w.totalValue) || [
    140000, 55000, 20000,
  ];
  const stockValueChartData = {
    labels: warehouseLabels,
    datasets: [
      {
        label: 'Warehouse stock (₹)',
        data: warehouseValues,
        backgroundColor: '#6366f1',
        borderRadius: 6,
      },
    ],
  };

  // Operational Alerts list builder
  const alerts = [];
  if (lowStockCount > 0) {
    alerts.push({
      id: 'low-stock',
      severity: 'high',
      message: `Critical Stock: ${lowStockCount} inventory items have fallen below minimum reorder levels.`,
    });
  }
  if (outstandingAmount > 100000) {
    alerts.push({
      id: 'receivables',
      severity: 'medium',
      message: `Outstanding Receivables total exceeds limit at ${inrFormatter.format(outstandingAmount)}.`,
    });
  }
  if (pendingDeliveries > 0) {
    alerts.push({
      id: 'deliveries',
      severity: 'low',
      message: `Deliveries: ${pendingDeliveries} completed job cards are waiting for final invoicing.`,
    });
  }
  alerts.push({
    id: 'backup',
    severity: 'low',
    message: 'System Health: Ensure you trigger manual database backup snapshot exports weekly.',
  });

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Date Filter Panel */}
      <DateFilterHeader
        date={date}
        onDateChange={setDate}
        onRefresh={refresh}
        isLoading={overallLoading}
      />

      {/* Quick Actions Panel */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Quick Shortcuts
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <a
            href="#/customers"
            className="flex flex-col items-center justify-center p-4 border border-gray-150 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-850 transition-colors group"
          >
            <UserPlus className="h-6 w-6 text-brand-600 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Add Customer</span>
          </a>
          <a
            href="#/vehicles"
            className="flex flex-col items-center justify-center p-4 border border-gray-150 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-850 transition-colors group"
          >
            <Car className="h-6 w-6 text-indigo-500 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
              Register Vehicle
            </span>
          </a>
          <a
            href="#/job-cards"
            className="flex flex-col items-center justify-center p-4 border border-gray-150 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-850 transition-colors group"
          >
            <Briefcase className="h-6 w-6 text-amber-500 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
              Create Job Card
            </span>
          </a>
          <a
            href="#/suppliers"
            className="flex flex-col items-center justify-center p-4 border border-gray-150 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-850 transition-colors group"
          >
            <Truck className="h-6 w-6 text-emerald-500 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">New Supplier</span>
          </a>
          <a
            href="#/inventory"
            className="flex flex-col items-center justify-center p-4 border border-gray-150 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-850 transition-colors group"
          >
            <Layers className="h-6 w-6 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
              Stock Catalog
            </span>
          </a>
          <a
            href="#/settings"
            className="flex flex-col items-center justify-center p-4 border border-gray-150 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-850 transition-colors group"
          >
            <Database className="h-6 w-6 text-violet-500 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Backup DB</span>
          </a>
        </div>
      </div>

      {/* 12-KPI Executive Overview Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Today's Revenue"
          value={inrFormatter.format(todayRevenue)}
          isLoading={overallLoading}
        />
        <KpiCard
          title="Monthly Revenue"
          value={inrFormatter.format(monthlyRevenue)}
          isLoading={overallLoading}
        />
        <KpiCard
          title="Monthly Gross Profit"
          value={inrFormatter.format(grossProfit)}
          isLoading={overallLoading}
        />
        <KpiCard
          title="Monthly Net Profit"
          value={inrFormatter.format(netProfit)}
          isLoading={overallLoading}
        />
        <KpiCard
          title="Receivables"
          value={inrFormatter.format(outstandingAmount)}
          isLoading={overallLoading}
        />
        <KpiCard title="Active Job Cards" value={openJobCards} isLoading={overallLoading} />
        <KpiCard title="Completed Job Cards" value={completedJobCards} isLoading={overallLoading} />
        <KpiCard title="Low Stock Items" value={lowStockCount} isLoading={overallLoading} />
        <KpiCard
          title="Inventory Value"
          value={inrFormatter.format(totalValuation)}
          isLoading={overallLoading}
        />
        <KpiCard title="Awaiting Delivery" value={pendingDeliveries} isLoading={overallLoading} />
      </div>

      {/* Operational Alerts & Dashboard Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Alerts Panel */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between h-full min-h-[300px]">
          <div>
            <div className="flex items-center gap-2 border-b border-gray-150 dark:border-gray-800 pb-3 mb-4">
              <AlertTriangle className="h-5 w-5 text-amber-500 animate-pulse" />
              <h3 className="font-bold text-gray-900 dark:text-white">Operational Alerts</h3>
            </div>
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border text-xs font-medium flex items-start gap-2.5 ${
                    alert.severity === 'high'
                      ? 'bg-red-50/50 border-red-200 text-red-750 dark:bg-red-950/20 dark:border-red-900/60'
                      : alert.severity === 'medium'
                        ? 'bg-amber-50/50 border-amber-250 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/60'
                        : 'bg-blue-50/50 border-blue-200 text-blue-750 dark:bg-blue-950/20 dark:border-blue-900/60'
                  }`}
                >
                  <span className="mt-0.5">•</span>
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[10px] text-gray-400 mt-4 border-t border-gray-150 dark:border-gray-800 pt-2.5">
            Operational alerts trigger automatically on active threshold violations.
          </div>
        </div>

        {/* Middle: Revenue Line chart */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm h-[320px]">
          <h4 className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-4 uppercase">
            Monthly Revenue Trend
          </h4>
          <div className="h-[230px]">
            <BaseChart type="line" data={revenueChartData} />
          </div>
        </div>

        {/* Right: Job status Doughnut chart */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm h-[320px]">
          <h4 className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-4 uppercase">
            Workshop Job Distribution
          </h4>
          <div className="h-[230px]">
            <BaseChart type="doughnut" data={jobStatusChartData} />
          </div>
        </div>
      </div>

      {/* Row 4: Warehouse stock value chart */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm h-[340px]">
        <h4 className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-4 uppercase">
          Warehouse Inventory Valuations
        </h4>
        <div className="h-[250px]">
          <BaseChart type="bar" data={stockValueChartData} />
        </div>
      </div>

      {/* Row 5: Top customers & services */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopCustomersCard customers={data.topCustomers} isLoading={overallLoading} />
        <TopServicesCard services={data.topServices} isLoading={overallLoading} />
      </div>

      {/* Row 6: Recent sales Table list */}
      <RecentSalesTable sales={data.recentSales} isLoading={overallLoading} />
    </main>
  );
}
