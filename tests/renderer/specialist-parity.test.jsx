import React from 'react';
import { amountInWords } from '../../src/renderer/modules/billing/amount-in-words.js';
import { MemoryRouter } from 'react-router-dom';
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import JobCardManager from '../../src/renderer/modules/job-cards/JobCardManager.jsx';
import InvoiceManager from '../../src/renderer/modules/billing/InvoiceManager.jsx';
import ServiceHistory from '../../src/renderer/modules/vehicles/ServiceHistory.jsx';
import JobCardCharges from '../../src/renderer/modules/job-cards/JobCardCharges.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { useAppStore } from '../../src/renderer/shared/store/use-app-store.js';
beforeEach(() => useAppStore.getState().setToken('test', { role: { name: 'Admin' } }));
function show(node) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}
it('renders real labour fields and all four job charge sections', () => {
  show(
    <JobCardCharges
      job={{
        parts: [
          {
            id: 1,
            item_type: 'LUBRICANT',
            description: 'Engine oil',
            quantity: 2,
            selling_price: 100,
            gst_rate: 18,
            gst_amount: 36,
            line_total: 236,
          },
        ],
        labour: [
          { id: 2, description: '[Outside Job] Alignment', labour_charge: 500, gst_rate: 18 },
        ],
      }}
    />,
  );
  expect(screen.getByText('₹590.00')).toBeTruthy();
  for (const name of ['Parts Consumption', 'Lubricants', 'Outside Jobs', 'Labour (In-House)'])
    expect(screen.getByText(name)).toBeTruthy();
});
it('searches invoices, renders detail and confirms cancellation explicitly', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url.startsWith('/api/v1/invoices?')
      ? [{ id: 1, invoice_number: 'INV-1', grand_total: 118, status: 'FINALIZED' }]
      : url === '/api/v1/invoices/1'
        ? {
            id: 1,
            invoice_number: 'INV-1',
            status: 'FINALIZED',
            grand_total: 118,
            subtotal: 100,
            gst_total: 18,
            items: [
              {
                id: 1,
                item_type: 'LABOR',
                description: 'Repair',
                unit_price: 100,
                quantity: 1,
                gst_rate: 18,
                line_total: 118,
              },
            ],
          }
        : { name: 'Workshop' },
  }));
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
  show(<InvoiceManager />);
  fireEvent.click(await screen.findByRole('button', { name: 'View INV-1' }));
  expect(await screen.findByText('Repair')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel invoice' }));
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/invoices/1/cancel', {}));
});
it('loads camelCase service history from a searchable vehicle selection', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url.includes('service-history')
      ? {
          vehicle: { registrationNumber: 'HR01A1234', engineNumber: 'ENGINE-1' },
          customer: { name: 'Owner' },
          summary: { totalVisits: 1, totalRevenue: 118, lastVisitDate: '2026-10-15' },
          history: [
            {
              jobCardNumber: 'JC-1',
              serviceDate: '2026-10-15',
              services: [
                { description: 'Oil change', quantity: 1, unitPrice: 100, lineTotal: 118 },
              ],
              parts: [],
            },
          ],
        }
      : [{ id: 21, registration_number: 'HR01A1234' }],
  }));
  show(<ServiceHistory />);
  await screen.findByRole('option', { name: /HR01A1234/ });
  fireEvent.change(screen.getByLabelText('Vehicle'), { target: { value: '21' } });
  expect(await screen.findByText('ENGINE-1')).toBeTruthy();
  expect(screen.getByText('Oil change')).toBeTruthy();
});

it('posts selected batch and outside labour charge using the backend contract', async () => {
  const job = { id: 1, job_card_number: 'JC-1', status: 'DRAFT', parts: [], labour: [] };
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url.startsWith('/api/v1/job-cards?')
      ? [job]
      : url === '/api/v1/job-cards/1'
        ? job
        : url.includes('/batches')
          ? [{ id: 8, batch_number: 'B-8', warehouse_name: 'Main', quantity: 5 }]
          : url.startsWith('/api/v1/inventory/items?')
            ? [{ id: 3, item_name: 'Oil', selling_price: 100, gst_rate: 18 }]
            : [],
  }));
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
  show(<JobCardManager />);
  fireEvent.click(await screen.findByText('JC-1'));
  fireEvent.click(await screen.findByRole('button', { name: '+ Add Spare Part' }));
  await screen.findByRole('option', { name: /Oil/ });
  fireEvent.change(screen.getByLabelText('Select Part *'), { target: { value: '3' } });
  await screen.findByRole('option', { name: /B-8/ });
  fireEvent.change(screen.getByLabelText('Warehouse / batch *'), { target: { value: '8' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Part' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/v1/job-cards/1/parts', {
      inventory_item_id: 3,
      batch_id: 8,
      gst_rate: 18,
      quantity: 1,
      selling_price: 100,
    }),
  );
  await waitFor(() => expect(screen.queryByLabelText('Select Part *')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: '+ Add Labor Charge' }));
  fireEvent.change(screen.getByLabelText('Description *'), { target: { value: 'Alignment' } });
  fireEvent.change(screen.getByLabelText('Labor Charge (₹) *'), { target: { value: '500' } });
  fireEvent.click(screen.getByLabelText('Outside job'));
  fireEvent.click(screen.getByRole('button', { name: 'Add Labor' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/v1/job-cards/1/labour', {
      description: '[Outside Job] Alignment',
      labour_charge: 500,
      gst_rate: 18,
    }),
  );
});

it('prints rounded paise and sub-rupee amounts in words', () => {
  expect(amountInWords(0.5)).toBe('Zero Rupees and Fifty Paise Only');
  expect(amountInWords(999.999)).toBe('One Thousand Rupees Only');
});
