import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import MechanicTimePanel from './MechanicTimePanel.jsx';

const input =
  'block w-full rounded border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-800';
const button =
  'rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-700';
const card = 'rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900';

function EstimateEditor({ job, refresh }) {
  const [amount, setAmount] = useState('');
  const [scope, setScope] = useState('');
  const [promisedAt, setPromisedAt] = useState(job.promised_delivery_at?.slice(0, 16) || '');
  const [contactName, setContactName] = useState(job.customer_name);
  const [method, setMethod] = useState('PHONE');
  const [notes, setNotes] = useState('');
  const history = useQuery({
    queryKey: ['workshop-estimates', job.id],
    queryFn: () => api.get(`/api/v1/workshop/jobs/${job.id}/estimates`),
  });
  const mutation = useMutation({
    mutationFn: ({ path, payload, delivery }) =>
      delivery ? api.patch(path, payload) : api.post(path, payload),
    onSuccess: () => {
      refresh();
      history.refetch();
    },
  });
  const submit = (path, payload, delivery = false) => mutation.mutate({ path, payload, delivery });
  return (
    <section className={card} aria-label="Selected job actions">
      <h2 className="text-lg font-bold">
        {job.job_card_number} · {job.registration_number}
      </h2>
      {mutation.error && (
        <p role="alert" className="text-red-600">
          {mutation.error.message}
        </p>
      )}
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(
              `/api/v1/workshop/jobs/${job.id}/delivery`,
              { promisedAt: promisedAt || null },
              true,
            );
          }}
        >
          <label className="block text-sm">
            Promised delivery (local time)
            <input
              className={input}
              type="datetime-local"
              value={promisedAt}
              onChange={(event) => setPromisedAt(event.target.value)}
            />
          </label>
          <button className={button} disabled={mutation.isPending}>
            Save delivery time
          </button>
        </form>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(`/api/v1/workshop/jobs/${job.id}/estimates`, { amount: Number(amount), scope });
          }}
        >
          <label className="block text-sm">
            Estimate total including tax (₹)
            <input
              className={input}
              type="number"
              min="0.01"
              max="100000000"
              step="0.01"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Work scope
            <textarea
              className={input}
              required
              maxLength={1000}
              value={scope}
              onChange={(event) => setScope(event.target.value)}
            />
          </label>
          <button className={button} disabled={mutation.isPending}>
            Request estimate approval
          </button>
        </form>
      </div>
      {job.approval_status === 'REQUESTED' && (
        <form
          className="mt-6 space-y-3 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(`/api/v1/workshop/estimates/${job.estimate_id}/decision`, {
              status: event.nativeEvent.submitter?.value || 'APPROVED',
              contactName,
              method,
              notes,
            });
          }}
        >
          <h3 className="font-semibold">Record the customer's decision</h3>
          <p className="text-sm">
            ₹{Number(job.estimate_amount).toFixed(2)} · {job.scope}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Customer contact
              <input
                className={input}
                required
                maxLength={120}
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
              />
            </label>
            <label className="text-sm">
              Contact method
              <select
                className={input}
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                <option value="PHONE">Phone</option>
                <option value="IN_PERSON">In person</option>
                <option value="MESSAGE">Message</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            Decision notes
            <textarea
              className={input}
              required
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <p className="text-xs text-gray-500">
            Record consent you have already received. This screen does not contact the customer.
          </p>
          <div className="flex gap-3">
            <button className={button} disabled={mutation.isPending} value="APPROVED">
              Record approval
            </button>
            <button className={button} disabled={mutation.isPending} value="REJECTED">
              Record rejection
            </button>
          </div>
        </form>
      )}
      <h3 className="mt-5 font-semibold">Estimate history</h3>
      {history.isPending ? (
        <p>Loading history…</p>
      ) : history.error ? (
        <p role="alert">{history.error.message}</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {(history.data?.data || []).map((item) => (
            <li key={item.id}>
              #{item.id} · ₹{Number(item.amount).toFixed(2)} · {item.status} · {item.scope}
              {item.contact_name &&
                ` · ${item.contact_name} (${item.contact_method}): ${item.decision_notes}`}
            </li>
          ))}
        </ul>
      )}
      <MechanicTimePanel jobId={job.id} />
    </section>
  );
}

export default function WorkshopBoard() {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('job_cards.read');
  const client = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const queue = useQuery({
    queryKey: ['workshop-queue'],
    queryFn: () => api.get('/api/v1/workshop/queue'),
    enabled: canRead,
    refetchInterval: 60000,
  });
  const jobs = queue.data?.data || [];
  const job = jobs.find((item) => item.id === selected);
  const refresh = () => {
    client.invalidateQueries({ queryKey: ['workshop-queue'] });
    client.invalidateQueries({ queryKey: ['job-cards'] });
  };
  if (!canRead)
    return <p className="p-6">You do not have permission to view the workshop queue.</p>;
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">Workshop queue</h1>
        <p className="text-sm text-gray-500">
          Track customer approvals and promised delivery for open jobs.
        </p>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Find a job
          <input
            className={input}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Job number, registration or customer"
          />
        </label>
        <button className={button} onClick={() => queue.refetch()} disabled={queue.isFetching}>
          Refresh queue
        </button>
      </div>
      {queue.isPending ? (
        <p>Loading workshop queue…</p>
      ) : queue.error ? (
        <p role="alert" className="text-red-600">
          {queue.error.message}
        </p>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Open jobs sorted by promised delivery time</caption>
            <thead>
              <tr>
                {['Job', 'Vehicle', 'Customer', 'Delivery', 'Estimate', 'Approval', 'Actions'].map(
                  (label) => (
                    <th key={label} scope="col" className="p-2">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {jobs
                .filter((item) =>
                  `${item.job_card_number} ${item.registration_number} ${item.customer_name}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((item) => (
                  <tr key={item.id} className="border-t dark:border-gray-800">
                    <td className="p-2">{item.job_card_number}</td>
                    <td className="p-2">{item.registration_number}</td>
                    <td className="p-2">{item.customer_name}</td>
                    <td className="p-2">
                      {item.promised_delivery_at?.replace('T', ' ') || 'Unscheduled'}
                      {item.overdue === 1 && (
                        <strong className="block text-red-600">Overdue</strong>
                      )}
                    </td>
                    <td className="p-2">
                      {item.estimate_amount ? `₹${Number(item.estimate_amount).toFixed(2)}` : '—'}
                    </td>
                    <td className="p-2">{item.approval_status || 'No estimate requested'}</td>
                    <td className="p-2">
                      {hasPermission('job_cards.write') && (
                        <button
                          className={button}
                          onClick={() => setSelected(item.id)}
                          aria-label={`Manage ${item.job_card_number}`}
                        >
                          Manage
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {jobs.length === 0 && <p className="p-3">No open jobs.</p>}
        </div>
      )}
      {job && hasPermission('job_cards.write') && (
        <EstimateEditor key={job.id} job={job} refresh={refresh} />
      )}
    </div>
  );
}
