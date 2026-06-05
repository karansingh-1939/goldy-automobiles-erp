import React from 'react';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import assert from 'assert';

// Import components and hooks to be tested
import { useSalesDashboard } from '../hooks/useSalesDashboard.js';
import { DateFilterHeader } from '../components/DateFilterHeader.jsx';
import { KpiCard } from '../components/KpiCard.jsx';
import { KpiSection } from '../components/KpiSection.jsx';
import { TopCustomersCard } from '../components/TopCustomersCard.jsx';
import { TopServicesCard } from '../components/TopServicesCard.jsx';
import { RecentSalesTable } from '../components/RecentSalesTable.jsx';
import SalesDashboardContainer from '../SalesDashboardContainer.jsx';

// Mock API module
import * as apiModule from '../services/dashboardApi.js';

describe('Sales Dashboard Frontend Test Suite', () => {
  let fetchMock;
  const mockDate = '2026-06-05';
  const mockResponse = {
    summary: { invoicesToday: 2, invoicesThisMonth: 3, averageInvoiceValue: 2000 },
    topCustomers: [{ customerId: 1, customer: 'Customer A', revenue: 3500, cost: 1300, profit: 2200 }],
    topServices: [{ description: 'Oil Change', count: 2, totalQuantity: 2, totalRevenue: 600 }],
    recentSales: [{ id: 1, invoiceNumber: 'INV-001', invoiceDate: '2026-06-05', grandTotal: 1500, customerName: 'Customer A' }]
  };

  beforeEach(() => {
    fetchMock = jest.spyOn(apiModule, 'fetchSalesDashboard');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  // ==========================================
  // 1. Hook Tests (useSalesDashboard)
  // ==========================================
  describe('useSalesDashboard Hook', () => {
    it('initializes with populated empty state defaults and triggers fetch', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse);

      let hookResult;
      await act(async () => {
        const { result } = renderHook(() => useSalesDashboard(mockDate));
        hookResult = result;
      });

      // Verification of initial state safety (non-null DTO contract)
      assert.equal(hookResult.current.date, mockDate);
      assert.deepEqual(hookResult.current.data, mockResponse);
      assert.equal(hookResult.current.isLoading, false);
      assert.equal(hookResult.current.error, null);
    });

    it('handles request loading and error transitions correctly', async () => {
      const mockError = new Error('Database connection failed.');
      mockError.status = 500;
      fetchMock.mockRejectedValueOnce(mockError);

      let hookResult;
      await act(async () => {
        const { result } = renderHook(() => useSalesDashboard(mockDate));
        hookResult = result;
      });

      assert.equal(hookResult.current.isLoading, false);
      assert.equal(hookResult.current.error.message, 'Database connection failed.');
      assert.equal(hookResult.current.error.status, 500);
    });

    it('triggers manual refresh on execute call', async () => {
      fetchMock.mockResolvedValue(mockResponse);

      let hookResult;
      const { result } = renderHook(() => useSalesDashboard(mockDate));
      hookResult = result;

      await act(async () => {
        hookResult.current.refresh();
      });

      assert.equal(fetchMock.mock.calls.length, 2); // Init fetch + refresh fetch
    });
  });

  // ==========================================
  // 2. Component Tests (DateFilterHeader)
  // ==========================================
  describe('DateFilterHeader Component', () => {
    it('renders date, controlled inputs, and calls triggers', () => {
      const onDateChange = jest.fn();
      const onRefresh = jest.fn();

      render(
        <DateFilterHeader
          date={mockDate}
          onDateChange={onDateChange}
          onRefresh={onRefresh}
          isLoading={false}
        />
      );

      // Verify date display
      const dateInput = screen.getByLabelText(/Select Dashboard Date/i);
      assert.equal(dateInput.value, mockDate);

      // Verify change callback triggers
      fireEvent.change(dateInput, { target: { value: '2026-06-06' } });
      assert.equal(onDateChange.mock.calls[0][0], '2026-06-06');

      // Verify refresh trigger
      const refreshBtn = screen.getByLabelText(/Refresh data/i);
      fireEvent.click(refreshBtn);
      assert.ok(onRefresh.mock.calls.length > 0);
    });
  });

  // ==========================================
  // 3. KPI Component Tests (KpiCard & KpiSection)
  // ==========================================
  describe('KPI Components', () => {
    it('KpiCard renders numerical formatted values and pulse skeletons', () => {
      const { rerender } = render(<KpiCard title="Total" value={100} isLoading={true} />);
      
      // Verify loading pulse renders and actual value is hidden
      const pulseDiv = screen.getByTestId('pulse-loader', { suggest: false }) || document.querySelector('.animate-pulse');
      assert.ok(pulseDiv);

      rerender(<KpiCard title="Total" value={100} isLoading={false} />);
      assert.equal(screen.getByText('100').textContent, '100');
    });

    it('KpiSection handles INR conversion and zero defaults', () => {
      const summary = {
        invoicesToday: 1,
        invoicesThisMonth: 5,
        averageInvoiceValue: 12500.5
      };

      render(<KpiSection summary={summary} isLoading={false} />);

      // Verify localized Indian Rupee layout
      const currencyText = screen.getByText(/₹12,500.50/);
      assert.ok(currencyText);
      assert.equal(screen.getByText('1').textContent, '1');
      assert.equal(screen.getByText('5').textContent, '5');
    });
  });

  // ==========================================
  // 4. Chart Visualization Tests (TopCustomers & Services)
  // ==========================================
  describe('Chart Visualization Cards', () => {
    it('TopCustomersCard handles empty and loaded data states', () => {
      const { rerender } = render(<TopCustomersCard customers={[]} isLoading={false} />);
      assert.ok(screen.getByText('No customer sales data available.'));

      // Populate data and check container
      const populatedCustomers = [{ customerId: 1, customer: 'Customer A', revenue: 100, cost: 50, profit: 50 }];
      rerender(<TopCustomersCard customers={populatedCustomers} isLoading={false} />);
      assert.equal(screen.queryByText('No customer sales data available.'), null);
    });

    it('TopServicesCard renders legend detail strings', () => {
      const populatedServices = [{ description: 'Oil Change', count: 2, totalQuantity: 2, totalRevenue: 600 }];
      render(<TopServicesCard services={populatedServices} isLoading={false} />);
      
      assert.ok(screen.getByText('Oil Change'));
      assert.ok(screen.getByText(/₹600.00/));
      assert.ok(screen.getByText(/2 jobs/));
    });
  });

  // ==========================================
  // 5. Table Component Tests (RecentSalesTable)
  // ==========================================
  describe('RecentSalesTable', () => {
    it('handles empty table placeholders', () => {
      render(<RecentSalesTable sales={[]} isLoading={false} />);
      assert.ok(screen.getByText('No recent sales available.'));
    });

    it('renders invoice lists with formatted currency', () => {
      const mockSales = [
        { id: 1, invoiceNumber: 'INV-001', invoiceDate: '2026-06-05', grandTotal: 1500, customerName: 'Customer A' }
      ];

      render(<RecentSalesTable sales={mockSales} isLoading={false} />);
      
      assert.ok(screen.getByText('INV-001'));
      assert.ok(screen.getByText('Customer A'));
      assert.ok(screen.getByText(/₹1,500.00/));
    });
  });

  // ==========================================
  // 6. Main Coordinator Tests (SalesDashboardContainer)
  // ==========================================
  describe('SalesDashboardContainer', () => {
    it('handles 403 Access Denied views', async () => {
      const authError = new Error('Missing read permission');
      authError.status = 403;
      fetchMock.mockRejectedValueOnce(authError);

      await act(async () => {
        render(<SalesDashboardContainer />);
      });

      assert.ok(screen.getByText(/Access Denied/i));
      assert.ok(screen.getByText(/dashboard.read/i));
    });

    it('renders normal container split layout on success', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse);

      await act(async () => {
        render(<SalesDashboardContainer />);
      });

      // Verify all subsections are mounted
      assert.ok(screen.getByText('Sales Dashboard'));
      assert.ok(screen.getByText('Top Customers (by Value)'));
      assert.ok(screen.getByText('Top Services Performed'));
      assert.ok(screen.getByText('Recent Sales Activity'));
    });
  });
});
