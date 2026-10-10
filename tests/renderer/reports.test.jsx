import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportsManager from '../../src/renderer/modules/reports/ReportsManager.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';

function renderReports() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ReportsManager />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.useRealTimers());

it('starts the report on the first local calendar day of the month', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 11, 1, 0));
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
  renderReports();
  await screen.findByText('No invoices recorded in this filing range.');
  expect(get).toHaveBeenCalledWith('/api/v1/gst/summary?dateFrom=2026-10-01&dateTo=2026-10-11');
});

it('shows ledger closing balances and retained earnings from the actual report contracts', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url.includes('trial-balance'))
      return {
        data: {
          ledgers: [
            { ledgerName: 'Workshop Cash', groupName: 'Cash', balance: 125, balanceType: 'DEBIT' },
          ],
          totals: { debits: 125, credits: 0 },
        },
      };
    if (url.includes('balance-sheet'))
      return {
        data: {
          assets: { items: [], total: 50 },
          liabilities: { items: [], total: 0 },
          equity: {
            items: [{ ledgerName: 'Retained Earnings (Dynamic P&L)', amount: 50 }],
            total: 50,
          },
          totals: { isBalanced: true },
        },
      };
    return { data: [] };
  });
  renderReports();
  fireEvent.click(screen.getByRole('button', { name: /financial statements/i }));
  const cash = await screen.findByText('Workshop Cash');
  expect(within(cash.closest('tr')).getByText('₹125.00')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /balance sheet/i }));
  await screen.findByText('Retained Earnings (Dynamic P&L) (Equity)');
  expect(screen.queryByText('Retained Earnings (P&L cumulative)')).toBeNull();
});

it('shows interstate tax and distinguishes credit notes in the GST register', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url.includes('gstr1')
      ? [
          {
            documentType: 'CREDIT_NOTE',
            invoiceNumber: 'CN-1',
            originalInvoiceNumber: 'INV-1',
            customerName: 'Interstate Customer',
            taxableValue: -100,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: -18,
            lineTotal: -118,
          },
        ]
      : { taxableValue: -100, cgstAmount: 0, sgstAmount: 0, igstAmount: -18, totalTax: -18 },
  }));
  renderReports();
  await screen.findByText('CN-1');
  expect(screen.getByRole('columnheader', { name: 'IGST (₹)' })).toBeTruthy();
  expect(screen.getByText('CREDIT_NOTE')).toBeTruthy();
  expect(screen.getByText('INV-1')).toBeTruthy();
});

it('reports API failures instead of presenting a successful empty register', async () => {
  vi.spyOn(api, 'get').mockRejectedValue(new Error('Report access denied'));
  renderReports();
  expect((await screen.findByRole('alert')).textContent).toContain('Report access denied');
  expect(screen.getByRole('button', { name: 'Download CSV' }).disabled).toBe(true);
});
