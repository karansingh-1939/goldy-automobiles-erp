import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import { localDate } from '../../../../public/local-date.js';

export default function ServiceReminders() {
  const { hasPermission } = usePermissions();
  const [search, setSearch] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [dueDate, setDueDate] = useState(localDate());
  const [reminderType, setReminderType] = useState('MAINTENANCE');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState('');
  const reminders = useQuery({
    queryKey: ['service-reminders'],
    queryFn: () => api.get('/api/v1/crm/reminders'),
    enabled: hasPermission('customers.read'),
  });
  const vehicles = useQuery({
    queryKey: ['reminder-vehicles', search],
    queryFn: () => api.get(`/api/v1/vehicles?pageSize=100&search=${encodeURIComponent(search)}`),
    enabled: hasPermission('vehicles.read') && hasPermission('customers.write'),
  });
  const mutation = useMutation({
    mutationFn: (id) =>
      id
        ? api.post(`/api/v1/crm/reminders/${id}/dismiss`, {})
        : api.post('/api/v1/crm/reminders', {
            vehicleId: Number(vehicleId),
            dueDate,
            reminderType,
            notes,
          }),
    onSuccess: (_, id) => {
      setSaved(
        id
          ? 'Reminder dismissed.'
          : `Reminder scheduled for ${dueDate}. It will appear here when due.`,
      );
      reminders.refetch();
    },
  });
  if (!hasPermission('customers.read'))
    return <p className="p-6">You do not have permission to view service reminders.</p>;
  const input = 'block w-full rounded border p-2 dark:bg-gray-800';
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">Service reminders</h1>
        <p className="text-sm text-gray-500">
          Customers due for a follow-up today or earlier. Contact customers yourself and dismiss
          handled reminders.
        </p>
      </header>
      {saved && <p role="status">{saved}</p>}
      {(mutation.error || vehicles.error) && (
        <p role="alert" className="text-red-600">
          {(mutation.error || vehicles.error).message}
        </p>
      )}
      {hasPermission('customers.write') && hasPermission('vehicles.read') && (
        <form
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 dark:border-gray-800 dark:bg-gray-900"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(null);
          }}
        >
          <label className="text-sm">
            Find vehicle
            <input
              className={input}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Registration number"
            />
          </label>
          <label className="text-sm">
            Vehicle
            <select
              required
              className={input}
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
            >
              <option value="">Choose vehicle</option>
              {(vehicles.data?.data || []).map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.registration_number} · {vehicle.make} {vehicle.model}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Due date
            <input
              required
              type="date"
              className={input}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Reminder type
            <select
              className={input}
              value={reminderType}
              onChange={(event) => setReminderType(event.target.value)}
            >
              <option value="MAINTENANCE">Maintenance</option>
              <option value="GENERAL_CHECKUP">General check-up</option>
              <option value="WARRANTY_EXPIRY">Warranty expiry</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            Reminder notes
            <input
              className={input}
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <button
            className="justify-self-start rounded border px-3 py-2 disabled:opacity-50"
            disabled={mutation.isPending || !vehicleId}
          >
            Schedule reminder
          </button>
        </form>
      )}
      {reminders.isPending ? (
        <p>Loading reminders…</p>
      ) : reminders.error ? (
        <p role="alert">{reminders.error.message}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Pending service reminders due today or earlier</caption>
            <thead>
              <tr>
                {['Due', 'Customer', 'Phone', 'Vehicle', 'Reason', 'Notes', 'Actions'].map(
                  (label) => (
                    <th key={label} scope="col" className="p-2">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {(reminders.data?.data || []).map((item) => (
                <tr key={item.id} className="border-t dark:border-gray-800">
                  <td className="p-2">{item.due_date}</td>
                  <td className="p-2">{item.customer_name}</td>
                  <td className="p-2">{item.customer_phone}</td>
                  <td className="p-2">{item.registration_number}</td>
                  <td className="p-2">{item.reminder_type}</td>
                  <td className="p-2">{item.notes}</td>
                  <td className="p-2">
                    {hasPermission('customers.write') && (
                      <button
                        className="rounded border px-3 py-1 disabled:opacity-50"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate(item.id)}
                        aria-label={`Dismiss reminder for ${item.registration_number}`}
                      >
                        Dismiss
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!reminders.data?.data?.length && <p className="p-3">No reminders are due.</p>}
        </div>
      )}
    </div>
  );
}
