import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExpenseManager from '../../src/renderer/modules/expenses/ExpenseManager.jsx';
import TechnicianManager from '../../src/renderer/modules/workshop/TechnicianManager.jsx';
import AuditLogManager from '../../src/renderer/modules/audit/AuditLogManager.jsx';
import BackupSchedule from '../../src/renderer/modules/settings/BackupSchedule.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { useAppStore } from '../../src/renderer/shared/store/use-app-store.js';
import { localDate } from '../../public/local-date.js';

function mount(Component) {
  useAppStore.getState().setToken('test-session', { role: { name: 'Admin' } });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Component />
    </QueryClientProvider>,
  );
}

it('records an expense through the React form', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: [], pagination: { totalPages: 1 } });
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
  mount(ExpenseManager);
  fireEvent.change(screen.getByLabelText('Expense category'), { target: { value: 'Rent' } });
  fireEvent.change(screen.getByLabelText('Amount (₹)'), { target: { value: '1500.50' } });
  fireEvent.click(screen.getByText('Save expense'));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/v1/expenses', {
      expense_date: localDate(),
      category: 'Rent',
      amount: 1500.5,
      description: '',
    }),
  );
});

it('adds a mechanic through the React form', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: [], pagination: { totalPages: 1 } });
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
  mount(TechnicianManager);
  fireEvent.change(screen.getByLabelText('Mechanic name'), { target: { value: 'Test Mechanic' } });
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '9000000003' } });
  fireEvent.click(screen.getByText('Save mechanic'));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/v1/technicians', {
      full_name: 'Test Mechanic',
      phone_number: '9000000003',
      specialization: '',
      notes: '',
    }),
  );
});

it('displays the actual audit response fields and safe change snapshots', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: [
      {
        id: 8,
        createdAt: '2026-10-11 01:00:00',
        userName: 'Test Staff',
        entityType: 'expenses',
        entityId: 4,
        action: 'UPDATE',
        oldValue: { amount: 10 },
        newValue: { amount: 20 },
      },
    ],
    pagination: { totalPages: 1 },
  });
  mount(AuditLogManager);
  expect(await screen.findByText('Test Staff')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('View audit 8'));
  expect(screen.getByText(/"amount": 20/)).toBeTruthy();
});

it('saves the backup schedule without rewriting its last successful run', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { 'backup.auto_enabled': false, 'backup.last_run_at': '2026-01-01' },
  });
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: {} });
  mount(BackupSchedule);
  fireEvent.click(await screen.findByLabelText('Enable scheduled backups'));
  fireEvent.click(screen.getByText('Save backup schedule'));
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith('/api/v1/backups/settings', {
      'backup.auto_enabled': true,
      'backup.missed_recovery': true,
      'backup.schedule_type': 'DAILY',
      'backup.preferred_time': '18:00',
      'backup.weekly_day': 'Sunday',
      'backup.interval_hours': 24,
      'backup.retention_count': 7,
    }),
  );
});
