import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/apiClient.js';
import { useAppStore } from '../../shared/store/useAppStore.js';
import { Search, ShieldAlert, Award, FileText, CheckCircle, X, ChevronRight } from 'lucide-react';

export default function WarrantyManager() {
  const queryClient = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);

  const [activeTab, setActiveTab] = useState('registrations');
  const [search, setSearch] = useState('');
  
  // Claim Settlement Dialog
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [settlementType, setSettlementType] = useState('REPLACEMENT');
  const [warehouseId, setWarehouseId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [showSettleModal, setShowSettleModal] = useState(false);

  // File Claim Dialog
  const [selectedReg, setSelectedReg] = useState(null);
  const [claimNotes, setClaimNotes] = useState('');
  const [showClaimModal, setShowClaimModal] = useState(false);

  // Fetch Registrations
  const { data: regResponse, isLoading: loadingReg } = useQuery({
    queryKey: ['warranties', search],
    queryFn: () => api.get(`/api/v1/warranties?search=${encodeURIComponent(search)}`),
    enabled: activeTab === 'registrations'
  });

  // Fetch Claims
  const { data: claimsResponse, isLoading: loadingClaims } = useQuery({
    queryKey: ['warranty-claims'],
    queryFn: () => api.get('/api/v1/warranties/claims'),
    enabled: activeTab === 'claims'
  });

  // Fetch replacement batches if settling
  const { data: batchesResponse } = useQuery({
    queryKey: ['replacement-batches', selectedClaim?.item_id],
    queryFn: () => api.get(`/api/v1/inventory/items/${selectedClaim?.item_id}/batches`),
    enabled: !!selectedClaim && settlementType === 'REPLACEMENT'
  });

  const registrations = regResponse?.data || [];
  const claims = claimsResponse?.data || [];
  const batches = batchesResponse?.data || [];

  // File Claim Mutation
  const fileClaimMutation = useMutation({
    mutationFn: (payload) => api.post('/api/v1/warranties/claims', payload),
    onSuccess: () => {
      queryClient.invalidateQueries(['warranties']);
      queryClient.invalidateQueries(['warranty-claims']);
      addNotification('Warranty claim filed successfully.', 'success');
      setShowClaimModal(false);
      setClaimNotes('');
    },
    onError: (err) => {
      addNotification(err.message || 'Failed to file claim.', 'error');
    }
  });

  // Settle Claim Mutation
  const settleClaimMutation = useMutation({
    mutationFn: (payload) => api.post(`/api/v1/warranties/claims/${selectedClaim.id}/approve`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries(['warranties']);
      queryClient.invalidateQueries(['warranty-claims']);
      addNotification('Warranty claim settled and posted.', 'success');
      setShowSettleModal(false);
      setSelectedClaim(null);
    },
    onError: (err) => {
      addNotification(err.message || 'Failed to settle claim.', 'error');
    }
  });

  const handleFileClaim = (e) => {
    e.preventDefault();
    fileClaimMutation.mutate({
      registrationId: selectedReg.id,
      notes: claimNotes
    });
  };

  const handleSettleClaim = (e) => {
    e.preventDefault();
    const payload = {
      settlementType,
      notes: 'Claim approved and processed',
      replacementWarehouseId: settlementType === 'REPLACEMENT' ? Number(warehouseId) : undefined,
      replacementBatchId: settlementType === 'REPLACEMENT' ? Number(batchId) : undefined
    };
    settleClaimMutation.mutate(payload);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Warranty & Claims Hub</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Track parts warranty expirations, look up active registrations, and process claims.</p>
        </div>
      </div>

      <div className="flex border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab('registrations')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'registrations'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Warranty Registrations
        </button>
        <button
          onClick={() => setActiveTab('claims')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'claims'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Active Claims
        </button>
      </div>

      {activeTab === 'registrations' && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search registrations by vehicle reg, phone, or SKU..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus-ring"
          />
        </div>
      )}

      {/* Grid Data List */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
        {activeTab === 'registrations' ? (
          loadingReg ? (
            <div className="p-12 text-center text-sm text-gray-500">Loading registrations...</div>
          ) : registrations.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">No active warranty registrations found.</div>
          ) : (
            <table className="w-full border-collapse text-left text-sm text-gray-500 dark:text-gray-400">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="px-4 py-3">Part / SKU</th>
                  <th className="px-4 py-3">Owner & Vehicle</th>
                  <th className="px-4 py-3">Start Date</th>
                  <th className="px-4 py-3">Expiry Date</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {registrations.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-850">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-gray-900 dark:text-white">{r.item_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{r.sku}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-gray-800 dark:text-gray-200">{r.customer_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{r.registration_number}</p>
                    </td>
                    <td className="px-4 py-4">{r.start_date}</td>
                    <td className="px-4 py-4">{r.end_date}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.status === 'ACTIVE' 
                          ? 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400' 
                          : 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {r.status === 'ACTIVE' && (
                        <button
                          onClick={() => { setSelectedReg(r); setShowClaimModal(true); }}
                          className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                        >
                          File Claim
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          loadingClaims ? (
            <div className="p-12 text-center text-sm text-gray-500">Loading claims...</div>
          ) : claims.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">No active warranty claims found.</div>
          ) : (
            <table className="w-full border-collapse text-left text-sm text-gray-500 dark:text-gray-400">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="px-4 py-3">Claim No.</th>
                  <th className="px-4 py-3">Part Details</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Claim Date</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {claims.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-850">
                    <td className="px-4 py-4 font-mono font-bold text-gray-950 dark:text-white">{c.claim_number}</td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-gray-900 dark:text-white">{c.item_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{c.sku}</p>
                    </td>
                    <td className="px-4 py-4">{c.customer_name}</td>
                    <td className="px-4 py-4">{c.claim_date}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.status === 'SETTLED' 
                          ? 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400' 
                          : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {c.status === 'PENDING' && (
                        <button
                          onClick={() => { setSelectedClaim(c); setShowSettleModal(true); }}
                          className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                        >
                          Settle Claim
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* File Claim Modal */}
      {showClaimModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-950 dark:text-white">File Warranty Claim</h3>
              <button onClick={() => setShowClaimModal(false)} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-850"><X className="h-4 w-4" /></button>
            </div>
            
            <form onSubmit={handleFileClaim} className="p-6 space-y-4">
              <div>
                <p className="text-[10px] text-gray-500 font-semibold uppercase">Item to Claim</p>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{selectedReg?.item_name} ({selectedReg?.sku})</p>
              </div>

              <div>
                <label htmlFor="modal-claim-notes" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Failure description / Notes *</label>
                <textarea
                  id="modal-claim-notes"
                  required
                  value={claimNotes}
                  onChange={(e) => setClaimNotes(e.target.value)}
                  placeholder="E.g. Alternator failed diagnostic check, low voltage output."
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white h-24"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowClaimModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={fileClaimMutation.isPending}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  File Claim
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle Claim Modal */}
      {showSettleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-950 dark:text-white">Approve & Settle Claim</h3>
              <button onClick={() => setShowSettleModal(false)} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-850"><X className="h-4 w-4" /></button>
            </div>
            
            <form onSubmit={handleSettleClaim} className="p-6 space-y-4">
              <div>
                <label htmlFor="modal-settle-select" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Settlement Action *</label>
                <select
                  id="modal-settle-select"
                  value={settlementType}
                  onChange={(e) => setSettlementType(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                >
                  <option value="REPLACEMENT">Item Replacement</option>
                  <option value="REFUND">Refund (Credit Note)</option>
                  <option value="REPAIR">Repair</option>
                </select>
              </div>

              {settlementType === 'REPLACEMENT' && (
                <div className="space-y-4 bg-gray-50 dark:bg-gray-850/50 p-4 border border-gray-200 dark:border-gray-800 rounded-xl animate-fade-in">
                  <div>
                    <label htmlFor="modal-settle-warehouse" className="block text-[10px] font-bold text-gray-500 uppercase">Warehouse Source *</label>
                    <select
                      id="modal-settle-warehouse"
                      required={settlementType === 'REPLACEMENT'}
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                    >
                      <option value="">Choose warehouse...</option>
                      <option value="1">Karnal Warehouse</option>
                      <option value="2">Delhi Godown</option>
                    </select>
                  </div>
                  
                  <div>
                    <label htmlFor="modal-settle-batch" className="block text-[10px] font-bold text-gray-500 uppercase">Replacement Batch *</label>
                    <select
                      id="modal-settle-batch"
                      required={settlementType === 'REPLACEMENT'}
                      value={batchId}
                      onChange={(e) => setBatchId(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                    >
                      <option value="">Select batch...</option>
                      {batches
                        .filter(b => !warehouseId || Number(b.warehouse_id) === Number(warehouseId))
                        .map((b) => (
                          <option key={b.id} value={b.id}>{`${b.batch_number} (Qty: ${b.quantity})`}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settleClaimMutation.isPending}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  Approve Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
