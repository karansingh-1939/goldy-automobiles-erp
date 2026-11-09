import React from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RemoteSelect from '../../src/renderer/shared/components/RemoteSelect.jsx';
import PurchaseReceiptForm from '../../src/renderer/modules/purchasing/PurchaseReceiptForm.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { invalidateInventory } from '../../src/renderer/shared/api/inventory-cache.js';
import MasterManager from '../../src/renderer/modules/masters/MasterManager.jsx';
import { useAppStore } from '../../src/renderer/shared/store/use-app-store.js';

it('editing a warehouse refreshes cached selectors in stock and sales screens', async () => {
  useAppStore.getState().setToken('test', { role: { name: 'Admin' } });
  vi.spyOn(api, 'get').mockResolvedValue({
    data: [{ id: 7, name: 'Annex', code: 'AN', is_active: 1 }],
    pagination: { totalPages: 1 },
  });
  vi.spyOn(api, 'patch').mockResolvedValue({ data: {} });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const keys = [
    ['warehouses', 'selector', 'old search', 1],
    ['/api/v1/warehouses', 'selector', 'old search', 1],
  ];
  for (const key of keys) client.setQueryData(key, { data: [] });
  render(
    <QueryClientProvider client={client}>
      <MasterManager resource="warehouses" />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Annex' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Main workshop' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Update record' }).closest('form'));
  await waitFor(() => {
    for (const key of keys) expect(client.getQueryState(key).isInvalidated).toBe(true);
  });
});

it('clearing a remote selector does not return the previous record to the form', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: [{ id: 1, name: 'Part one' }] });
  const change = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RemoteSelect
        id="record"
        endpoint="/records"
        queryKey="records"
        value="1"
        onChange={change}
        searchLabel="Find record"
        optionLabel={(row) => row.name}
      />
    </QueryClientProvider>,
  );
  await screen.findByRole('option', { name: 'Part one' });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
  expect(change).toHaveBeenLastCalledWith('', null);
});

it('receiving stock invalidates item and batch selectors used by other screens', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
  vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 1 } });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const keys = [
    ['inventory', 'items'],
    ['inventory-items', 'selector', 'previous search', 1],
    ['job-part-batches', 7],
    ['item-batches', 7],
    ['/api/v1/inventory/items', 'selector', '', 1],
    ['dashboard-inventory'],
  ];
  for (const key of keys) client.setQueryData(key, { data: [] });
  const saved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <PurchaseReceiptForm onSaved={saved} onCancel={() => {}} />
    </QueryClientProvider>,
  );
  fireEvent.submit(screen.getByRole('button', { name: 'Save & update stock' }).closest('form'));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  for (const key of keys) expect(client.getQueryState(key).isInvalidated).toBe(true);
});

it('stock invalidation refetches an active batch query without clearing unrelated cached data', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['suppliers'], { data: [{ id: 1 }] });
  const load = vi
    .fn()
    .mockResolvedValueOnce({ data: [{ quantity: 1 }] })
    .mockResolvedValue({ data: [{ quantity: 5 }] });
  const { QueryObserver } = await import('@tanstack/react-query');
  const observer = new QueryObserver(client, { queryKey: ['job-part-batches', 7], queryFn: load });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await waitFor(() =>
      expect(client.getQueryData(['job-part-batches', 7])).toEqual({ data: [{ quantity: 1 }] }),
    );
    await invalidateInventory(client);
    expect(client.getQueryData(['job-part-batches', 7])).toEqual({ data: [{ quantity: 5 }] });
    expect(client.getQueryState(['suppliers']).isInvalidated).toBe(false);
  } finally {
    unsubscribe();
    client.clear();
  }
});
