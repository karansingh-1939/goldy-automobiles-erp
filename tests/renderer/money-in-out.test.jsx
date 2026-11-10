import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MoneyInOut from '../../src/renderer/modules/accounting/MoneyInOut.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { useAppStore } from '../../src/renderer/shared/store/use-app-store.js';

it('shows cash and bank balances and records owner money in plain words', async () => {
  useAppStore.getState().setToken('test-session', { role: { name: 'Admin' } });
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: [
      { id: 1, name: 'Cash in Hand', kind: 'CASH', balance: 1200 },
      { id: 30, name: 'Test Bank Current', kind: 'BANK', balance: 5000 },
    ],
  }));
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MoneyInOut />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Cash in hand')).toBeTruthy();
  expect(screen.getByText('Test Bank Current')).toBeTruthy();

  fireEvent.click(screen.getByText('Money In'));
  fireEvent.click(screen.getByText('I put my own money in'));
  fireEvent.change(screen.getAllByLabelText('Amount (₹)')[0], { target: { value: '2500' } });
  fireEvent.change(screen.getAllByLabelText('Cash or bank')[0], { target: { value: '30' } });
  fireEvent.click(screen.getByText('Save'));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/v1/accounting/money-entries',
      expect.objectContaining({ direction: 'IN', accountId: 30, party: 'owner', amount: 2500 }),
    ),
  );
});
