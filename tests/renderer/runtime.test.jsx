import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DataTable from '../../src/renderer/shared/components/DataTable.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { useAppStore } from '../../src/renderer/shared/store/use-app-store.js';

beforeEach(() => {
  useAppStore.getState().setToken(null);
});

it('updates a record using PATCH with the authenticated session', async () => {
  useAppStore.getState().setToken('test-session', { name: 'Test' });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { name: 'Updated' } }) }),
  );
  await api.patch('/api/v1/customers/1', { name: 'Updated' });
  expect(fetch).toHaveBeenCalledWith(
    '/api/v1/customers/1',
    expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({ Authorization: 'Bearer test-session' }),
    }),
  );
});

it('advances table pages and changes page size without recursive updates', () => {
  const data = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    name: `Item ${index + 1}`,
  }));
  render(
    <DataTable columns={[{ accessorKey: 'name', header: 'Item' }]} data={data} pageSize={10} />,
  );
  fireEvent.click(screen.getByLabelText(/next page/i));
  expect(screen.getByText('Item 11')).toBeTruthy();
  expect(screen.queryByText('Item 1')).toBeNull();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '25' } });
  expect(screen.getByText('Item 1')).toBeTruthy();
  expect(screen.getByText('Item 12')).toBeTruthy();
});

it('opens and confirms the shared deletion dialog', () => {
  const onConfirm = vi.fn();
  useAppStore
    .getState()
    .openDialog({ title: 'Delete customer', message: 'Confirm deletion', onConfirm });
  expect(useAppStore.getState().dialog.isOpen).toBe(true);
  useAppStore.getState().dialog.onConfirm();
  expect(onConfirm).toHaveBeenCalledOnce();
  expect(useAppStore.getState().dialog.isOpen).toBe(false);
});
