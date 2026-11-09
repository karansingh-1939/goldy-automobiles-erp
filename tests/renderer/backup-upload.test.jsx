import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BackupUpload from '../../src/renderer/modules/settings/BackupUpload.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { useAppStore } from '../../src/renderer/shared/store/use-app-store.js';
it('requires explicit confirmation before restoring bytes and signs out after success', async () => {
  useAppStore.getState().setToken('test-session', { role: { name: 'Admin' } });
  const upload = vi.spyOn(api, 'postBinary').mockResolvedValue({ status: 'success' });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BackupUpload />
    </QueryClientProvider>,
  );
  const file = new File(['SQLite format 3\0'], 'snapshot.sqlite', {
    type: 'application/octet-stream',
  });
  fireEvent.change(screen.getByLabelText('Restore database file'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Restore selected file' }));
  expect(upload).not.toHaveBeenCalled();
  expect(useAppStore.getState().dialog.message).toContain('snapshot.sqlite');
  act(() => useAppStore.getState().dialog.onConfirm());
  await waitFor(() =>
    expect(upload).toHaveBeenCalledWith('/api/v1/backups/restore/upload', file, {
      timeout: 120000,
    }),
  );
  await waitFor(() => expect(useAppStore.getState().token).toBeNull());
});
