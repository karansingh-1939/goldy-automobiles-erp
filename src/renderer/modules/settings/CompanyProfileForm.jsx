import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings } from 'lucide-react';
import { api } from '../../shared/api/api-client.js';
import { useAppStore } from '../../shared/store/use-app-store.js';

const inputClass =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-950 focus-ring dark:border-gray-700 dark:bg-gray-800 dark:text-white';

const FIELDS = [
  ['name', 'Workshop / company name', 'text'],
  ['address', 'Address (printed on bills)', 'textarea'],
  ['phone', 'Phone numbers', 'text'],
  ['email', 'Email (optional)', 'email'],
  ['gstin', 'Company GSTIN (blank if not registered)', 'text'],
  ['jobCardTerms', 'Job card terms', 'textarea'],
  ['invoiceTerms', 'Invoice terms (optional)', 'textarea'],
];

export default function CompanyProfileForm() {
  const queryClient = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);
  const [draft, setDraft] = useState(null);
  const profile = useQuery({
    queryKey: ['company-profile'],
    queryFn: () => api.get('/api/v1/settings/company'),
  });
  const states = useQuery({
    queryKey: ['gst-states'],
    queryFn: () => api.get('/api/v1/settings/company/states'),
    staleTime: Infinity,
  });
  const saved = profile.data?.data || {};
  const values = draft ?? saved;
  const save = useMutation({
    mutationFn: () => api.put('/api/v1/settings/company', values),
    onSuccess: () => {
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ['company-profile'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-company'] });
      addNotification('Company details saved. New bills will print them.', 'success');
    },
    onError: (error) =>
      addNotification(error.message || 'Could not save company details.', 'error'),
  });
  const set = (field, value) => setDraft({ ...values, [field]: value });

  return (
    <form
      className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3 dark:border-gray-800">
        <Settings className="h-5 w-5 text-brand-600 dark:text-brand-400" />
        <h3 className="font-bold text-gray-950 dark:text-white">Company Details</h3>
      </div>
      {profile.error && <p role="alert">Company details could not be loaded.</p>}
      {FIELDS.map(([field, label, type]) => (
        <label key={field} className="block text-xs font-semibold text-gray-600 dark:text-gray-400">
          {label}
          {type === 'textarea' ? (
            <textarea
              rows={2}
              className={inputClass}
              value={values[field] || ''}
              onChange={(event) => set(field, event.target.value)}
            />
          ) : (
            <input
              type={type}
              className={`${inputClass} ${field === 'gstin' ? 'font-mono uppercase' : ''}`}
              value={values[field] || ''}
              onChange={(event) => set(field, event.target.value)}
            />
          )}
        </label>
      ))}
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400">
        State (decides CGST/SGST or IGST on bills)
        <select
          className={inputClass}
          value={values.state || ''}
          onChange={(event) => set('state', event.target.value)}
        >
          {(Array.isArray(states.data?.data) ? states.data.data : []).map((state) => (
            <option key={state.code} value={state.name}>
              {state.code} · {state.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!draft || save.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {save.isPending ? 'Saving...' : 'Save company details'}
        </button>
        {draft && (
          <button
            type="button"
            className="rounded-lg border px-4 py-2 text-sm"
            onClick={() => setDraft(null)}
          >
            Undo changes
          </button>
        )}
      </div>
    </form>
  );
}
