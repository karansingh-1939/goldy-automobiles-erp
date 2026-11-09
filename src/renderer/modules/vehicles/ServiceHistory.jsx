import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../shared/api/api-client.js';
import RemoteSelect from '../../shared/components/RemoteSelect.jsx';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
const money = (n) => `₹${Number(n || 0).toFixed(2)}`;
export default function ServiceHistory() {
  const [params] = useSearchParams();
  const [vehicleId, setVehicleId] = useState(params.get('vehicleId') || '');
  const { hasPermission } = usePermissions();
  const history = useQuery({
    queryKey: ['service-history', vehicleId],
    queryFn: ({ signal }) => api.get(`/api/v1/vehicles/${vehicleId}/service-history`, { signal }),
    enabled: Boolean(vehicleId) && hasPermission('vehicles.read'),
  });
  const data = history.data?.data;
  if (!hasPermission('vehicles.read'))
    return <p className="p-6">Vehicle read permission required.</p>;
  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold">Vehicle Service History</h1>
      <label htmlFor="history-vehicle">Vehicle</label>
      <RemoteSelect
        id="history-vehicle"
        endpoint="/api/v1/vehicles"
        queryKey="history-vehicles"
        value={vehicleId}
        onChange={setVehicleId}
        searchLabel="Search vehicle registration, make or model"
        optionLabel={(v) => `${v.registration_number} ${v.make || ''} ${v.model || ''}`}
      />
      {history.isLoading && <p role="status">Loading service history...</p>}
      {history.error && (
        <p role="alert">
          {history.error.message} <button onClick={() => history.refetch()}>Retry</button>
        </p>
      )}
      {data && (
        <>
          <section className="rounded border p-4">
            <h2 className="font-semibold">{data.vehicle.registrationNumber}</h2>
            <p>
              {data.customer?.name} · {data.customer?.phone}
            </p>
            <p>
              {[data.vehicle.make, data.vehicle.model, data.vehicle.variant]
                .filter(Boolean)
                .join(' ')}
            </p>
            <dl className="grid grid-cols-2 gap-2">
              <dt>Engine number</dt>
              <dd>{data.vehicle.engineNumber || '—'}</dd>
              <dt>Chassis number</dt>
              <dd>{data.vehicle.chassisNumber || '—'}</dd>
              <dt>Fuel / year</dt>
              <dd>
                {data.vehicle.fuelType || '—'} / {data.vehicle.year || '—'}
              </dd>
              <dt>Total visits</dt>
              <dd>{data.summary.totalVisits}</dd>
              <dt>Revenue from finalized invoices</dt>
              <dd>{money(data.summary.totalRevenue)}</dd>
              <dt>Last visit</dt>
              <dd>{data.summary.lastVisitDate || '—'}</dd>
            </dl>
          </section>
          {!data.history.length && <p>No maintenance visits recorded for this vehicle.</p>}
          {data.history.map((visit, index) => (
            <article
              key={`${visit.jobCardNumber}-${index}`}
              className="space-y-3 rounded border p-4"
            >
              <h2 className="font-semibold">
                {visit.serviceDate || 'Draft visit'} · {visit.jobCardNumber} · {visit.jobCardStatus}
              </h2>
              <p>
                Invoice: {visit.invoiceNumber || 'Not invoiced'} {visit.invoiceStatus} · Odometer:{' '}
                {visit.odometerReading ?? '—'} km · Total: {money(visit.invoiceTotal)}
              </p>
              {[
                ['Services & Labour Billed', visit.services],
                ['Parts & Lubricants Replaced', visit.parts],
              ].map(([title, rows]) => (
                <section key={title}>
                  <h3>{title}</h3>
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Quantity</th>
                        <th>Rate</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i}>
                          <td>{row.description}</td>
                          <td>{row.quantity}</td>
                          <td>{money(row.unitPrice)}</td>
                          <td>{money(row.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!rows.length && <p className="text-sm text-gray-500">No items billed.</p>}
                </section>
              ))}
            </article>
          ))}
        </>
      )}
    </div>
  );
}
