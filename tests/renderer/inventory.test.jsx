import React from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InventoryManager from '../../src/renderer/modules/inventory/InventoryManager.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { useAppStore } from '../../src/renderer/shared/store/use-app-store.js';

it('preserves zero costs and a zero reorder threshold when editing inventory', async () => {
  useAppStore.getState().setToken('test-session', { role: { name: 'Admin' } });
  vi.spyOn(api, 'get').mockResolvedValue({
    data: [
      {
        id: 1,
        sku: 'FREE-1',
        item_name: 'Free part',
        purchase_cost: 0,
        selling_price: 0,
        reorder_level: 0,
        gst_rate: 0,
        current_quantity: 1,
      },
    ],
    pagination: { totalPages: 1, total: 1 },
  });
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: {} });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <InventoryManager />
    </QueryClientProvider>,
  );
  const part = await screen.findByText('Free part');
  fireEvent.click(within(part.closest('tr')).getByRole('button'));
  const form = screen.getByDisplayValue('Free part').closest('form');
  expect(
    within(form)
      .getAllByRole('spinbutton')
      .map((input) => input.value),
  ).toEqual(['0', '0']);
  fireEvent.submit(form);
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith(
      '/api/v1/inventory/items/1',
      expect.objectContaining({
        purchase_cost: 0,
        selling_price: 0,
        reorder_level: 0,
        gst_rate: 0,
      }),
    ),
  );
});
