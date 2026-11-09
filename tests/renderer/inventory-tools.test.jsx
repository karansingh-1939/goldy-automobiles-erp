import React from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockVerificationManager from '../../src/renderer/modules/inventory/StockVerificationManager.jsx';
import StockOperations from '../../src/renderer/modules/inventory/StockOperations.jsx';
import FixedAssetManager from '../../src/renderer/modules/inventory/FixedAssetManager.jsx';
import MasterManager from '../../src/renderer/modules/masters/MasterManager.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { useAppStore } from '../../src/renderer/shared/store/use-app-store.js';
function mount(node) {
  useAppStore.getState().setToken('test', { role: { name: 'Admin' } });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
it('keeps invalid legacy master selectors on a valid reference screen', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: [], pagination: { totalPages: 1 } });
  mount(<MasterManager resource="not-a-master" />);
  expect(await screen.findByRole('heading', { name: 'Warehouses' })).toBeTruthy();
});
it('shows real verification quantities and approves a pending count', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url.includes('/verifications')
      ? [
          {
            id: 4,
            verification_number: 'VER-4',
            item_name: 'Filter',
            previous_quantity: 8,
            counted_quantity: 5,
            difference: -3,
            status: 'PENDING',
          },
        ]
      : [],
    pagination: { totalPages: 1 },
  }));
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
  mount(<StockVerificationManager />);
  expect(await screen.findByText('VER-4')).toBeTruthy();
  expect(screen.getByText('-3')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Approve VER-4' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/v1/inventory/verifications/4/approve', {}),
  );
});
it('posts opening stock to the selected warehouse without a hardcoded location', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url.startsWith('/api/v1/warehouses')
      ? [{ id: 7, name: 'Annex' }]
      : url.startsWith('/api/v1/inventory/items')
        ? [{ id: 3, item_name: 'Filter', sku: 'F' }]
        : [],
    pagination: { totalPages: 1 },
  }));
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
  mount(<StockOperations />);
  await screen.findByRole('option', { name: 'Annex' });
  fireEvent.change(screen.getByLabelText('Item'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Warehouse'), { target: { value: '7' } });
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText('Unit cost'), { target: { value: '80' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post opening stock' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/v1/inventory/opening-stock',
      expect.objectContaining({ item_id: 3, warehouse_id: 7, quantity: 5, unit_cost: 80 }),
    ),
  );
});
it('keeps asset registration failures visible with entered values intact', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: [], pagination: { totalPages: 1 } });
  vi.spyOn(api, 'post').mockRejectedValue(new Error('Duplicate asset SKU'));
  mount(<FixedAssetManager />);
  fireEvent.change(screen.getByLabelText('Asset name'), { target: { value: 'Compressor' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Register asset' }).closest('form'));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Duplicate asset SKU');
  expect(screen.getByLabelText('Asset name').value).toBe('Compressor');
});
it('preserves cleared optional warehouse fields when updating a reference master', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: [{ id: 7, name: 'Annex', code: 'AN', address: 'Old', is_active: 1 }],
    pagination: { totalPages: 1 },
  });
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: {} });
  mount(<MasterManager resource="warehouses" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Annex' }));
  fireEvent.change(screen.getByLabelText('Address'), { target: { value: '' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Update record' }).closest('form'));
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith(
      '/api/v1/warehouses/7',
      expect.objectContaining({ address: '' }),
    ),
  );
});
