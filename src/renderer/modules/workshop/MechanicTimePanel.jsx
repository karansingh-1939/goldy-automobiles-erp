import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';

export default function MechanicTimePanel({ jobId }) {
  const [search, setSearch] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [notes, setNotes] = useState('');
  const technicians = useQuery({
    queryKey: ['timer-technicians', search],
    queryFn: () => api.get(`/api/v1/technicians?pageSize=100&search=${encodeURIComponent(search)}`),
  });
  const entries = useQuery({
    queryKey: ['mechanic-time', jobId],
    queryFn: () => api.get(`/api/v1/workshop/jobs/${jobId}/time`),
    refetchInterval: 30000,
  });
  const mutation = useMutation({
    mutationFn: (id) =>
      id
        ? api.post(`/api/v1/workshop/time/${id}/stop`, {})
        : api.post(`/api/v1/workshop/jobs/${jobId}/time`, {
            technicianId: Number(technicianId),
            notes,
          }),
    onSuccess: () => entries.refetch(),
  });
  return (
    <section className="mt-5 space-y-3 border-t pt-4" aria-label="Mechanic time tracking">
      <h3 className="font-semibold">Mechanic time</h3>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(null);
        }}
      >
        <label className="text-sm">
          Find mechanic
          <input
            className="block rounded border p-2 dark:bg-gray-800"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="text-sm">
          Mechanic
          <select
            className="block rounded border p-2 dark:bg-gray-800"
            required
            value={technicianId}
            onChange={(event) => setTechnicianId(event.target.value)}
          >
            <option value="">Choose mechanic</option>
            {(technicians.data?.data || [])
              .filter((item) => item.is_active === 1)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Work notes
          <input
            className="block rounded border p-2 dark:bg-gray-800"
            maxLength={1000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <button
          className="rounded border px-3 py-2 text-sm disabled:opacity-50"
          disabled={mutation.isPending || !technicianId}
        >
          Start timer
        </button>
      </form>
      {(mutation.error || technicians.error || entries.error) && (
        <p role="alert" className="text-red-600">
          {(mutation.error || technicians.error || entries.error).message}
        </p>
      )}
      {entries.isPending ? (
        <p>Loading time entries…</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {(entries.data?.data || []).map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-3">
              <span>
                {entry.technician_name} · {entry.elapsedMinutes.toFixed(1)} min · {entry.notes}
              </span>
              <span>{entry.stopped_at ? 'Stopped' : 'Running'}</span>
              {!entry.stopped_at && (
                <button
                  className="rounded border px-3 py-1 disabled:opacity-50"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(entry.id)}
                  aria-label={`Stop timer for ${entry.technician_name}`}
                >
                  Stop timer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!entries.isPending && !entries.error && !entries.data?.data?.length && (
        <p className="text-sm text-gray-500">No time recorded for this job.</p>
      )}
    </section>
  );
}
