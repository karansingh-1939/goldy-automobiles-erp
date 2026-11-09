import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { useAppStore } from '../../shared/store/use-app-store.js';

export default function BackupUpload() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const client = useQueryClient();
  const restore = useMutation({
    mutationFn: (selected) =>
      api.postBinary('/api/v1/backups/restore/upload', selected, { timeout: 120000 }),
    onSuccess: () => {
      client.clear();
      useAppStore.getState().logout();
    },
  });
  return (
    <section className="space-y-3 rounded-lg border p-3" aria-label="Restore uploaded backup">
      <label className="block text-sm font-semibold">
        Restore database file
        <input
          type="file"
          accept=".db,.sqlite,.sqlite3"
          disabled={restore.isPending}
          className="mt-2 block w-full"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            setError('');
            if (selected && selected.size > 512 * 1024 * 1024) {
              setError('Backup must be at most 512 MB.');
              setFile(null);
            } else setFile(selected || null);
          }}
        />
      </label>
      <p className="text-xs text-gray-500">
        Restoring replaces current data. The server checks database integrity and keeps a
        pre-restore recovery copy. Success requires signing in again.
      </p>
      <button
        type="button"
        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
        disabled={!file || restore.isPending}
        onClick={() =>
          useAppStore.getState().openDialog({
            title: 'Restore selected backup?',
            message: `Replace the current workshop database with ${file.name} (${(file.size / 1024).toFixed(1)} KB)? Changes since this backup will be replaced.`,
            onConfirm: () => restore.mutate(file),
          })
        }
      >
        {restore.isPending ? 'Restoring...' : 'Restore selected file'}
      </button>
      {(error || restore.error) && (
        <p role="alert" className="text-red-600">
          {error || restore.error.message}
        </p>
      )}
    </section>
  );
}
