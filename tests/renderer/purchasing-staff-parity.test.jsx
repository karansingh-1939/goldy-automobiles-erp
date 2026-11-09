import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PurchaseReceiptForm from '../../src/renderer/modules/purchasing/PurchaseReceiptForm.jsx';
import SupplierLedger from '../../src/renderer/modules/suppliers/SupplierLedger.jsx';
import ExpenseManager from '../../src/renderer/modules/expenses/ExpenseManager.jsx';
import TechnicianManager from '../../src/renderer/modules/workshop/TechnicianManager.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { useAppStore } from '../../src/renderer/shared/store/use-app-store.js';

beforeEach(() => useAppStore.getState().setToken('test', { role: { name: 'Admin' } }));
function mount(element) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {element}
    </QueryClientProvider>,
  );
}
it('records two receipt batches with explicit costs, tax and warehouse rather than a fixed selling markup', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url.includes('/suppliers')
      ? [{ id: 1, name: 'Supplier', is_active: 1 }]
      : url.includes('/warehouses')
        ? [{ id: 2, name: 'Main', code: 'MAIN' }]
        : [
            {
              id: 3,
              item_name: 'Filter',
              sku: 'FIL',
              purchase_cost: 100,
              selling_price: 170,
              gst_rate: 18,
            },
          ],
    pagination: { totalPages: 1 },
  }));
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 5 } });
  const saved = vi.fn();
  mount(<PurchaseReceiptForm onSaved={saved} onCancel={vi.fn()} />);
  await screen.findByRole('option', { name: 'Supplier' });
  fireEvent.change(screen.getByLabelText('Supplier'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Supplier invoice number'), {
    target: { value: 'INV-5' },
  });
  fireEvent.click(screen.getByText('Add receipt line'));
  await screen.findAllByRole('option', { name: 'Main (MAIN)' });
  for (const line of [1, 2]) {
    fireEvent.change(screen.getByLabelText(`Inventory item ${line}`), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(`Warehouse ${line}`), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(`Batch number ${line}`), {
      target: { value: `B-${line}` },
    });
    fireEvent.change(screen.getByLabelText(`Selling price ${line}`), { target: { value: '165' } });
  }
  fireEvent.click(screen.getByText('Save & update stock'));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/v1/purchases/receipts',
      expect.objectContaining({
        supplier_id: 1,
        receipt_number: 'INV-5',
        items: expect.arrayContaining([
          expect.objectContaining({
            item_id: 3,
            warehouse_id: 2,
            batch_number: 'B-1',
            purchase_cost: 100,
            selling_price: 165,
            gst_rate: 18,
          }),
          expect.objectContaining({ batch_number: 'B-2' }),
        ]),
      }),
    ),
  );
  await waitFor(() => expect(saved).toHaveBeenCalledWith({ id: 5 }));
});

it('retains supplier running balances and current outstanding while paging a dated ledger', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url.includes('/suppliers?')
      ? [{ id: 7, name: 'Vendor' }]
      : url.includes('/ledger?')
        ? [
            {
              id: 1,
              entry_date: '2026-10-10',
              entry_type: 'Purchase',
              credit: 10,
              debit: 0,
              balance_after: url.includes('pageSize=1') ? 900 : 400,
            },
          ]
        : { id: 7, name: 'Vendor' },
    pagination: { totalPages: 2 },
  }));
  mount(<SupplierLedger />);
  await screen.findByRole('option', { name: 'Vendor' });
  fireEvent.change(screen.getByLabelText('Supplier'), { target: { value: '7' } });
  fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-10-11' } });
  expect(await screen.findByText('Current outstanding (all dates): ₹900.00')).toBeTruthy();
  await screen.findByText('₹400.00');
  fireEvent.click(screen.getAllByText('Next page').at(-1));
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith(
      '/api/v1/purchases/suppliers/7/ledger?page=2&pageSize=20&dateFrom=2026-10-01&dateTo=2026-10-11',
    ),
  );
});

it('uses the aggregate expense summary and preserves old payment/notes on edit', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url.includes('/summary?')
      ? {
          todayTotal: 1234,
          monthTotal: 4321,
          total: 9000,
          byCategory: [{ category: 'Rent', amount: 9000 }],
        }
      : [
          {
            id: 8,
            expense_date: '2026-10-01',
            category: 'Rent',
            amount: 20,
            description: 'Lease [Payment: UPI] [Notes: Office]',
          },
        ],
    pagination: { totalPages: 5 },
  }));
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: {} });
  mount(<ExpenseManager />);
  expect(await screen.findByText('Filtered total: ₹9000.00')).toBeTruthy();
  fireEvent.click(await screen.findByLabelText('Edit expense 8'));
  expect(screen.getByLabelText('Payment method (record only)').value).toBe('UPI');
  expect(screen.getByLabelText('Expense notes').value).toBe('Office');
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Updated lease' } });
  fireEvent.click(screen.getByText('Save expense'));
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith(
      '/api/v1/expenses/8',
      expect.objectContaining({ description: 'Updated lease [Payment: UPI] [Notes: Office]' }),
    ),
  );
  fireEvent.change(screen.getByLabelText('Expense from date'), { target: { value: '2026-10-01' } });
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith(
      '/api/v1/expenses/summary?category=&dateFrom=2026-10-01&dateTo=',
    ),
  );
});

it('shows technician service history, complete-job metrics and the next history page', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) =>
    url.includes('/history?')
      ? {
          metrics: { totalAssignedJobs: 11, completedJobs: 8, activeJobs: 3 },
          history: [
            {
              jobCardId: 1,
              jobCardNumber: url.includes('page=2') ? 'OLD-JOB' : 'NEW-JOB',
              vehicle: { registrationNumber: 'HR-01' },
              customer: { name: 'Owner' },
              invoice: { invoiceNumber: 'BILL', status: 'PAID', grandTotal: 118 },
            },
          ],
        }
      : {
          data: url.includes('/queue')
            ? []
            : [{ id: 4, full_name: 'Mechanic', is_active: 1, metrics: { activeJobs: 3 } }],
          pagination: { totalPages: 1 },
        },
  );
  mount(<TechnicianManager />);
  fireEvent.click(await screen.findByText('View history'));
  expect(await screen.findByText('NEW-JOB')).toBeTruthy();
  expect(screen.getByText('Assigned jobs: 11 · Completed jobs: 8 · Active jobs: 3')).toBeTruthy();
  const history = screen.getByText('Work history: Mechanic').closest('section');
  fireEvent.click(within(history).getByText('Next page'));
  expect(await screen.findByText('OLD-JOB')).toBeTruthy();
  expect(get).toHaveBeenCalledWith('/api/v1/technicians/4/history?page=2&pageSize=10');
});
