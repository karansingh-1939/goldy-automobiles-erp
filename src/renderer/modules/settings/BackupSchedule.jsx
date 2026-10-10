import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';

export default function BackupSchedule() {
  const client = useQueryClient();
  const [draft, setDraft] = useState({});
  const [saved, setSaved] = useState(false);
  const query = useQuery({
    queryKey: ['backup-settings'],
    queryFn: () => api.get('/api/v1/backups/settings'),
  });
  const settings = query.data?.data || {};
  const value = (key, fallback) => draft[key] ?? settings[key] ?? fallback;
  const change = (key, next) => {
    setSaved(false);
    setDraft((previous) => ({ ...previous, [key]: next }));
  };
  const mutation = useMutation({
    mutationFn: () =>
      api.patch('/api/v1/backups/settings', {
        'backup.auto_enabled': value('backup.auto_enabled', false),
        'backup.missed_recovery': value('backup.missed_recovery', true),
        'backup.schedule_type': value('backup.schedule_type', 'DAILY'),
        'backup.preferred_time': value('backup.preferred_time', '18:00'),
        'backup.weekly_day': value('backup.weekly_day', 'Sunday'),
        'backup.interval_hours': Number(value('backup.interval_hours', 24)),
        'backup.retention_count': Number(value('backup.retention_count', 7)),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['backup-settings'] });
      setSaved(true);
      setDraft({});
    },
  });
  if (query.isPending) return <p>Loading backup schedule…</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  const input = 'block w-full rounded border p-2 dark:bg-gray-800';
  return (
    <form
      className="space-y-3 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <h4 className="font-semibold">Automatic backup schedule</h4>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value('backup.auto_enabled', false)}
          onChange={(event) => change('backup.auto_enabled', event.target.checked)}
        />
        Enable scheduled backups
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value('backup.missed_recovery', true)}
          onChange={(event) => change('backup.missed_recovery', event.target.checked)}
        />
        Create a missed backup when the app next opens
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Schedule
          <select
            className={input}
            value={value('backup.schedule_type', 'DAILY')}
            onChange={(event) => change('backup.schedule_type', event.target.value)}
          >
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="INTERVAL">Every N hours</option>
          </select>
        </label>
        <label className="text-sm">
          Local backup time
          <input
            className={input}
            type="time"
            required
            value={value('backup.preferred_time', '18:00')}
            onChange={(event) => change('backup.preferred_time', event.target.value)}
          />
        </label>
        {value('backup.schedule_type', 'DAILY') === 'WEEKLY' && (
          <label className="text-sm">
            Backup day
            <select
              className={input}
              value={value('backup.weekly_day', 'Sunday')}
              onChange={(event) => change('backup.weekly_day', event.target.value)}
            >
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
                (day) => (
                  <option key={day}>{day}</option>
                ),
              )}
            </select>
          </label>
        )}
        {value('backup.schedule_type', 'DAILY') === 'INTERVAL' && (
          <label className="text-sm">
            Interval hours
            <input
              className={input}
              type="number"
              min="1"
              max="168"
              step="1"
              required
              value={value('backup.interval_hours', 24)}
              onChange={(event) => change('backup.interval_hours', event.target.value)}
            />
          </label>
        )}
        <label className="text-sm">
          Automatic local backups to keep
          <input
            className={input}
            type="number"
            min="1"
            step="1"
            required
            value={value('backup.retention_count', 7)}
            onChange={(event) => change('backup.retention_count', event.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-gray-500">
        The app must be running to create scheduled backups. Manual and external copies are excluded
        from automatic local retention.
      </p>
      <button
        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
        disabled={mutation.isPending}
      >
        Save backup schedule
      </button>
      {mutation.error && (
        <p role="alert" className="text-red-600">
          {mutation.error.message}
        </p>
      )}
      {saved && <p role="status">Backup schedule saved.</p>}
    </form>
  );
}
