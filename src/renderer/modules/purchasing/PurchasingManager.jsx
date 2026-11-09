import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import ServerPagination from '../../shared/components/ServerPagination.jsx';
import { Search } from 'lucide-react';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import PurchaseReceiptForm from './PurchaseReceiptForm.jsx';
import PurchaseReceiptDetails from './PurchaseReceiptDetails.jsx';

export default function PurchasingManager() {
  const { hasPermission } = usePermissions();
  const [creating, setCreating] = useState(false);
  const [receiptId, setReceiptId] = useState(null);
  const [activeTab, setActiveTab] = useState('orders');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Fetch Purchase Orders
  const {
    data: poResponse,
    isLoading: loadingPO,
    error: orderError,
    refetch: retryOrders,
  } = useQuery({
    queryKey: ['purchase-orders', search, page],
    queryFn: () =>
      api.get(
        `/api/v1/purchases/orders?search=${encodeURIComponent(search)}&page=${page}&pageSize=20`,
      ),
    enabled: hasPermission('purchases.read') && activeTab === 'orders',
  });

  // Fetch Receipts
  const {
    data: prResponse,
    isLoading: loadingPR,
    error: receiptError,
    refetch: retryReceipts,
  } = useQuery({
    queryKey: ['purchase-receipts', search, page],
    queryFn: () =>
      api.get(
        `/api/v1/purchases/receipts?search=${encodeURIComponent(search)}&page=${page}&pageSize=20`,
      ),
    enabled: hasPermission('purchases.read') && activeTab === 'receipts',
  });

  const orders = poResponse?.data || [];
  const receipts = prResponse?.data || [];
  const error = activeTab === 'orders' ? orderError : receiptError;
  const loading = activeTab === 'orders' ? loadingPO : loadingPR;
  const pagination = (activeTab === 'orders' ? poResponse : prResponse)?.pagination;

  if (!hasPermission('purchases.read'))
    return <p className="p-6">You do not have permission to view purchasing.</p>;
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Procurement & Purchasing
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Log incoming parts orders, track vendor deliveries, and verify receipts.
          </p>
        </div>
      </div>

      {hasPermission('purchases.write') && !creating && (
        <button className="rounded border px-3 py-2" onClick={() => setCreating(true)}>
          Record supplier invoice
        </button>
      )}
      {creating && (
        <PurchaseReceiptForm
          onCancel={() => setCreating(false)}
          onSaved={(receipt) => {
            setCreating(false);
            setActiveTab('receipts');
            setPage(1);
            setReceiptId(receipt.id);
          }}
        />
      )}
      {receiptId && <PurchaseReceiptDetails id={receiptId} onClose={() => setReceiptId(null)} />}
      {/* Tabs Binders */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => {
            setActiveTab('orders');
            setPage(1);
          }}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'orders'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Purchase Orders
        </button>
        <button
          onClick={() => {
            setActiveTab('receipts');
            setPage(1);
          }}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'receipts'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Purchase Receipts
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={`Search ${activeTab === 'orders' ? 'orders' : 'receipts'}...`}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus-ring"
        />
      </div>

      {/* Grid List Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
        {error ? (
          <div role="alert" className="p-6 text-sm text-red-600">
            {error.message}
            <button
              type="button"
              className="ml-3 underline"
              onClick={() => (activeTab === 'orders' ? retryOrders() : retryReceipts())}
            >
              Retry
            </button>
          </div>
        ) : activeTab === 'orders' ? (
          loadingPO ? (
            <div className="p-12 text-center text-sm text-gray-500">Loading purchase orders...</div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">No purchase orders open.</div>
          ) : (
            <table className="w-full border-collapse text-left text-sm text-gray-500 dark:text-gray-400">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="px-6 py-3">PO Number</th>
                  <th className="px-6 py-3">Vendor / Supplier</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3 text-right">Taxable (₹)</th>
                  <th className="px-6 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {orders.map((po) => (
                  <tr key={po.id} className="hover:bg-gray-50 dark:hover:bg-gray-850">
                    <td className="px-6 py-4 font-mono font-bold text-gray-950 dark:text-white">
                      {po.order_number}
                    </td>
                    <td className="px-6 py-4 text-brand-600 dark:text-brand-400 font-medium">
                      {po.supplier_name}
                    </td>
                    <td className="px-6 py-4">{po.order_date}</td>
                    <td className="px-6 py-4 text-right font-bold">₹{po.subtotal?.toFixed(2)}</td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400`}
                      >
                        {po.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : loadingPR ? (
          <div className="p-12 text-center text-sm text-gray-500">Loading receipts...</div>
        ) : receipts.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">No purchase receipts logged.</div>
        ) : (
          <table className="w-full border-collapse text-left text-sm text-gray-500 dark:text-gray-400">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="px-6 py-3">Receipt ID</th>
                <th className="px-6 py-3">PO Reference</th>
                <th className="px-6 py-3">Vendor</th>
                <th className="px-6 py-3">Received Date</th>
                <th className="px-6 py-3 text-right">Subtotal (₹)</th>
                <th className="px-6 py-3 text-right">GST (₹)</th>
                <th className="px-6 py-3 text-right">Grand total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {receipts.map((pr) => (
                <tr key={pr.id} className="hover:bg-gray-50 dark:hover:bg-gray-850">
                  <td className="px-6 py-4 font-mono font-bold text-gray-950 dark:text-white">
                    <button type="button" className="underline" onClick={() => setReceiptId(pr.id)}>
                      {pr.receipt_number || `PR-${pr.id}`}
                    </button>
                  </td>
                  <td className="px-6 py-4 font-mono">
                    {pr.order_number ||
                      (pr.purchase_order_id ? `PO #${pr.purchase_order_id}` : 'Direct')}
                  </td>
                  <td className="px-6 py-4 text-brand-600 dark:text-brand-400 font-medium">
                    {pr.supplier_name}
                  </td>
                  <td className="px-6 py-4">{pr.receipt_date || pr.created_at?.slice(0, 10)}</td>
                  <td className="px-6 py-4 text-right">{Number(pr.subtotal || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 text-right">{Number(pr.gst_total || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 text-right font-bold">
                    {Number(pr.grand_total || 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ServerPagination
        page={page}
        totalPages={pagination?.totalPages || 1}
        onChange={setPage}
        disabled={loading || Boolean(error)}
      />
    </div>
  );
}
