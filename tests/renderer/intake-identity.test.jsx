import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useIntakeLookup } from '../../src/renderer/modules/job-cards/use-intake-lookup.js';

it('rechecks vehicle ownership and removes old transfer consent after a phone change', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: url.includes('/vehicles/')
          ? { id: 1, customer_id: 1, customer_name: 'Original Owner', customer_phone: '1111111111' }
          : { id: url.includes('2222222222') ? 2 : 3, name: 'New Owner' },
      }),
    })),
  );
  const { result } = renderHook(() => useIntakeLookup(vi.fn()));
  await act(async () => result.current.handleVehicleRegSearch('PB01AB1234'));
  expect(result.current.showOwnerMismatchWarning).toBe(false);
  await act(async () => {
    result.current.setCustomerPhone('2222222222');
    await result.current.handleCustomerPhoneSearch('2222222222');
  });
  expect(result.current.showOwnerMismatchWarning).toBe(true);
  expect(result.current.vehicleOwnerName).toBe('Original Owner');
  act(() => result.current.setTransferOwnership(true));
  await act(async () => {
    result.current.setCustomerPhone('3333333333');
    await result.current.handleCustomerPhoneSearch('3333333333');
  });
  expect(result.current.transferOwnership).toBe(false);
});

it('keeps a failed vehicle lookup visible when the customer lookup succeeds', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => ({
      ok: !url.includes('/vehicles/'),
      status: url.includes('/vehicles/') ? 503 : 200,
      json: async () =>
        url.includes('/vehicles/')
          ? { error: { message: 'Vehicle lookup unavailable' } }
          : { data: { id: 1, name: 'Owner' } },
    })),
  );
  const { result } = renderHook(() => useIntakeLookup(vi.fn()));
  await act(async () => result.current.handleVehicleRegSearch('PB01AB1234'));
  await act(async () => result.current.handleCustomerPhoneSearch('1111111111'));
  await waitFor(() => expect(result.current.lookupError).toBe('Vehicle lookup unavailable'));
});
