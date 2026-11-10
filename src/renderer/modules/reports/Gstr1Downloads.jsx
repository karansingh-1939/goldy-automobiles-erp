import React, { useState } from 'react';
import { api } from '../../shared/api/api-client.js';
import { useAppStore } from '../../shared/store/use-app-store.js';

const FILES = [
  ['b2b', 'B2B bills (customers with GSTIN)'],
  ['b2cs', 'B2C bills (walk-in customers)'],
  ['cdn', 'Credit notes (returns)'],
  ['hsn', 'HSN / SAC summary'],
  ['docs', 'Documents issued'],
];

function lastMonth() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  const iso = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { from: iso(first), to: iso(last) };
}

// One-click GSTR-1 files for the CA; each opens in Excel.
export default function Gstr1Downloads() {
  const addNotification = useAppStore((state) => state.addNotification);
  const [period, setPeriod] = useState(lastMonth);
  const [busy, setBusy] = useState('');
  const download = async (section) => {
    setBusy(section);
    try {
      const blob = await api.get(
        `/api/v1/gst/gstr1-export/${section}.csv?dateFrom=${period.from}&dateTo=${period.to}`,
        { responseType: 'blob' },
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `GSTR1_${section}_${period.from}_to_${period.to}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      addNotification(error.message || 'Could not create the file.', 'error');
    } finally {
      setBusy('');
    }
  };
  return (
    <section className="no-print space-y-3 rounded-xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-semibold">GST return files for your CA (GSTR-1)</h2>
      <p className="text-sm text-gray-500">
        Choose the month or quarter, then download each file and send them to your CA. They open in
        Excel.
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm font-medium">
          From
          <input
            type="date"
            className="mt-1 block rounded border p-2 dark:bg-gray-800"
            value={period.from}
            onChange={(e) => setPeriod({ ...period, from: e.target.value })}
          />
        </label>
        <label className="text-sm font-medium">
          To
          <input
            type="date"
            className="mt-1 block rounded border p-2 dark:bg-gray-800"
            value={period.to}
            onChange={(e) => setPeriod({ ...period, to: e.target.value })}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILES.map(([section, label]) => (
          <button
            key={section}
            type="button"
            disabled={Boolean(busy)}
            onClick={() => download(section)}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60 dark:hover:bg-gray-800"
          >
            {busy === section ? 'Preparing...' : `Download: ${label}`}
          </button>
        ))}
      </div>
    </section>
  );
}
