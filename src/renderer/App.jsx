import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './shared/api/query-client.js';
import { useAppStore } from './shared/store/use-app-store.js';
import Layout from './shared/components/Layout.jsx';
import Login from './modules/auth/Login.jsx';
import SalesDashboardContainer from './modules/dashboard/SalesDashboardContainer.jsx';

// Active Module Pages
import CustomerManager from './modules/customers/CustomerManager.jsx';
import VehicleManager from './modules/vehicles/VehicleManager.jsx';
import SupplierManager from './modules/suppliers/SupplierManager.jsx';
import InventoryManager from './modules/inventory/InventoryManager.jsx';
import PurchasingManager from './modules/purchasing/PurchasingManager.jsx';
import SalesOrderManager from './modules/sales/SalesOrderManager.jsx';
import JobCardManager from './modules/job-cards/JobCardManager.jsx';
import WarrantyManager from './modules/warranties/WarrantyManager.jsx';
import ReturnsManager from './modules/returns/ReturnsManager.jsx';
import AccountingPortal from './modules/accounting/AccountingPortal.jsx';
import ReportsManager from './modules/reports/ReportsManager.jsx';
import SettingsPortal from './modules/settings/SettingsPortal.jsx';
import WorkshopBoard from './modules/workshop/WorkshopBoard.jsx';

export default function App() {
  const token = useAppStore((state) => state.token);

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          {token ? (
            // AUTHENTICATED ROUTES
            <Route element={<Layout />}>
              <Route path="/" element={<SalesDashboardContainer />} />
              <Route path="/job-cards" element={<JobCardManager />} />
              <Route path="/workshop" element={<WorkshopBoard />} />
              <Route path="/sales-orders" element={<SalesOrderManager />} />
              <Route path="/inventory" element={<InventoryManager />} />
              <Route path="/purchasing" element={<PurchasingManager />} />
              <Route path="/accounting" element={<AccountingPortal />} />
              <Route path="/reports" element={<ReportsManager />} />
              <Route path="/customers" element={<CustomerManager />} />
              <Route path="/vehicles" element={<VehicleManager />} />
              <Route path="/suppliers" element={<SupplierManager />} />
              <Route path="/warranties" element={<WarrantyManager />} />
              <Route path="/returns" element={<ReturnsManager />} />
              <Route path="/settings" element={<SettingsPortal />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          ) : (
            // UNAUTHENTICATED ROUTES
            <>
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          )}
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}
