import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { useAppStore } from '../../shared/store/use-app-store.js';
import { Search, Plus, Undo2, X } from 'lucide-react';

export default function ReturnsManager() {
  const queryClient = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);

  const [activeTab, setActiveTab] = useState('customer');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State (Customer Return)
  const [jobCardId, setJobCardId] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [condition, setCondition] = useState('GOOD');

  // Fetch Returns
  const { data: custResponse, isLoading: loadingCust } = useQuery({
    queryKey: ['customer-returns', search],
    queryFn: () => api.get(`/api/v1/returns/customer?search=${encodeURIComponent(search)}`),
    enabled: activeTab === 'customer',
  });

  const { data: supResponse, isLoading: loadingSup } = useQuery({
    queryKey: ['supplier-returns', search],
    queryFn: () => api.get(`/api/v1/returns/supplier?search=${encodeURIComponent(search)}`),
    enabled: activeTab === 'supplier',
  });

  const { data: jcResponse, error: jobsError } = useQuery({
    queryKey: ['return-job-cards', invoiceSearch],
    queryFn: () =>
      api.get(
        `/api/v1/job-cards?status=COMPLETED&pageSize=100&search=${encodeURIComponent(invoiceSearch)}`,
      ),
    enabled: showAddModal,
  });
  const { data: jobResponse, error: jobError } = useQuery({
    queryKey: ['return-job-card', jobCardId],
    queryFn: () => api.get(`/api/v1/job-cards/${jobCardId}`),
    enabled: showAddModal && Boolean(jobCardId),
  });
  const invoiceId =
    jobResponse?.data?.invoice?.status === 'FINALIZED' ? jobResponse.data.invoice.id : null;
  const { data: invoiceResponse, error: invoiceError } = useQuery({
    queryKey: ['return-invoice', invoiceId],
    queryFn: () => api.get(`/api/v1/invoices/${invoiceId}`),
    enabled: showAddModal && Boolean(invoiceId),
  });
  const customerReturns = custResponse?.data || [];
  const supplierReturns = supResponse?.data || [];
  const invoices = jcResponse?.data || [];
  const items = (invoiceResponse?.data?.items || []).filter(
    (item) => item.inventory_item_id && item.batch_id,
  );
  const selectedItem = items.find((item) => String(item.inventory_item_id) === itemId);
  const formError = jobsError || jobError || invoiceError;

  // Create Return Mutation
  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/api/v1/returns/customer', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-returns'] });
      addNotification('Customer return draft generated.', 'success');
      setShowAddModal(false);
      // Reset Form
      setJobCardId('');
      setItemId('');
      setQty('1');
    },
    onError: (err) => {
      addNotification(err.message || 'Failed to create return.', 'error');
    },
  });

  // Approve Customer Return
  const approveMutation = useMutation({
    mutationFn: (id) => api.post(`/api/v1/returns/customer/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-returns'] });
      addNotification(
        'Customer return approved. Credit Note posted and stock restored.',
        'success',
      );
    },
    onError: (err) => {
      addNotification(err.message || 'Failed to approve return.', 'error');
    },
  });

  // Approve Supplier Return
  const approveSupMutation = useMutation({
    mutationFn: (id) => api.post(`/api/v1/returns/supplier/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-returns'] });
      addNotification(
        'Supplier return approved. Debit Note posted and stock decremented.',
        'success',
      );
    },
    onError: (err) => {
      addNotification(err.message || 'Failed to approve return.', 'error');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!invoiceId || !selectedItem || !Number.isFinite(Number(qty)) || Number(qty) <= 0) {
      addNotification('Select an invoice part and a positive return quantity.', 'error');
      return;
    }

    const payload = {
      invoiceId: Number(invoiceId),
      items: [
        {
          itemId: Number(itemId),
          quantity: Number(qty),
          batchId: selectedItem.batch_id,
          condition,
        },
      ],
    };

    createMutation.mutate(payload);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Reverse Logistics & Returns
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Post sales returns, supplier returns, and reverse warehouse stock flows.
          </p>
        </div>
        {activeTab === 'customer' && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Return
          </button>
        )}
      </div>

      <div className="flex border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab('customer')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'customer'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Customer Returns (Credit Notes)
        </button>
        <button
          onClick={() => setActiveTab('supplier')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'supplier'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Supplier Returns (Debit Notes)
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${activeTab === 'customer' ? 'customer' : 'supplier'} returns...`}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus-ring"
        />
      </div>

      {/* Grid List Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
        {activeTab === 'customer' ? (
          loadingCust ? (
            <div className="p-12 text-center text-sm text-gray-500">Loading returns...</div>
          ) : customerReturns.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">No customer returns Open.</div>
          ) : (
            <table className="w-full border-collapse text-left text-sm text-gray-500 dark:text-gray-400">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="px-4 py-3">Return ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Value (₹)</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {customerReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-850">
                    <td className="px-4 py-4 font-mono font-bold text-gray-950 dark:text-white">
                      {r.return_number}
                    </td>
                    <td className="px-4 py-4 text-brand-600 dark:text-brand-400 font-semibold">
                      {r.customer_name}
                    </td>
                    <td className="px-4 py-4 text-right font-bold">
                      ₹{r.total_refund_amount?.toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.status === 'COMPLETED'
                            ? 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400'
                            : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {r.status === 'DRAFT' && (
                        <button
                          onClick={() => approveMutation.mutate(r.id)}
                          className="text-xs font-semibold text-green-600 hover:text-green-700"
                        >
                          Approve Return
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : loadingSup ? (
          <div className="p-12 text-center text-sm text-gray-500">Loading returns...</div>
        ) : supplierReturns.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">No supplier returns Open.</div>
        ) : (
          <table className="w-full border-collapse text-left text-sm text-gray-500 dark:text-gray-400">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="px-4 py-3">Return ID</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3 text-right">Value (₹)</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {supplierReturns.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-850">
                  <td className="px-4 py-4 font-mono font-bold text-gray-950 dark:text-white">
                    {r.return_number}
                  </td>
                  <td className="px-4 py-4 text-brand-600 dark:text-brand-400 font-semibold">
                    {r.supplier_name}
                  </td>
                  <td className="px-4 py-4 text-right font-bold">
                    ₹{r.total_refund_amount?.toFixed(2)}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.status === 'COMPLETED'
                          ? 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400'
                          : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    {r.status === 'DRAFT' && (
                      <button
                        onClick={() => approveSupMutation.mutate(r.id)}
                        className="text-xs font-semibold text-green-600 hover:text-green-700"
                      >
                        Approve Return
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Return Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
                <Undo2 className="h-5 w-5" />
                <h3 className="text-lg font-bold">New Sales Invoice Return</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <p role="alert" className="px-6 text-sm text-red-700">
                {formError.message}
              </p>
            )}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label
                    htmlFor="modal-ret-invoice"
                    className="block text-xs font-semibold text-gray-600 dark:text-gray-400"
                  >
                    Select Invoice *
                  </label>
                  <input
                    aria-label="Find completed job"
                    placeholder="Search job number, customer, or vehicle..."
                    value={invoiceSearch}
                    onChange={(e) => {
                      setInvoiceSearch(e.target.value);
                      setJobCardId('');
                      setItemId('');
                    }}
                    className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm dark:bg-gray-800"
                  />
                  <select
                    id="modal-ret-invoice"
                    required
                    value={jobCardId}
                    onChange={(e) => {
                      setJobCardId(e.target.value);
                      setItemId('');
                    }}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  >
                    <option value="">Select invoice...</option>
                    {invoices.map((inv) => (
                      <option
                        key={inv.id}
                        value={inv.id}
                      >{`${inv.job_card_number} (Owner: ${inv.customer_name})`}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label
                    htmlFor="modal-ret-part"
                    className="block text-xs font-semibold text-gray-600 dark:text-gray-400"
                  >
                    Select Returned Part *
                  </label>
                  <select
                    id="modal-ret-part"
                    required
                    value={itemId}
                    onChange={(e) => setItemId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  >
                    <option value="">Select SKU...</option>
                    {items.map((i) => (
                      <option
                        key={i.id || i.inventory_item_id}
                        value={i.inventory_item_id}
                      >{`${i.description} (sold: ${i.quantity})`}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="modal-ret-qty"
                    className="block text-xs font-semibold text-gray-600 dark:text-gray-400"
                  >
                    Return Quantity *
                  </label>
                  <input
                    id="modal-ret-qty"
                    type="number"
                    required
                    min="0.001"
                    step="any"
                    max={selectedItem?.quantity}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <p className="col-span-2 text-xs text-gray-500">
                  Returned stock goes back to the original invoice batch and warehouse.
                </p>
                <div>
                  <label
                    htmlFor="modal-ret-condition"
                    className="block text-xs font-semibold text-gray-600 dark:text-gray-400"
                  >
                    Condition Status
                  </label>
                  <select
                    id="modal-ret-condition"
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  >
                    <option value="GOOD">Good (Restorable)</option>
                    <option value="DAMAGED">Damaged (Write-off Loss)</option>
                  </select>
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
                  disabled={createMutation.isPending || !selectedItem || Boolean(formError)}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  Draft Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
