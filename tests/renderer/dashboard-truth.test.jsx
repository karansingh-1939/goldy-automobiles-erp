import React from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SalesDashboardContainer from '../../src/renderer/modules/dashboard/SalesDashboardContainer.jsx';

vi.mock('../../src/renderer/shared/components/BaseChart.jsx', () => ({
  BaseChart: ({ data }) => <output aria-label="Chart data">{JSON.stringify(data)}</output>,
}));

function show() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SalesDashboardContainer />
    </QueryClientProvider>,
  );
}

function stubDashboard(financialError = false, operations = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const data = url.includes('/sales')
        ? { summary: {}, topCustomers: [], topServices: [], recentSales: [] }
        : url.includes('/operations')
          ? { openJobCards: 0, completedJobCards: 0, pendingDeliveriesCount: 0, ...operations }
          : url.includes('/financial')
            ? {
                today: { revenue: 0 },
                thisMonth: { revenue: 0, grossProfit: 0, netProfit: 0 },
                outstandingAmount: 0,
              }
            : { totalValuation: 0, lowStockCount: 0, warehouseSummary: [] };
      const failed = financialError && url.includes('/financial');
      return {
        ok: !failed,
        status: failed ? 503 : 200,
        json: async () => (failed ? { error: { message: 'Financial data unavailable' } } : data),
      };
    }),
  );
}

it('shows actual zero metrics in plain words and no decorative charts', async () => {
  stubDashboard();
  show();
  expect((await screen.findByText('Cars in the workshop')).parentElement.textContent).toContain(
    '0',
  );
  expect(screen.getByText('Sales today').parentElement.textContent).toContain('₹0');
  expect(screen.queryAllByLabelText('Chart data')).toHaveLength(0);
  expect(screen.getByText('Nothing needs attention right now.')).toBeTruthy();
});

it('lists promised deliveries in plain words under Needs attention', async () => {
  stubDashboard(false, { openJobCards: 5, completedJobCards: 2, pendingDeliveriesCount: 3 });
  show();
  expect(await screen.findByText('3 cars have a promised delivery date.')).toBeTruthy();
  expect(screen.getByText('Cars in the workshop').parentElement.textContent).toContain('5');
});

it('reports unavailable financial data instead of presenting it as zero revenue', async () => {
  stubDashboard(true);
  show();
  expect(await screen.findByText('Financial data unavailable')).toBeTruthy();
  expect(screen.queryByText('Sales today')).toBeNull();
});
