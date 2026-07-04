import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/apiClient.js';
import { useAppStore } from '../../shared/store/useAppStore.js';
import { Settings, Database, Shield, RefreshCw, CheckCircle, AlertTriangle, Play } from 'lucide-react';

export default function SettingsPortal() {
  const queryClient = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);

  const [companyName, setCompanyName] = useState('Goldy Automobiles');
  const [gstin, setGstin] = useState('06AAAAA1111A1Z1');
  const [phone, setPhone] = useState('9876543210');
  const [address, setAddress] = useState('G.T. Road, Karnal, Haryana');

  // Fetch Backups List
  const { data: backupsResponse, isLoading: loadingBackups } = useQuery({
    queryKey: ['backups-history'],
    queryFn: () => api.get('/api/v1/backups')
  });

  // Fetch Backup Settings
  const { data: backupSettingsResponse } = useQuery({
    queryKey: ['backups-settings'],
    queryFn: () => api.get('/api/v1/backups/settings')
  });

  const backups = backupsResponse?.data || [];
  const scheduleSettings = backupSettingsResponse?.data || { retentionDays: 7, backupFrequencyHours: 24, autoBackupEnabled: true };

  // Manual Backup Mutation
  const backupMutation = useMutation({
    mutationFn: () => api.post('/api/v1/backups/manual'),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['backups-history']);
      addNotification(`Manual backup snapshot generated successfully: ${res.data.filename}`, 'success');
    },
    onError: (err) => {
      addNotification(err.message || 'Failed to create backup.', 'error');
    }
  });

  // Restore Latest Mutation
  const restoreLatestMutation = useMutation({
    mutationFn: () => api.post('/api/v1/backups/restore-latest'),
    onSuccess: () => {
      addNotification('Database successfully rolled back to latest verified snapshot.', 'success');
    },
    onError: (err) => {
      addNotification(err.message || 'Failed to restore database.', 'error');
    }
  });

  // Purge Demo Data Mutation
  const purgeMutation = useMutation({
    mutationFn: () => api.post('/api/v1/backups/purge-demo'),
    onSuccess: () => {
      addNotification('Workshop database successfully cleared of demo datasets.', 'success');
    },
    onError: (err) => {
      addNotification(err.message || 'Failed to purge demo data.', 'error');
    }
  });

  const handleSaveSettings = (e) => {
    e.preventDefault();
    addNotification('Company profile updated successfully.', 'success');
  };

  return (
    <div className="p-6 space-y-6 max-h-[90vh] overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Settings & Utilities</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Configure company coordinates, manage backup tasks, and run integrity checks.</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left Side - Company Profile */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
            <Settings className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <h3 className="font-bold text-gray-950 dark:text-white">Company Profile Settings</h3>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label htmlFor="company-name-input" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Workshop / Company Name</label>
              <input
                id="company-name-input"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
              />
            </div>
            
            <div>
              <label htmlFor="company-gstin-input" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Company GSTIN</label>
              <input
                id="company-gstin-input"
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="company-phone-input" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Support Phone</label>
                <input
                  id="company-phone-input"
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="company-address-input" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Address Location</label>
                <input
                  id="company-address-input"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors"
            >
              Save Configuration
            </button>
          </form>
        </div>

        {/* Right Side - Backups & Recovery */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
            <Database className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <h3 className="font-bold text-gray-950 dark:text-white">Database Backup & Recovery</h3>
          </div>

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
              onClick={() => restoreLatestMutation.mutate()}
              disabled={restoreLatestMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Play className="h-4 w-4" />
              Restore Latest
            </button>
            <button
              onClick={() => purgeMutation.mutate()}
              disabled={purgeMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 border border-red-300 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <AlertTriangle className="h-4 w-4" />
              Purge Demo Data
            </button>
          </div>

          {/* Backups List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Backup File Registry</h4>
            <div className="border border-gray-200 dark:border-gray-800 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-800">
              {loadingBackups ? (
                <div className="p-4 text-center text-xs text-gray-400">Loading backup history...</div>
              ) : backups.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400">No backup records found.</div>
              ) : (
                backups.map((b) => (
                  <div key={b.id || b.filename} className="p-3 flex items-center justify-between text-xs hover:bg-gray-50 dark:hover:bg-gray-850/50">
                    <span className="font-mono text-gray-800 dark:text-gray-200">{b.filename}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{(b.size / 1024).toFixed(1)} KB | {b.created_at || b.timestamp}</span>
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
