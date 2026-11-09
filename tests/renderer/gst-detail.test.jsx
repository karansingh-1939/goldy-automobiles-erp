import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GstDetailReports from '../../src/renderer/modules/reports/GstDetailReports.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { csvText } from '../../src/renderer/shared/utils/export-csv.js';

function show() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GstDetailReports dateFrom="2026-10-01" dateTo="2026-10-15" />
    </QueryClientProvider>,
  );
}
it('escapes quoted CSV values and keeps untrusted cells from executing formulas', () => {
  expect(csvText(['name', 'amount'], [['=HYPERLINK("x")', -18]])).toContain(
    '"\'=HYPERLINK(""x"")","-18"',
  );
});
it('uses posted GST input tax by component instead of splitting purchases fifty-fifty', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      outwardSupplies: {
        taxableValue: 1000,
        centralTax: 90,
        stateUtTax: 90,
        integratedTax: 0,
        totalTax: 180,
      },
      eligibleItc: {
        taxableValue: 500,
        centralTax: 0,
        stateUtTax: 0,
        integratedTax: 90,
        totalTax: 90,
      },
      rateBreakdown: [
        {
          gstRate: 18,
          taxableValue: 1000,
          cgstAmount: 90,
          sgstAmount: 90,
          igstAmount: 0,
          totalTax: 180,
        },
      ],
    },
  });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'GSTR-3B / Input tax credit' }));
  await screen.findByText('Eligible input tax credit');
  expect(screen.getByTestId('itc-integratedTax').textContent).toBe('₹90.00');
  expect(screen.getByTestId('itc-centralTax').textContent).toBe('₹0.00');
  expect(get).toHaveBeenCalledWith('/api/v1/gst/gstr3b?dateFrom=2026-10-01&dateTo=2026-10-15');
});
it('loads HSN summaries for the selected range and exposes API errors without exporting fallback rows', async () => {
  vi.spyOn(api, 'get').mockRejectedValue(new Error('Tax register unavailable'));
  show();
  fireEvent.click(screen.getByRole('button', { name: 'HSN/SAC summary' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Tax register unavailable');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Export detailed GST CSV' }).disabled).toBe(true),
  );
});
