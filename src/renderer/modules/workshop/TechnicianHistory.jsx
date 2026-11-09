import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import DataTable from '../../shared/components/DataTable.jsx';
import ServerPagination from '../../shared/components/ServerPagination.jsx';

export default function TechnicianHistory({ technician, onClose }) {
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: ['technician-history', technician.id, page],
    queryFn: () => api.get(`/api/v1/technicians/${technician.id}/history?page=${page}&pageSize=10`),
  });
  const metrics = history.data?.metrics;
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex gap-3">
        <h2 className="font-semibold">Work history: {technician.full_name}</h2>
        <button type="button" onClick={onClose}>
          Close history
        </button>
      </div>
      <p>
        {technician.phone_number} · {technician.specialization || 'General'} ·{' '}
        {technician.notes || 'No notes'}
      </p>
      {metrics && (
        <p>
          Assigned jobs: {metrics.totalAssignedJobs} · Completed jobs: {metrics.completedJobs} ·
          Active jobs: {metrics.activeJobs}
        </p>
      )}
      <DataTable
        data={history.data?.history || []}
        isLoading={history.isPending}
        error={history.error}
        enablePagination={false}
        columns={[
          {
            accessorKey: 'openedAt',
            header: 'Opened',
            cell: ({ getValue }) => getValue()?.slice(0, 10) || '—',
          },
          { accessorKey: 'jobCardNumber', header: 'Job card' },
          {
            id: 'vehicle',
            header: 'Vehicle',
            cell: ({ row }) =>
              `${row.original.vehicle?.registrationNumber || ''} ${row.original.vehicle?.make || ''} ${row.original.vehicle?.model || ''}`,
          },
          { id: 'customer', header: 'Customer', cell: ({ row }) => row.original.customer?.name },
          { accessorKey: 'jobCardStatus', header: 'Status' },
          {
            id: 'invoice',
            header: 'Invoice',
            cell: ({ row }) =>
              row.original.invoice
                ? `${row.original.invoice.invoiceNumber} · ${row.original.invoice.status} · ₹${Number(row.original.invoice.grandTotal).toFixed(2)}`
                : 'Not invoiced',
          },
        ]}
      />
      <ServerPagination
        page={page}
        totalPages={Math.ceil((metrics?.totalAssignedJobs || 0) / 10)}
        disabled={history.isFetching || Boolean(history.error)}
        onChange={setPage}
      />
    </section>
  );
}
