import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/apiClient.js';
import { useAppStore } from '../../shared/store/useAppStore.js';
import { Search, Plus, ShoppingBag, X, CheckCircle } from 'lucide-react';

export default function SalesOrderManager() {
  const queryClient = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);

  const [search, setSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [customerId, setCustomerId] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');

  // Fetch Sales Orders
  const { data: ordersResponse, isLoading, error } = useQuery({
    queryKey: ['sales-orders', search],
    queryFn: () => api.get(`/api/v1/sales-orders?search=${encodeURIComponent(search)}`),
  });

  const orders = ordersResponse?.data || [];

  // Fetch customers and inventory for form dropdowns
  const { data: customersResponse } = useQuery({ queryKey: ['customers-list'], queryFn: () => api.get('/api/v1/customers') });
  const { data: itemsResponse } = useQuery({ queryKey: ['inventory-items-list'], queryFn: () => api.get('/api/v1/inventory/items') });

  const customers = customersResponse?.data || [];
  const items = itemsResponse?.data || [];

  // Create Sales Order Mutation
  const createMutation = useMutation({
    mutationFn: (newOrder) => api.post('/api/v1/sales-orders', newOrder),
    onSuccess: () => {
      queryClient.invalidateQueries(['sales-orders']);
      addNotification('Sales order drafted successfully.', 'success');
      setShowAddModal(false);
      // Reset Form
      setCustomerId('');
      setItemId('');
      setQty('1');
      setPrice('');
    },
    onError: (err) => {
      addNotification(err.message || 'Failed to create sales order.', 'error');
    }
  });

  // Confirm/Approve Sales Order
  const confirmMutation = useMutation({
    mutationFn: (id) => api.post(`/api/v1/sales-orders/${id}/confirm`),
    onSuccess: () => {
      queryClient.invalidateQueries(['sales-orders']);
      addNotification('Sales order confirmed and customer reserve allocated.', 'success');
    },
    onError: (err) => {
      addNotification(err.message || 'Failed to confirm order.', 'error');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!customerId || !itemId || !qty || !price) {
      addNotification('Customer, Item, Quantity, and Price are required.', 'error');
      return;
    }

    const payload = {
      customerId: Number(customerId),
      orderDate,
      items: [
        {
          itemId: Number(itemId),
          quantity: Number(qty),
          unitPrice: Number(price)
        }
      ]
    };

    createMutation.mutate(payload);
  };

  const selectedOrder = orders.find(o => o.id === selectedOrderId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Sales Orders & Bookings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage client commitment bookings, quotations, and stock reservations.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Draft Order
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Side List */}
        <div className="col-span-2 space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order number or customer name..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus-ring"
            />
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
            {isLoading ? (
              <div className="p-12 text-center text-sm text-gray-500">Loading sales orders...</div>
            ) : error ? (
              <div className="p-12 text-center text-sm text-red-500">Error loading orders: {error.message}</div>
            ) : orders.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-500">No sales orders Open.</div>
            ) : (
              <table className="w-full border-collapse text-left text-sm text-gray-500 dark:text-gray-400">
                <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
                  <tr>
                    <th className="px-4 py-3">Order Number</th>
                    <th className="px-4 py-3">Customer Account</th>
                    <th className="px-4 py-3">Order Date</th>
                    <th className="px-4 py-3 text-right">Total Value (₹)</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {orders.map((o) => {
                    const isSelected = selectedOrderId === o.id;
                    return (
                      <tr
                        key={o.id}
                        onClick={() => setSelectedOrderId(o.id)}
                        className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-850 ${
                          isSelected ? 'bg-brand-50/50 dark:bg-brand-900/10' : ''
                        }`}
                      >
                        <td className="px-4 py-4 font-mono font-bold text-gray-950 dark:text-white">{o.order_number}</td>
                        <td className="px-4 py-4 text-brand-600 dark:text-brand-400 font-medium">{o.customer_name}</td>
                        <td className="px-4 py-4">{o.order_date}</td>
                        <td className="px-4 py-4 text-right font-bold">₹{o.grand_total ? o.grand_total.toFixed(2) : '0.00'}</td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            o.status === 'CONFIRMED' 
                              ? 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400' 
                              : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
                          }`}>
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Side Detail Pane */}
        <div className="col-span-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm h-fit space-y-6">
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
            <ShoppingBag className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <h3 className="font-bold text-gray-950 dark:text-white">Order Details</h3>
          </div>

          {!selectedOrder ? (
            <div className="p-12 text-center text-xs text-gray-400">
              Select an order from the table to manage confirmation and fulfillment actions.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-gray-500 font-semibold uppercase">Customer Profile</p>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-0.5">{selectedOrder.customer_name}</p>
              </div>

              <div>
                <p className="text-[10px] text-gray-500 font-semibold uppercase">Grand Total</p>
                <p className="text-sm font-bold text-brand-600 dark:text-brand-400 mt-0.5">₹{selectedOrder.grand_total ? selectedOrder.grand_total.toFixed(2) : '0.00'}</p>
              </div>

              {selectedOrder.status === 'DRAFT' && (
                <button
                  onClick={() => confirmMutation.mutate(selectedOrder.id)}
                  disabled={confirmMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <CheckCircle className="h-4 w-4" />
                  Confirm & Reserve Stock
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
                <ShoppingBag className="h-5 w-5" />
                <h3 className="text-lg font-bold">New Sales Order Commitment</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label htmlFor="modal-order-customer" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Select Customer *</label>
                  <select
                    id="modal-order-customer"
                    required
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  >
                    <option value="">Choose client...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="modal-order-date" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Order Date</label>
                  <input
                    id="modal-order-date"
                    type="date"
                    required
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label htmlFor="modal-order-item" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Select Stock Item *</label>
                  <select
                    id="modal-order-item"
                    required
                    value={itemId}
                    onChange={(e) => setItemId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  >
                    <option value="">Select SKU...</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>{`${i.sku} - ${i.item_name} (Price: ₹${i.selling_price})`}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="modal-order-qty" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Quantity *</label>
                  <input
                    id="modal-order-qty"
                    type="number"
                    required
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="modal-order-price" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Unit Price (₹) *</label>
                  <input
                    id="modal-order-price"
                    type="number"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  Create Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
