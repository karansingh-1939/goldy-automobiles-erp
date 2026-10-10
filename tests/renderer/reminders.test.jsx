import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ServiceReminders from '../../src/renderer/modules/workshop/ServiceReminders.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { useAppStore } from '../../src/renderer/shared/store/use-app-store.js';

it('schedules a reminder for a selected vehicle and dismisses a handled reminder', async () => {
  useAppStore.getState().setToken('test-session', { role: { name: 'Admin' } });
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url.includes('/vehicles')
      ? [{ id: 2, registration_number: 'TEST-2', make: 'Test', model: 'Car' }]
      : [
          {
            id: 3,
            registration_number: 'TEST-3',
            customer_name: 'Test Owner',
            due_date: '2026-01-01',
            reminder_type: 'MAINTENANCE',
          },
        ],
  }));
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ServiceReminders />
    </QueryClientProvider>,
  );
  await screen.findByText('TEST-2 · Test Car');
  fireEvent.change(screen.getByLabelText('Vehicle'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-12-01' } });
  fireEvent.click(screen.getByText('Schedule reminder'));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/v1/crm/reminders', {
      vehicleId: 2,
      dueDate: '2026-12-01',
      reminderType: 'MAINTENANCE',
      notes: '',
    }),
  );
  fireEvent.click(screen.getByLabelText('Dismiss reminder for TEST-3'));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/crm/reminders/3/dismiss', {}));
});
