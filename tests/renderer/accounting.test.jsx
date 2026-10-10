import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AccountingPortal from '../../src/renderer/modules/accounting/AccountingPortal.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';

it('renders trial balance and profit reports using the backend response contracts', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url.includes('trial-balance'))
      return {
        data: {
          ledgers: [
            { ledgerId: 1, ledgerName: 'Workshop Cash', balanceType: 'DEBIT', balance: 125 },
          ],
        },
      };
    if (url.includes('profit-loss'))
      return {
        data: {
          revenue: { items: [{ ledgerName: 'Service income', amount: 250 }] },
          expenses: { items: [{ ledgerName: 'Electricity', amount: 50 }] },
          grossProfit: 250,
          netProfit: 200,
        },
      };
    return { data: [] };
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AccountingPortal />
    </QueryClientProvider>,
  );
  await screen.findByText('Workshop Cash');
  expect(screen.getByText('₹125.00')).toBeTruthy();
  expect(get.mock.calls.some(([url]) => url.includes('trial-balance?asOfDate='))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Profit & Loss' }));
  await screen.findByText('Service income');
  expect(screen.getByText('Electricity')).toBeTruthy();
  expect(screen.getByText('₹200.00')).toBeTruthy();
  expect(get.mock.calls.some(([url]) => /profit-loss\?startDate=.*&endDate=/.test(url))).toBe(true);
});
