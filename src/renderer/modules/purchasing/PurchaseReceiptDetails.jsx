import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import DataTable from '../../shared/components/DataTable.jsx';

export default function PurchaseReceiptDetails({ id, onClose }) {
  const query = useQuery({
    queryKey: ['purchase-receipt', id],
    queryFn: () => api.get(`/api/v1/purchases/receipts/${id}`),
  });
  const receipt = query.data?.data;
  const supplier = useQuery({
    queryKey: ['receipt-supplier', receipt?.supplier_id],
    queryFn: () => api.get(`/api/v1/suppliers/${receipt.supplier_id}`),
    enabled: Boolean(receipt?.supplier_id),
  });
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex gap-3">
        <h2 className="text-lg font-semibold">Receipt details {receipt?.receipt_number}</h2>
        <button type="button" onClick={onClose}>
          Close receipt
        </button>
      </div>
      {query.error && (
        <p role="alert">
          {query.error.message}
          <button onClick={() => query.refetch()}>Retry receipt</button>
        </p>
      )}
      {query.isPending && <p>Loading receipt...</p>}
      {receipt && (
        <>
          <p>
            {receipt.receipt_date} · {receipt.status} ·{' '}
            {supplier.data?.data?.name || `Supplier #${receipt.supplier_id}`} · GSTIN{' '}
            {supplier.data?.data?.gstin || 'Unregistered'}
          </p>
          {supplier.error && <p role="alert">{supplier.error.message}</p>}
          <p>{receipt.notes}</p>
          <DataTable
            enablePagination={false}
            data={receipt.items || []}
            columns={[
              'item_name',
              'sku',
              'warehouse_name',
              'batch_number',
              'quantity',
              'purchase_cost',
              'selling_price',
              'gst_rate',
              'gst_amount',
              'line_total',
            ].map((key) => ({ accessorKey: key, header: key.replaceAll('_', ' ') }))}
          />
          <p>
            Subtotal ₹{Number(receipt.subtotal).toFixed(2)} · GST ₹
            {Number(receipt.gst_total).toFixed(2)} · Total ₹{Number(receipt.grand_total).toFixed(2)}
          </p>
        </>
      )}
    </section>
  );
}
