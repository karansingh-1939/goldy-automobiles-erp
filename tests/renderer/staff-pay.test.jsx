import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StaffPay from '../../src/renderer/modules/staff/StaffPay.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { useAppStore } from '../../src/renderer/shared/store/use-app-store.js';

it('pays a salary with the outstanding advance cut and shows the amount to hand over', async () => {
  useAppStore.getState().setToken('test-session', { role: { name: 'Admin' } });
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url.includes('/money-accounts')
      ? [{ id: 1, name: 'Cash in Hand', kind: 'CASH', balance: 0 }]
      : [
          {
            id: 4,
            name: 'Test Mechanic',
            monthlySalary: 15000,
            advanceDue: 3000,
            salaryPaid: false,
            paidThisMonth: null,
          },
        ],
  }));
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StaffPay />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Test Mechanic')).toBeTruthy();
  fireEvent.click(screen.getAllByText('Pay salary')[0]);
  expect(await screen.findByText('Hand over: ₹12,000.00')).toBeTruthy();
  fireEvent.click(screen.getAllByText('Pay salary')[1]);
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/v1/staff-pay/4/pay',
      expect.objectContaining({ amount: 15000, advanceDeducted: 3000, accountId: 1 }),
    ),
  );
});
