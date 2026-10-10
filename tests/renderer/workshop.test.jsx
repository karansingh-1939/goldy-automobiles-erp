import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkshopBoard from '../../src/renderer/modules/workshop/WorkshopBoard.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { useAppStore } from '../../src/renderer/shared/store/use-app-store.js';

it('shows overdue delivery and records a customer rejection for the current estimate', async () => {
  useAppStore.getState().setToken('test-session', { role: { name: 'Admin' } });
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url.endsWith('/queue')
      ? [
          {
            id: 1,
            job_card_number: 'JC-001',
            registration_number: 'TEST-1',
            customer_name: 'Test Contact',
            overdue: 1,
            estimate_id: 5,
            estimate_amount: 100,
            scope: 'Service',
            approval_status: 'REQUESTED',
          },
        ]
      : [],
  }));
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WorkshopBoard />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Overdue')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Manage JC-001'));
  fireEvent.change(screen.getByLabelText('Decision notes'), {
    target: { value: 'Customer declined the repair.' },
  });
  fireEvent.click(screen.getByText('Record rejection'));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/v1/workshop/estimates/5/decision', {
      status: 'REJECTED',
      contactName: 'Test Contact',
      method: 'PHONE',
      notes: 'Customer declined the repair.',
    }),
  );
});
