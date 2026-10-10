import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsPortal from '../../src/renderer/modules/settings/SettingsPortal.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';

it('saves an external destination and verifies a selected successful snapshot', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/v1/backups')
      return { data: [{ id: 3, filename: 'snapshot.sqlite', status: 'SUCCESS', file_size: 1024 }] };
    return { data: {} };
  });
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: {} });
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { verified: true } });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SettingsPortal />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText('External backup folder'), {
    target: { value: 'E:\\Backups' },
  });
  fireEvent.click(screen.getByText('Save backup folder'));
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith('/api/v1/backups/settings', {
      'backup.external_directory': 'E:\\Backups',
    }),
  );
  fireEvent.click(await screen.findByText('Verify'));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/v1/backups/3/verify', {}, { timeout: 120000 }),
  );
});
