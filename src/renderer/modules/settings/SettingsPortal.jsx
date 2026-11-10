import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { useAppStore } from '../../shared/store/use-app-store.js';
import { Database, RefreshCw, Play } from 'lucide-react';
import BackupSchedule from './BackupSchedule.jsx';
import BackupUpload from './BackupUpload.jsx';
import CompanyProfileForm from './CompanyProfileForm.jsx';

export default function SettingsPortal() {
  const queryClient = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);
  const user = useAppStore((state) => state.user);
  const isAdmin = ['admin', 'administrator'].includes((user?.role?.name || '').toLowerCase());
  const [externalDirectory, setExternalDirectory] = useState(null);
  const { data: backupSettings, error: settingsError } = useQuery({
    queryKey: ['backup-settings'],
    queryFn: () => api.get('/api/v1/backups/settings'),
    enabled: isAdmin,
  });
  const settings = backupSettings?.data || {};
  const saveDestination = useMutation({
    mutationFn: () =>
      api.patch('/api/v1/backups/settings', {
        'backup.external_directory':
          externalDirectory ?? settings['backup.external_directory'] ?? '',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
      addNotification('External backup folder saved.', 'success');
    },
    onError: (error) => addNotification(error.message, 'error'),
  });
  const verifyMutation = useMutation({
    mutationFn: (id) => api.post(`/api/v1/backups/${id}/verify`, {}, { timeout: 120000 }),
    onSuccess: () =>
      addNotification(
        'Backup passed integrity, relationships and restore migration checks.',
        'success',
      ),
    onError: (error) => addNotification(error.message, 'error'),
  });

  // Fetch Backups List
  const {
    data: backupsResponse,
    isLoading: loadingBackups,
    error: backupsError,
  } = useQuery({
    queryKey: ['backups-history'],
    queryFn: () => api.get('/api/v1/backups'),
    enabled: isAdmin,
  });

  const backups = backupsResponse?.data || [];

  // Manual Backup Mutation
  const backupMutation = useMutation({
    mutationFn: () => api.post('/api/v1/backups/manual', {}, { timeout: 120000 }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['backups-history'] });
      queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
      addNotification(
        `Manual backup snapshot generated successfully: ${res.data.filename}`,
        'success',
      );
      if (res.data.external?.status === 'FAILED') {
        addNotification(
          `Local backup saved. External copy failed: ${res.data.external.message}`,
          'error',
        );
      }
    },
    onError: (err) => {
      addNotification(err.message || 'Failed to create backup.', 'error');
    },
  });

  // Restore Latest Mutation
  const restoreLatestMutation = useMutation({
    mutationFn: () => api.post('/api/v1/backups/restore-latest', {}, { timeout: 120000 }),
    onSuccess: () => {
      queryClient.clear();
      useAppStore.getState().logout();
    },
    onError: (err) => {
      addNotification(err.message || 'Failed to restore database.', 'error');
    },
  });

  if (!isAdmin)
    return (
      <p role="alert" className="p-6">
        Administrator access is required to manage backups and restore workshop data.
      </p>
    );
  return (
    <div className="p-6 space-y-6 max-h-[90vh] overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Settings & Utilities
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Edit company details and manage database backups.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CompanyProfileForm />

        {/* Right Side - Backups & Recovery */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
            <Database className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <h3 className="font-bold text-gray-950 dark:text-white">Database Backup & Recovery</h3>
          </div>
          {settingsError && (
            <p role="alert" className="text-red-600">
              {settingsError.message}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => backupMutation.mutate()}
              disabled={backupMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Generate Backup
            </button>
            <button
              onClick={() =>
                useAppStore.getState().openDialog({
                  title: 'Restore latest backup?',
                  message:
                    'This replaces the current workshop database with the latest verified backup.',
                  onConfirm: () => restoreLatestMutation.mutate(),
                })
              }
              disabled={restoreLatestMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Play className="h-4 w-4" />
              Restore Latest
            </button>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveDestination.mutate();
            }}
            className="space-y-2"
          >
            <label htmlFor="external-backup-folder" className="block text-sm font-semibold">
              External backup folder
            </label>
            <input
              id="external-backup-folder"
              className="w-full rounded border p-2 dark:bg-gray-800"
              value={externalDirectory ?? settings['backup.external_directory'] ?? ''}
              onChange={(event) => setExternalDirectory(event.target.value)}
              placeholder="E:\\WorkshopBackups"
            />
            <p className="text-xs text-gray-500">
              Use an existing USB or network folder. Every manual and scheduled backup also copies
              there. Empty disables the copy. External copies are kept until you remove them.
            </p>
            <button
              disabled={saveDestination.isPending}
              className="rounded border px-3 py-2 text-sm"
            >
              Save backup folder
            </button>
            {settings['backup.external_last_success'] && (
              <p className="text-xs">
                Last external copy: {settings['backup.external_last_success']}
              </p>
            )}
            {settings['backup.external_last_error'] && (
              <p role="alert" className="text-sm text-red-600">
                External copy failed: {settings['backup.external_last_error']}
              </p>
            )}
          </form>

          <BackupSchedule />
          <BackupUpload />
          {/* Backups List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Backup File Registry
            </h4>
            <div className="border border-gray-200 dark:border-gray-800 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-800">
              {loadingBackups ? (
                <div className="p-4 text-center text-xs text-gray-400">
                  Loading backup history...
                </div>
              ) : backupsError ? (
                <p role="alert" className="p-3 text-red-600">
                  {backupsError.message}
                </p>
              ) : backups.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400">
                  No backup records found.
                </div>
              ) : (
                backups.map((b) => (
                  <div
                    key={b.id || b.filename}
                    className="p-3 flex items-center justify-between text-xs hover:bg-gray-50 dark:hover:bg-gray-850/50"
                  >
                    <span className="font-mono text-gray-800 dark:text-gray-200">{b.filename}</span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {(b.file_size / 1024).toFixed(1)} KB | {b.created_at || b.timestamp}
                    </span>
                    <span>{b.status}</span>
                    {b.status === 'SUCCESS' && !b.purged && (
                      <button
                        disabled={verifyMutation.isPending}
                        onClick={() => verifyMutation.mutate(b.id)}
                        className="rounded border px-2 py-1"
                      >
                        Verify
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
