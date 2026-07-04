import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/apiClient.js';
import { Search, ShoppingCart, FileText, CheckSquare } from 'lucide-react';

export default function PurchasingManager() {
  const [activeTab, setActiveTab] = useState('orders');
  const [search, setSearch] = useState('');

  // Fetch Purchase Orders
  const { data: poResponse, isLoading: loadingPO } = useQuery({
    queryKey: ['purchase-orders', search],
    queryFn: () => api.get(`/api/v1/purchases/orders?search=${encodeURIComponent(search)}`),
    enabled: activeTab === 'orders'
  });

  // Fetch Receipts
  const { data: prResponse, isLoading: loadingPR } = useQuery({
    queryKey: ['purchase-receipts', search],
    queryFn: () => api.get(`/api/v1/purchases/receipts?search=${encodeURIComponent(search)}`),
    enabled: activeTab === 'receipts'
  });

  const orders = poResponse?.data || [];
  const receipts = prResponse?.data || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Procurement & Purchasing</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Log incoming parts orders, track vendor deliveries, and verify receipts.</p>
        </div>
      </div>

      {/* Tabs Binders */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'orders'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Purchase Orders
        </button>
        <button
          onClick={() => setActiveTab('receipts')}
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
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${activeTab === 'orders' ? 'orders' : 'receipts'}...`}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus-ring"
        />
      </div>

      {/* Grid List Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
        {activeTab === 'orders' ? (
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
                    <td className="px-6 py-4 font-mono font-bold text-gray-950 dark:text-white">{po.purchase_number}</td>
                    <td className="px-6 py-4 text-brand-600 dark:text-brand-400 font-medium">{po.supplier_name}</td>
                    <td className="px-6 py-4">{po.purchase_date}</td>
                    <td className="px-6 py-4 text-right font-bold">₹{po.subtotal?.toFixed(2)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400`}>
                        {po.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          loadingPR ? (
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
                  <th className="px-6 py-3 text-center">Items Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {receipts.map((pr) => (
                  <tr key={pr.id} className="hover:bg-gray-50 dark:hover:bg-gray-850">
                    <td className="px-6 py-4 font-mono font-bold text-gray-950 dark:text-white">PR-{pr.id}</td>
                    <td className="px-6 py-4 font-mono">{pr.purchase_number || 'Direct'}</td>
                    <td className="px-6 py-4 text-brand-600 dark:text-brand-400 font-medium">{pr.supplier_name}</td>
                    <td className="px-6 py-4">{pr.received_date || pr.created_at?.slice(0,10)}</td>
                    <td className="px-6 py-4 text-center font-bold">{pr.item_count || 1} lines</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}
