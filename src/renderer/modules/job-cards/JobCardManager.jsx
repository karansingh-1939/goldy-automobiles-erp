import React, { useState } from 'react';
import JobCardIntake from './JobCardIntake.jsx';
import JobCardCharges from './JobCardCharges.jsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { invalidateInventory } from '../../shared/api/inventory-cache.js';
import { useAppStore } from '../../shared/store/use-app-store.js';
import { useIntakeLookup } from './use-intake-lookup.js';
import { usePermissions } from '../../shared/hooks/use-permissions.js';
import RemoteSelect from '../../shared/components/RemoteSelect.jsx';
import ServerPagination from '../../shared/components/ServerPagination.jsx';
import { Search, Plus, X, CheckCircle } from 'lucide-react';

export default function JobCardManager() {
  const queryClient = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('job_cards.write');
  const canFinalize = hasPermission('invoices.finalize');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedJcId, setSelectedJcId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPartModal, setShowPartModal] = useState(false);
  const [showLabourModal, setShowLabourModal] = useState(false);

  const {
    customerId,
    isExistingCustomer,
    existingCustomerVehicles,
    customerPhone,
    setCustomerPhone,
    customerName,
    setCustomerName,
    customerAddress,
    setCustomerAddress,
    customerCity,
    setCustomerCity,
    customerNotes,
    setCustomerNotes,
    vehicleId,
    vehicleReg,
    setVehicleReg,
    isExistingVehicle,
    vehicleMake,
    setVehicleMake,
    vehicleModel,
    setVehicleModel,
    vehicleFuelType,
    setVehicleFuelType,
    vehicleChassis,
    setVehicleChassis,
    vehicleEngine,
    setVehicleEngine,
    transferOwnership,
    setTransferOwnership,
    showOwnerMismatchWarning,
    vehicleOwnerName,
    vehicleOwnerPhone,
    handleCustomerPhoneSearch,
    handleVehicleRegSearch,
    resetIntake,
    cancelLookups,
    lookupError,
    lookupBusy,
  } = useIntakeLookup(addNotification);

  const [odometer, setOdometer] = useState('');
  const [complaint, setComplaint] = useState('');
  const [fuelLevel, setFuelLevel] = useState('1/2');

  const [toolkitPresent, setToolkitPresent] = useState(false);
  const [spareWheelPresent, setSpareWheelPresent] = useState(false);
  const [jackPresent, setJackPresent] = useState(false);
  const [stereoPresent, setStereoPresent] = useState(false);
  const [batteryBrand, setBatteryBrand] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');

  // Add Part Form State
  const [partItemId, setPartItemId] = useState('');
  const [selectedPart, setSelectedPart] = useState(null);
  const [batchId, setBatchId] = useState('');
  const [partGst, setPartGst] = useState('18');
  const [labourGst, setLabourGst] = useState('18');
  const [outsideJob, setOutsideJob] = useState(false);
  const [partQty, setPartQty] = useState('1');
  const [partPrice, setPartPrice] = useState('');

  // Add Labour Form State
  const [labourDesc, setLabourDesc] = useState('');
  const [labourCost, setLabourCost] = useState('');

  // Fetch Job Cards
  const {
    data: jcResponse,
    isLoading,
    error,
    refetch: retryList,
  } = useQuery({
    queryKey: ['job-cards', search, page],
    queryFn: () =>
      api.get(`/api/v1/job-cards?search=${encodeURIComponent(search)}&page=${page}&pageSize=20`),
  });

  const batchesQuery = useQuery({
    queryKey: ['job-part-batches', partItemId],
    queryFn: ({ signal }) => api.get(`/api/v1/inventory/items/${partItemId}/batches`, { signal }),
    enabled: Boolean(partItemId) && showPartModal,
  });
  const batches = batchesQuery.data?.data || [];
  const jobCards = jcResponse?.data || [];

  // Fetch Single Job Card detail
  const {
    data: jcDetailResponse,
    isLoading: loadingDetail,
    error: detailError,
    refetch: retryDetail,
  } = useQuery({
    queryKey: ['job-card-detail', selectedJcId],
    queryFn: () => api.get(`/api/v1/job-cards/${selectedJcId}`),
    enabled: !!selectedJcId,
  });

  const jcDetail = jcDetailResponse?.data || null;

  const resetJcForm = () => {
    resetIntake();
    setOdometer('');
    setComplaint('');
    setFuelLevel('1/2');
    setToolkitPresent(false);
    setSpareWheelPresent(false);
    setJackPresent(false);
    setStereoPresent(false);
    setBatteryBrand('');
    setTechnicianId('');
    setExpectedDeliveryDate('');
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: (newJc) => api.post('/api/v1/job-cards', newJc),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      addNotification('Job card opened successfully.', 'success');
      setShowAddModal(false);
      setSelectedJcId(res.data.id);
      resetJcForm();
    },
    onError: (err) => addNotification(err.message || 'Failed to create job card.', 'error'),
  });

  const addPartMutation = useMutation({
    mutationFn: (partPayload) => api.post(`/api/v1/job-cards/${selectedJcId}/parts`, partPayload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-card-detail', selectedJcId] });
      addNotification('Part entry logged to Job Card.', 'success');
      invalidateInventory(queryClient);
      setShowPartModal(false);
      setPartItemId('');
      setBatchId('');
      setSelectedPart(null);
      setPartQty('1');
      setPartPrice('');
    },
    onError: (err) => addNotification(err.message || 'Failed to add spare part.', 'error'),
  });

  const addLabourMutation = useMutation({
    mutationFn: (labourPayload) =>
      api.post(`/api/v1/job-cards/${selectedJcId}/labour`, labourPayload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-card-detail', selectedJcId] });
      addNotification('Labor description logged.', 'success');
      setShowLabourModal(false);
      setLabourDesc('');
      setLabourCost('');
    },
    onError: (err) => addNotification(err.message || 'Failed to add labor charge.', 'error'),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/job-cards/${selectedJcId}/finalize`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['job-card-detail', selectedJcId] });
      addNotification('Job card invoice finalized and posted to General Ledger.', 'success');
    },
    onError: (err) => addNotification(err.message || 'Failed to finalize invoice.', 'error'),
  });

  const handleCreateJc = (e) => {
    e.preventDefault();
    if (!canWrite) return;

    if (!customerName) {
      addNotification('Customer Name is required.', 'error');
      return;
    }
    if (!customerPhone) {
      addNotification('Customer Phone is required.', 'error');
      return;
    }
    if (!vehicleReg) {
      addNotification('Vehicle Registration Number is required.', 'error');
      return;
    }
    if (!vehicleMake || !vehicleModel) {
      addNotification('Vehicle Make and Model are required.', 'error');
      return;
    }
    if (!odometer) {
      addNotification('Odometer reading is required.', 'error');
      return;
    }
    if (!complaint) {
      addNotification('Customer Complaint is required.', 'error');
      return;
    }

    if (lookupBusy || lookupError) return;

    createMutation.mutate({
      customer_id: customerId ? Number(customerId) : null,
      customer_name: customerName,
      phone: customerPhone,
      address: customerAddress || null,
      city: customerCity || null,
      notes: customerNotes || null,

      vehicle_id: vehicleId ? Number(vehicleId) : null,
      registration_number: vehicleReg,
      make: vehicleMake,
      model: vehicleModel,
      fuel_type: vehicleFuelType,
      chassis_number: vehicleChassis || null,
      engine_number: vehicleEngine || null,
      transfer_ownership: transferOwnership,

      odometer_reading: Number(odometer),
      complaint,
      fuel_level: fuelLevel,
      toolkit_present: toolkitPresent ? 1 : 0,
      spare_wheel_present: spareWheelPresent ? 1 : 0,
      jack_present: jackPresent ? 1 : 0,
      stereo_present: stereoPresent ? 1 : 0,
      battery_brand: batteryBrand || null,
      technician_id: technicianId ? Number(technicianId) : null,
      promised_delivery_at: expectedDeliveryDate || null,
    });
  };

  const handleAddPart = (e) => {
    e.preventDefault();
    if (!canWrite) return;
    if (!partItemId || !selectedPart || !batchId || Number(partQty) <= 0) {
      addNotification('Select a part and a positive quantity.', 'error');
      return;
    }
    addPartMutation.mutate({
      inventory_item_id: Number(partItemId),
      batch_id: Number(batchId),
      gst_rate: Number(partGst),
      quantity: Number(partQty),
      selling_price: partPrice ? Number(partPrice) : (selectedPart.selling_price ?? 0),
    });
  };

  const handleAddLabour = (e) => {
    e.preventDefault();
    if (!canWrite) return;
    addLabourMutation.mutate({
      description: outsideJob ? `[Outside Job] ${labourDesc.trim()}` : labourDesc.trim(),
      labour_charge: Number(labourCost),
      gst_rate: Number(labourGst),
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Job Cards & Workshop Invoicing
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Track active repair jobs, log materials, and draft tax invoices.
          </p>
        </div>
        <button
          disabled={!canWrite}
          title={!canWrite ? 'Job card write permission required.' : undefined}
          onClick={() => {
            resetJcForm();
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Job Card
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left pane - Job Cards List */}
        <div className="col-span-1 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by job number, registration..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus-ring"
            />
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-200 dark:divide-gray-800">
            {isLoading ? (
              <div className="p-12 text-center text-sm text-gray-500">Loading jobs...</div>
            ) : error ? (
              <div role="alert" className="p-12 text-center text-sm text-red-500">
                Error: {error.message}
                <button type="button" className="ml-2 underline" onClick={() => retryList()}>
                  Retry
                </button>
              </div>
            ) : jobCards.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-500">No workshop jobs open.</div>
            ) : (
              jobCards.map((jc) => {
                const isSelected = selectedJcId === jc.id;
                return (
                  <div
                    key={jc.id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedJcId(jc.id);
                      }
                    }}
                    onClick={() => setSelectedJcId(jc.id)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-850/50 transition-all ${
                      isSelected ? 'bg-brand-50/50 dark:bg-brand-900/10' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                        {jc.job_card_number}
                      </span>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          jc.status === 'FINALIZED'
                            ? 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400'
                            : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
                        }`}
                      >
                        {jc.status}
                      </span>
                    </div>
                    <p className="font-mono font-bold text-sm text-gray-900 dark:text-white mt-1">
                      {jc.registration_number}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{jc.complaint}</p>
                  </div>
                );
              })
            )}
          </div>
          <ServerPagination
            page={page}
            totalPages={jcResponse?.pagination?.totalPages || 1}
            onChange={setPage}
            disabled={isLoading}
          />
        </div>

        {/* Right pane - Selected Job Card Details & Invoicing Summary */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm min-h-[400px]">
          {!selectedJcId ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">
              Select a job card from the list to inspect material logs and invoices.
            </div>
          ) : detailError ? (
            <div role="alert" className="p-6 text-sm text-red-600">
              {detailError.message}
              <button type="button" className="ml-2 underline" onClick={() => retryDetail()}>
                Retry
              </button>
            </div>
          ) : loadingDetail || !jcDetail ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">
              Loading details...
            </div>
          ) : (
            <div className="space-y-6">
              {/* Job Header */}
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-950 dark:text-white">
                    {jcDetail.job_card_number}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Odometer: {jcDetail.odometer_reading} km | Opened: {jcDetail.opened_at}
                  </p>
                </div>
                {jcDetail.status === 'DRAFT' && (
                  <button
                    onClick={() => finalizeMutation.mutate()}
                    disabled={!canFinalize || finalizeMutation.isPending}
                    title={!canFinalize ? 'Invoice finalization permission required.' : undefined}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg text-sm transition-colors"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Post & Finalize Invoice
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded border px-3 py-2"
                  onClick={() => window.open(`/print-job-card.html?id=${jcDetail.id}`, '_blank')}
                >
                  Print job card
                </button>
                {jcDetail.invoice?.id && (
                  <a className="underline" href={`#/invoices?id=${jcDetail.invoice.id}`}>
                    View invoice
                  </a>
                )}
                <a
                  className="underline"
                  href={`#/service-history?vehicleId=${jcDetail.vehicle_id}`}
                >
                  Vehicle service history
                </a>
                {jcDetail.status === 'DRAFT' && (
                  <>
                    <button
                      disabled={!canWrite}
                      className="rounded border px-3 py-2"
                      onClick={() => setShowPartModal(true)}
                    >
                      + Add Spare Part
                    </button>
                    <button
                      disabled={!canWrite}
                      className="rounded border px-3 py-2"
                      onClick={() => setShowLabourModal(true)}
                    >
                      + Add Labor Charge
                    </button>
                  </>
                )}
              </div>
              <p>
                {jcDetail.customer_name} · {jcDetail.customer_phone} ·{' '}
                {jcDetail.registration_number}
              </p>
              <p>Complaint: {jcDetail.complaint}</p>
              <p>
                Fuel: {jcDetail.fuel_level || '—'} · Battery: {jcDetail.battery_brand || '—'} ·
                Promised delivery: {jcDetail.promised_delivery_at || '—'}
              </p>
              <p>
                Equipment:{' '}
                {[
                  jcDetail.toolkit_present && 'Toolkit',
                  jcDetail.spare_wheel_present && 'Spare wheel',
                  jcDetail.jack_present && 'Jack & rod',
                  jcDetail.stereo_present && 'Stereo / LCD',
                ]
                  .filter(Boolean)
                  .join(', ') || 'None marked present'}
              </p>
              <p>Assigned technician: {jcDetail.technician_name || 'Unassigned'}</p>
              <JobCardCharges job={jcDetail} />
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <JobCardIntake
          {...{
            cancelLookups,
            setShowAddModal,
            handleCreateJc,
            lookupBusy,
            lookupError,
            customerPhone,
            setCustomerPhone,
            handleCustomerPhoneSearch,
            isExistingCustomer,
            customerName,
            setCustomerName,
            customerAddress,
            setCustomerAddress,
            customerCity,
            setCustomerCity,
            customerNotes,
            setCustomerNotes,
            vehicleReg,
            setVehicleReg,
            handleVehicleRegSearch,
            isExistingVehicle,
            vehicleMake,
            setVehicleMake,
            vehicleModel,
            setVehicleModel,
            vehicleFuelType,
            setVehicleFuelType,
            vehicleChassis,
            setVehicleChassis,
            vehicleEngine,
            setVehicleEngine,
            transferOwnership,
            setTransferOwnership,
            showOwnerMismatchWarning,
            vehicleOwnerName,
            vehicleOwnerPhone,
            existingCustomerVehicles,
            odometer,
            setOdometer,
            complaint,
            setComplaint,
            fuelLevel,
            setFuelLevel,
            toolkitPresent,
            setToolkitPresent,
            spareWheelPresent,
            setSpareWheelPresent,
            jackPresent,
            setJackPresent,
            stereoPresent,
            setStereoPresent,
            batteryBrand,
            setBatteryBrand,
            technicianId,
            setTechnicianId,
            expectedDeliveryDate,
            setExpectedDeliveryDate,
            canWrite,
            createMutation,
          }}
        />
      )}

      {/* Log Part Modal */}
      {showPartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-950 dark:text-white">Add Part Line</h3>
              <button
                onClick={() => setShowPartModal(false)}
                className="p-1 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-850"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddPart} className="p-6 space-y-4">
              <div>
                <label
                  htmlFor="modal-part-select"
                  className="block text-xs font-semibold text-gray-600 dark:text-gray-400"
                >
                  Select Part *
                </label>
                <RemoteSelect
                  id="modal-part-select"
                  endpoint="/api/v1/inventory/items"
                  queryKey="inventory-items"
                  value={partItemId}
                  onChange={(next, record) => {
                    setPartItemId(next);
                    setBatchId('');
                    setPartPrice(next ? String(record?.selling_price ?? '') : '');
                    setPartGst(String(record?.gst_rate ?? 18));
                    setSelectedPart(next ? record : null);
                  }}
                  searchLabel="Search parts"
                  optionLabel={(i) => `${i.sku} - ${i.item_name} (Stock: ${i.current_quantity})`}
                />
              </div>
              <label htmlFor="modal-part-batch" className="block text-sm">
                Warehouse / batch *
              </label>
              <select
                id="modal-part-batch"
                required
                value={batchId}
                disabled={!partItemId || batchesQuery.isFetching}
                onChange={(e) => setBatchId(e.target.value)}
                className="w-full rounded border p-2 dark:bg-gray-800"
              >
                <option value="">Select batch...</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id} disabled={Number(batch.quantity) <= 0}>
                    {batch.warehouse_name} / {batch.batch_number} (Stock: {batch.quantity})
                  </option>
                ))}
              </select>
              {batchesQuery.error && (
                <p role="alert">
                  {batchesQuery.error.message}{' '}
                  <button type="button" onClick={() => batchesQuery.refetch()}>
                    Retry
                  </button>
                </p>
              )}
              <label className="block text-sm">
                Part GST %
                <input
                  aria-label="Part GST %"
                  className="w-full rounded border p-2 dark:bg-gray-800"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={partGst}
                  onChange={(e) => setPartGst(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="modal-part-qty"
                    className="block text-xs font-semibold text-gray-600 dark:text-gray-400"
                  >
                    Quantity *
                  </label>
                  <input
                    id="modal-part-qty"
                    min="0.001"
                    step="0.001"
                    type="number"
                    required
                    value={partQty}
                    onChange={(e) => setPartQty(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="modal-part-price"
                    className="block text-xs font-semibold text-gray-600 dark:text-gray-400"
                  >
                    Override Price (Optional)
                  </label>
                  <input
                    id="modal-part-price"
                    min="0"
                    step="0.01"
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
                  disabled={
                    !canWrite ||
                    addPartMutation.isPending ||
                    !batchId ||
                    Boolean(batchesQuery.error)
                  }
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
              <h3 className="text-base font-bold text-gray-950 dark:text-white">
                Add Labor Charge
              </h3>
              <button
                onClick={() => setShowLabourModal(false)}
                className="p-1 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-850"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddLabour} className="p-6 space-y-4">
              <div>
                <label
                  htmlFor="modal-labour-desc"
                  className="block text-xs font-semibold text-gray-600 dark:text-gray-400"
                >
                  Description *
                </label>
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
                <label
                  htmlFor="modal-labour-cost"
                  className="block text-xs font-semibold text-gray-600 dark:text-gray-400"
                >
                  Labor Charge (₹) *
                </label>
                <input
                  id="modal-labour-cost"
                  min="0"
                  step="0.01"
                  type="number"
                  required
                  value={labourCost}
                  onChange={(e) => setLabourCost(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                />
              </div>
              <label className="block text-sm">
                Labour GST %
                <input
                  aria-label="Labour GST %"
                  className="w-full rounded border p-2 dark:bg-gray-800"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={labourGst}
                  onChange={(e) => setLabourGst(e.target.value)}
                />
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={outsideJob}
                  onChange={(e) => setOutsideJob(e.target.checked)}
                />
                Outside job
              </label>
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
                  disabled={!canWrite || addLabourMutation.isPending}
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
