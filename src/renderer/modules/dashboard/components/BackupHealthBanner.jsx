import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { api } from '../../../shared/api/api-client.js';
import { useAppStore } from '../../../shared/store/use-app-store.js';

// Tells the owner, in plain words, whether his data is safely backed up.
export function BackupHealthBanner() {
  const queryClient = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);
  const health = useQuery({
    queryKey: ['backup-health'],
    queryFn: () => api.get('/api/v1/backups/health'),
    refetchInterval: 10 * 60 * 1000,
  });
  const backupNow = useMutation({
    mutationFn: () => api.post('/api/v1/backups/manual', {}, { timeout: 120000 }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['backup-health'] });
      queryClient.invalidateQueries({ queryKey: ['backups-history'] });
      const usb = res?.data?.external?.status;
      addNotification(
        usb === 'FAILED'
          ? 'Backup saved on this laptop, but the USB copy failed. Check the USB drive.'
          : 'Backup saved.',
        usb === 'FAILED' ? 'error' : 'success',
      );
    },
    onError: (error) => addNotification(error.message || 'Backup failed.', 'error'),
  });

  const data = health.data?.data;
  if (health.isError) return null; // users without backup permission see nothing
  if (!data || !Array.isArray(data.warnings)) return null;
  if (data.ok) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
        <CheckCircle className="h-4 w-4" />
        Data is backed up
        {data.lastSuccessAt
          ? ` (last backup ${new Date(data.lastSuccessAt).toLocaleString()})`
          : ''}
        .
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">Your data needs a backup</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      </div>
      <button
        type="button"
        onClick={() => backupNow.mutate()}
        disabled={backupNow.isPending}
        className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
      >
        {backupNow.isPending ? 'Backing up...' : 'Back up now'}
      </button>
    </div>
  );
}
