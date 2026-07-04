import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/apiClient.js';
import { useAppStore } from '../../shared/store/useAppStore.js';
import { Search, Plus, Wrench, X, Play, ShieldAlert, CheckCircle } from 'lucide-react';

export default function JobCardManager() {
  const queryClient = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);

  const [search, setSearch] = useState('');
  const [selectedJcId, setSelectedJcId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPartModal, setShowPartModal] = useState(false);
  const [showLabourModal, setShowLabourModal] = useState(false);

  // Job Card Form State
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [odometer, setOdometer] = useState('');
  const [complaint, setComplaint] = useState('');
  const [fuelLevel, setFuelLevel] = useState('1/2');

  // Add Part Form State
  const [partItemId, setPartItemId] = useState('');
  const [partQty, setPartQty] = useState('1');
  const [partPrice, setPartPrice] = useState('');

  // Add Labour Form State
  const [labourDesc, setLabourDesc] = useState('');
  const [labourCost, setLabourCost] = useState('');

  // Fetch Job Cards
  const { data: jcResponse, isLoading, error } = useQuery({
    queryKey: ['job-cards', search],
    queryFn: () => api.get(`/api/v1/job-cards?search=${encodeURIComponent(search)}`),
  });

  // Fetch Vehicles & Customers for creation
  const { data: vehiclesResponse } = useQuery({ queryKey: ['vehicles-list'], queryFn: () => api.get('/api/v1/vehicles') });
  const { data: customersResponse } = useQuery({ queryKey: ['customers-list'], queryFn: () => api.get('/api/v1/customers') });
  const { data: itemsResponse } = useQuery({ queryKey: ['parts-items'], queryFn: () => api.get('/api/v1/inventory/items') });

  const jobCards = jcResponse?.data || [];
  const vehicles = vehiclesResponse?.data || [];
  const customers = customersResponse?.data || [];
  const partsItems = itemsResponse?.data || [];

  // Fetch Single Job Card detail
  const { data: jcDetailResponse, isLoading: loadingDetail } = useQuery({
    queryKey: ['job-card-detail', selectedJcId],
    queryFn: () => api.get(`/api/v1/job-cards/${selectedJcId}`),
    enabled: !!selectedJcId
  });

  const jcDetail = jcDetailResponse?.data || null;

  // Mutations
  const createMutation = useMutation({
    mutationFn: (newJc) => api.post('/api/v1/job-cards', newJc),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['job-cards']);
      addNotification('Job card opened successfully.', 'success');
      setShowAddModal(false);
      setSelectedJcId(res.data.id);
      // Reset form
      setCustomerId('');
      setVehicleId('');
      setOdometer('');
      setComplaint('');
    }
  });

  const addPartMutation = useMutation({
    mutationFn: (partPayload) => api.post(`/api/v1/job-cards/${selectedJcId}/parts`, partPayload),
    onSuccess: () => {
      queryClient.invalidateQueries(['job-card-detail', selectedJcId]);
      addNotification('Part entry logged to Job Card.', 'success');
      setShowPartModal(false);
      setPartItemId('');
      setPartQty('1');
      setPartPrice('');
    }
  });

  const addLabourMutation = useMutation({
    mutationFn: (labourPayload) => api.post(`/api/v1/job-cards/${selectedJcId}/labour`, labourPayload),
    onSuccess: () => {
      queryClient.invalidateQueries(['job-card-detail', selectedJcId]);
      addNotification('Labor description logged.', 'success');
      setShowLabourModal(false);
      setLabourDesc('');
      setLabourCost('');
    }
  });

  const finalizeMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/job-cards/${selectedJcId}/finalize`),
    onSuccess: () => {
      queryClient.invalidateQueries(['job-cards']);
      queryClient.invalidateQueries(['job-card-detail', selectedJcId]);
      addNotification('Job card invoice finalized and posted to General Ledger.', 'success');
    }
  });

  const handleCreateJc = (e) => {
    e.preventDefault();
    createMutation.mutate({
      customer_id: Number(customerId),
      vehicle_id: Number(vehicleId),
      odometer_reading: Number(odometer),
      complaint,
      fuel_level: fuelLevel
    });
  };

  const handleAddPart = (e) => {
    e.preventDefault();
    const item = partsItems.find(i => Number(i.id) === Number(partItemId));
    addPartMutation.mutate({
      inventory_item_id: Number(partItemId),
      quantity: Number(partQty),
      selling_price: partPrice ? Number(partPrice) : item?.selling_price || 0
    });
  };

  const handleAddLabour = (e) => {
    e.preventDefault();
    addLabourMutation.mutate({
      description: labourDesc,
      cost: Number(labourCost)
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Job Cards & Workshop Invoicing</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Track active repair jobs, log materials, and draft tax invoices.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Job Card
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left pane - Job Cards List */}
        <div className="col-span-1 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by job number, registration..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus-ring"
            />
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-200 dark:divide-gray-800">
            {isLoading ? (
              <div className="p-12 text-center text-sm text-gray-500">Loading jobs...</div>
            ) : error ? (
              <div className="p-12 text-center text-sm text-red-500">Error: {error.message}</div>
            ) : jobCards.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-500">No workshop jobs open.</div>
            ) : (
              jobCards.map((jc) => {
                const isSelected = selectedJcId === jc.id;
                return (
                  <div
                    key={jc.id}
                    onClick={() => setSelectedJcId(jc.id)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-850/50 transition-all ${
                      isSelected ? 'bg-brand-50/50 dark:bg-brand-900/10' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{jc.job_card_number}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        jc.status === 'FINALIZED' 
                          ? 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400' 
                          : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
                      }`}>
                        {jc.status}
                      </span>
                    </div>
                    <p className="font-mono font-bold text-sm text-gray-900 dark:text-white mt-1">{jc.registration_number}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{jc.complaint}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right pane - Selected Job Card Details & Invoicing Summary */}
        <div className="col-span-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm min-h-[400px]">
          {!selectedJcId ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">
              Select a job card from the list to inspect material logs and invoices.
            </div>
          ) : loadingDetail || !jcDetail ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">Loading details...</div>
          ) : (
            <div className="space-y-6">
              {/* Job Header */}
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-950 dark:text-white">{jcDetail.job_card_number}</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Odometer: {jcDetail.odometer_reading} km | Opened: {jcDetail.opened_at}</p>
                </div>
                {jcDetail.status === 'DRAFT' && (
                  <button
                    onClick={() => finalizeMutation.mutate()}
                    disabled={finalizeMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg text-sm transition-colors"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Post & Finalize Invoice
                  </button>
                )}
              </div>

              {/* Parts & Materials Log */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Logged Spare Parts</h3>
                  {jcDetail.status === 'DRAFT' && (
                    <button
                      onClick={() => setShowPartModal(true)}
                      className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      + Add Spare Part
                    </button>
                  )}
                </div>

                <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs text-gray-500 dark:text-gray-400">
                    <thead className="bg-gray-50 dark:bg-gray-850/50 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
                      <tr>
                        <th className="px-4 py-2">Part Details</th>
                        <th className="px-4 py-2 text-center">Qty</th>
                        <th className="px-4 py-2 text-right">Unit Price (₹)</th>
                        <th className="px-4 py-2 text-right">Tax (₹)</th>
                        <th className="px-4 py-2 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                      {jcDetail.parts.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-850/30">
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                            <p>{p.description}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{p.sku}</p>
                          </td>
                          <td className="px-4 py-3 text-center">{p.quantity}</td>
                          <td className="px-4 py-3 text-right">₹{p.selling_price.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right">₹{p.gst_amount.toFixed(2)} ({p.gst_rate}%)</td>
                          <td className="px-4 py-3 text-right font-bold">₹{p.line_total.toFixed(2)}</td>
                        </tr>
                      ))}
                      {jcDetail.parts.length === 0 && (
                        <tr>
                          <td colSpan="5" className="px-4 py-6 text-center text-gray-400">No parts logged yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Labor Lines Log */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Logged Labor Charges</h3>
                  {jcDetail.status === 'DRAFT' && (
                    <button
                      onClick={() => setShowLabourModal(true)}
                      className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      + Add Labor Charge
                    </button>
                  )}
                </div>

                <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs text-gray-500 dark:text-gray-400">
                    <thead className="bg-gray-50 dark:bg-gray-850/50 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
                      <tr>
                        <th className="px-4 py-2">Labor Description</th>
                        <th className="px-4 py-2 text-right">Charges (₹)</th>
                        <th className="px-4 py-2 text-right">Tax (18% GST) (₹)</th>
                        <th className="px-4 py-2 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                      {jcDetail.labour.map((l) => (
                        <tr key={l.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-850/30">
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{l.description}</td>
                          <td className="px-4 py-3 text-right">₹{l.price.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right">₹{l.gst_amount.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-bold">₹{l.line_total.toFixed(2)}</td>
                        </tr>
                      ))}
                      {jcDetail.labour.length === 0 && (
                        <tr>
                          <td colSpan="4" className="px-4 py-6 text-center text-gray-400">No labor lines logged.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Job Card Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
                <Wrench className="h-5 w-5" />
                <h3 className="text-lg font-bold">Create Workshop Job Card</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-850"><X className="h-4 w-4" /></button>
            </div>
            
            <form onSubmit={handleCreateJc} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label htmlFor="modal-jc-owner" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Owner Profile *</label>
                  <select
                    id="modal-jc-owner"
                    required
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  >
                    <option value="">Select owner account...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label htmlFor="modal-jc-vehicle" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Vehicle Registration *</label>
                  <select
                    id="modal-jc-vehicle"
                    required
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  >
                    <option value="">Select vehicle reg...</option>
                    {vehicles
                      .filter(v => !customerId || Number(v.customer_id) === Number(customerId))
                      .map((v) => (
                        <option key={v.id} value={v.id}>{`${v.registration_number} (${v.make} ${v.model})`}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="modal-jc-odometer" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Odometer Reading (km) *</label>
                  <input
                    id="modal-jc-odometer"
                    type="number"
                    required
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="modal-jc-fuel" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Fuel Level</label>
                  <select
                    id="modal-jc-fuel"
                    value={fuelLevel}
                    onChange={(e) => setFuelLevel(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  >
                    <option value="Empty">Empty</option>
                    <option value="1/4">1/4 tank</option>
                    <option value="1/2">1/2 tank</option>
                    <option value="3/4">3/4 tank</option>
                    <option value="Full">Full</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label htmlFor="modal-jc-complaint" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Customer Complaint *</label>
                  <input
                    id="modal-jc-complaint"
                    type="text"
                    required
                    value={complaint}
                    onChange={(e) => setComplaint(e.target.value)}
                    placeholder="E.g. Front suspension noise, Engine oil replacement"
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Part Modal */}
      {showPartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-950 dark:text-white">Add Part Line</h3>
              <button onClick={() => setShowPartModal(false)} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-850"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleAddPart} className="p-6 space-y-4">
              <div>
                <label htmlFor="modal-part-select" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Select Part *</label>
                <select
                  id="modal-part-select"
                  required
                  value={partItemId}
                  onChange={(e) => setPartItemId(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                >
                  <option value="">Select SKU...</option>
                  {partsItems.map((i) => (
                    <option key={i.id} value={i.id}>{`${i.sku} - ${i.item_name} (Stock: ${i.current_quantity})`}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="modal-part-qty" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Quantity *</label>
                  <input
                    id="modal-part-qty"
                    type="number"
                    required
                    value={partQty}
                    onChange={(e) => setPartQty(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="modal-part-price" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Override Price (Optional)</label>
                  <input
                    id="modal-part-price"
                    type="number"
                    value={partPrice}
                    onChange={(e) => setPartPrice(e.target.value)}
                    placeholder="Item default price"
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowPartModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addPartMutation.isPending}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  Add Part
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Labour Modal */}
      {showLabourModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-950 dark:text-white">Add Labor Charge</h3>
              <button onClick={() => setShowLabourModal(false)} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-850"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleAddLabour} className="p-6 space-y-4">
              <div>
                <label htmlFor="modal-labour-desc" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Description *</label>
                <input
                  id="modal-labour-desc"
                  type="text"
                  required
                  value={labourDesc}
                  onChange={(e) => setLabourDesc(e.target.value)}
                  placeholder="E.g. Wheel alignment and balancing"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="modal-labour-cost" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Labor Charge (₹) *</label>
                <input
                  id="modal-labour-cost"
                  type="number"
                  required
                  value={labourCost}
                  onChange={(e) => setLabourCost(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowLabourModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLabourMutation.isPending}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  Add Labor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
