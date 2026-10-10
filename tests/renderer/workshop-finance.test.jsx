import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkshopFinance from '../../src/renderer/modules/accounting/WorkshopFinance.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { useAppStore } from '../../src/renderer/shared/store/use-app-store.js';
import { localDate } from '../../public/local-date.js';

it('shows ledger-reconciled dues and saves a counted cash variance with its explanation', async () => {
  useAppStore.getState().setToken('test-session', { role: { name: 'Admin' } });
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url.includes('receivable-ageing')
      ? {
          date: localDate(),
          buckets: { '0–30': 60, unaged: 0 },
          totalDue: 60,
          documents: [],
          customers: [],
        }
      : { opening: 100, cashIn: 10, cashOut: 20, expectedClosing: 90, counts: [] },
  }));
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WorkshopFinance />
    </QueryClientProvider>,
  );
  await screen.findByText('Expected closing cash');
  fireEvent.change(screen.getByLabelText('Counted cash (₹)'), { target: { value: '85' } });
  fireEvent.change(screen.getByLabelText('Count notes'), {
    target: { value: 'Five rupees short.' },
  });
  fireEvent.click(screen.getByText('Save cash count'));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/v1/accounting/daily-cash', {
      date: localDate(),
      countedCash: 85,
      notes: 'Five rupees short.',
    }),
  );
  expect(await screen.findByText('Cash count saved.')).toBeTruthy();
});
