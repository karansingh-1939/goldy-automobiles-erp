import React from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

it('shows actual zero metrics and never substitutes invented chart history or jobs', async () => {
  stubDashboard();
  show();
  await waitFor(() => expect(screen.queryAllByLabelText('Chart data').length).toBeGreaterThan(0));
  const charts = screen.getAllByLabelText('Chart data').map((node) => JSON.parse(node.textContent));
  expect(charts.flatMap((chart) => chart.datasets.flatMap((dataset) => dataset.data))).toEqual([
    0, 0, 0, 0,
  ]);
  expect(screen.getByText('No warehouse inventory data.')).toBeTruthy();
  expect(screen.getByText('Active Job Cards').parentElement.textContent).toContain('0');
});

it('does not count open cards with a delivery promise twice in the distribution chart', async () => {
  stubDashboard(false, { openJobCards: 5, completedJobCards: 2, pendingDeliveriesCount: 3 });
  show();
  await screen.findByText('Deliveries: 3 open job cards have a promised delivery date.');
  const chart = screen
    .getAllByLabelText('Chart data')
    .map((node) => JSON.parse(node.textContent))
    .find((data) => data.labels.includes('Open with delivery promise'));
  expect(chart.datasets[0].data).toEqual([2, 2, 3]);
});

it('reports unavailable financial data instead of presenting it as zero revenue', async () => {
  stubDashboard(true);
  show();
  expect(await screen.findByText('Financial data unavailable')).toBeTruthy();
  expect(screen.queryByText("Today's Revenue")).toBeNull();
});
