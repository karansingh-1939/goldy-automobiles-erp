import React from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReturnsManager from '../../src/renderer/modules/returns/ReturnsManager.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';

it('creates a return with the real invoice ID and its sold part and batch', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url.startsWith('/api/v1/job-cards?'))
      return {
        data: [
          {
            id: 7,
            job_card_number: 'JC-7',
            customer_name: 'Workshop Customer',
            status: 'COMPLETED',
          },
        ],
      };
    if (url === '/api/v1/job-cards/7')
      return { data: { invoice: { id: 42, status: 'FINALIZED' } } };
    if (url === '/api/v1/invoices/42')
      return {
        data: {
          id: 42,
          status: 'FINALIZED',
          items: [
            {
              inventory_item_id: 3,
              batch_id: 9,
              description: 'Sold Filter',
              quantity: 2,
            },
          ],
        },
      };
    return { data: [] };
  });
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 1 } });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ReturnsManager />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'New Return' }));
  await screen.findByRole('option', { name: 'JC-7 (Owner: Workshop Customer)' });
  fireEvent.change(screen.getByLabelText('Select Invoice *'), { target: { value: '7' } });
  await screen.findByRole('option', { name: 'Sold Filter (sold: 2)' });
  fireEvent.change(screen.getByLabelText('Select Returned Part *'), { target: { value: '3' } });
  fireEvent.submit(screen.getByLabelText('Return Quantity *').closest('form'));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/v1/returns/customer', {
      invoiceId: 42,
      items: [{ itemId: 3, quantity: 1, batchId: 9, condition: 'GOOD' }],
    }),
  );
});
