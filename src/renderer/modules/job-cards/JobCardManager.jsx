import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { useAppStore } from '../../shared/store/use-app-store.js';
import { Search, Plus, Wrench, X, ShieldAlert, CheckCircle, User, Car } from 'lucide-react';

export default function JobCardManager() {
  const queryClient = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);

  const [search, setSearch] = useState('');
  const [selectedJcId, setSelectedJcId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPartModal, setShowPartModal] = useState(false);
  const [showLabourModal, setShowLabourModal] = useState(false);

  // Rebuilt Job Card Wizard States
  const [customerId, setCustomerId] = useState('');
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [existingCustomerVehicles, setExistingCustomerVehicles] = useState([]);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  const [vehicleId, setVehicleId] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [isExistingVehicle, setIsExistingVehicle] = useState(false);
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleFuelType, setVehicleFuelType] = useState('Petrol');
  const [vehicleChassis, setVehicleChassis] = useState('');
  const [vehicleEngine, setVehicleEngine] = useState('');
  const [transferOwnership, setTransferOwnership] = useState(false);
  const [showOwnerMismatchWarning, setShowOwnerMismatchWarning] = useState(false);
  const [vehicleOwnerName, setVehicleOwnerName] = useState('');
  const [vehicleOwnerPhone, setVehicleOwnerPhone] = useState('');

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
  } = useQuery({
    queryKey: ['job-cards', search],
    queryFn: () => api.get(`/api/v1/job-cards?search=${encodeURIComponent(search)}`),
  });

  // Fetch Vehicles & Customers for suggestions/autocompletes
  const { data: itemsResponse } = useQuery({
    queryKey: ['parts-items'],
    queryFn: () => api.get('/api/v1/inventory/items'),
  });
  const { data: techniciansResponse } = useQuery({
    queryKey: ['technicians-list'],
    queryFn: () => api.get('/api/v1/technicians'),
  });

  const jobCards = jcResponse?.data || [];
  const partsItems = itemsResponse?.data || [];
  const technicians = techniciansResponse?.data || [];

  // Fetch Single Job Card detail
  const { data: jcDetailResponse, isLoading: loadingDetail } = useQuery({
    queryKey: ['job-card-detail', selectedJcId],
    queryFn: () => api.get(`/api/v1/job-cards/${selectedJcId}`),
    enabled: !!selectedJcId,
  });

  const jcDetail = jcDetailResponse?.data || null;

  // Real-time lookup methods
  const handleCustomerPhoneSearch = async (phoneVal) => {
    const clean = phoneVal.replace(/[^0-9]/g, '');
    if (clean.length >= 10) {
      try {
        const res = await api.get(`/api/v1/customers/lookup?phone=${encodeURIComponent(clean)}`);
        if (res.data) {
          const cust = res.data;
          setCustomerId(cust.id);
          setCustomerName(cust.name);
          setCustomerAddress(cust.address || '');
          setCustomerCity(cust.city || '');
          setCustomerNotes(cust.notes || '');
          setIsExistingCustomer(true);
          setExistingCustomerVehicles(cust.vehicles || []);
          addNotification('Existing customer details loaded.', 'info');
        } else {
          setIsExistingCustomer(false);
          setCustomerId('');
          setCustomerName('');
          setCustomerAddress('');
          setCustomerCity('');
          setCustomerNotes('');
          setExistingCustomerVehicles([]);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleVehicleRegSearch = async (regVal) => {
    const clean = regVal.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (clean.length >= 4) {
      try {
        const res = await api.get(
          `/api/v1/vehicles/lookup?registration_number=${encodeURIComponent(clean)}`,
        );
        if (res.data) {
          const veh = res.data;
          setVehicleId(veh.id);
          setVehicleMake(veh.make || '');
          setVehicleModel(veh.model || '');
          setVehicleFuelType(veh.fuel_type || 'Petrol');
          setVehicleChassis(veh.chassis_number || '');
          setVehicleEngine(veh.engine_number || '');
          setIsExistingVehicle(true);

          if (customerId && Number(veh.customer_id) !== Number(customerId)) {
            setVehicleOwnerName(veh.customer_name);
            setVehicleOwnerPhone(veh.customer_phone);
            setShowOwnerMismatchWarning(true);
          } else {
            setShowOwnerMismatchWarning(false);
            if (!customerId) {
              setCustomerId(veh.customer_id);
              setCustomerName(veh.customer_name);
              setCustomerPhone(veh.customer_phone || '');
              setCustomerAddress(veh.customer_address || '');
              setCustomerCity(veh.customer_city || '');
              setCustomerNotes(veh.customer_notes || '');
              setIsExistingCustomer(true);
            }
          }
          addNotification('Existing vehicle details loaded.', 'info');
        } else {
          setIsExistingVehicle(false);
          setVehicleId('');
          setVehicleMake('');
          setVehicleModel('');
          setVehicleFuelType('Petrol');
          setVehicleChassis('');
          setVehicleEngine('');
          setShowOwnerMismatchWarning(false);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const resetJcForm = () => {
    setCustomerId('');
    setCustomerPhone('');
    setCustomerName('');
    setCustomerAddress('');
    setCustomerCity('');
    setCustomerNotes('');
    setIsExistingCustomer(false);
    setExistingCustomerVehicles([]);

    setVehicleId('');
    setVehicleReg('');
    setVehicleMake('');
    setVehicleModel('');
    setVehicleFuelType('Petrol');
    setVehicleChassis('');
    setVehicleEngine('');
    setIsExistingVehicle(false);
    setTransferOwnership(false);
    setShowOwnerMismatchWarning(false);
    setVehicleOwnerName('');
    setVehicleOwnerPhone('');

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
  });

  const addPartMutation = useMutation({
    mutationFn: (partPayload) => api.post(`/api/v1/job-cards/${selectedJcId}/parts`, partPayload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-card-detail', selectedJcId] });
      addNotification('Part entry logged to Job Card.', 'success');
      setShowPartModal(false);
      setPartItemId('');
      setPartQty('1');
      setPartPrice('');
    },
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
  });

  const finalizeMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/job-cards/${selectedJcId}/finalize`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['job-card-detail', selectedJcId] });
      addNotification('Job card invoice finalized and posted to General Ledger.', 'success');
    },
  });

  const handleCreateJc = (e) => {
    e.preventDefault();

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
    const item = partsItems.find((i) => Number(i.id) === Number(partItemId));
    addPartMutation.mutate({
      inventory_item_id: Number(partItemId),
      quantity: Number(partQty),
      selling_price: partPrice ? Number(partPrice) : item?.selling_price || 0,
    });
  };

  const handleAddLabour = (e) => {
    e.preventDefault();
    addLabourMutation.mutate({
      description: labourDesc,
      cost: Number(labourCost),
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
        </div>

        {/* Right pane - Selected Job Card Details & Invoicing Summary */}
        <div className="col-span-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm min-h-[400px]">
          {!selectedJcId ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">
              Select a job card from the list to inspect material logs and invoices.
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
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    Logged Spare Parts
                  </h3>
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
                          <td className="px-4 py-3 text-right">
                            ₹{p.gst_amount.toFixed(2)} ({p.gst_rate}%)
                          </td>
                          <td className="px-4 py-3 text-right font-bold">
                            ₹{p.line_total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                      {jcDetail.parts.length === 0 && (
                        <tr>
                          <td colSpan="5" className="px-4 py-6 text-center text-gray-400">
                            No parts logged yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Labor Lines Log */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    Logged Labor Charges
                  </h3>
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
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                            {l.description}
                          </td>
                          <td className="px-4 py-3 text-right">₹{l.price.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right">₹{l.gst_amount.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-bold">
                            ₹{l.line_total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                      {jcDetail.labour.length === 0 && (
                        <tr>
                          <td colSpan="4" className="px-4 py-6 text-center text-gray-400">
                            No labor lines logged.
                          </td>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden animate-slide-up my-8">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 rounded-lg">
                  <Wrench className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-950 dark:text-white">
                    Create New Job Card
                  </h3>
                  <p className="text-xs text-gray-400">
                    Enter customer, vehicle, and service details to open a new job card.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-150 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateJc}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 overflow-y-auto max-h-[70vh] divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-800">
                {/* Column 1: Customer & Vehicle */}
                <div className="space-y-6 md:pr-6">
                  {/* Customer Section */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <User className="h-4 w-4 text-brand-500" /> Customer Information
                    </h4>

                    <div className="grid grid-cols-2 gap-3 bg-gray-50/50 dark:bg-gray-850/20 p-4 border border-gray-150 dark:border-gray-805 rounded-xl">
                      <div className="col-span-2 md:col-span-1">
                        <label
                          htmlFor="modal-cust-phone"
                          className="block text-xs font-semibold text-gray-500 dark:text-gray-400"
                        >
                          Mobile Number *
                        </label>
                        <input
                          id="modal-cust-phone"
                          type="text"
                          required
                          placeholder="Search or enter phone..."
                          value={customerPhone}
                          onChange={(e) => {
                            setCustomerPhone(e.target.value);
                            handleCustomerPhoneSearch(e.target.value);
                          }}
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                        />
                      </div>

                      <div className="col-span-2 md:col-span-1">
                        <label
                          htmlFor="modal-cust-name"
                          className="block text-xs font-semibold text-gray-500 dark:text-gray-400"
                        >
                          Customer Name *
                        </label>
                        <input
                          id="modal-cust-name"
                          type="text"
                          required
                          placeholder="Enter customer name..."
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                        />
                      </div>

                      {isExistingCustomer ? (
                        <div className="col-span-2 flex items-center gap-2 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50/50 dark:bg-green-950/10 px-2.5 py-1 rounded-lg border border-green-200/50 dark:border-green-900/30">
                          <CheckCircle className="h-3.5 w-3.5" /> Existing Customer Found
                        </div>
                      ) : customerPhone && customerPhone.replace(/[^0-9]/g, '').length >= 10 ? (
                        <div className="col-span-2 flex items-center gap-2 text-[10px] font-bold text-brand-700 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-950/10 px-2.5 py-1 rounded-lg border border-brand-200/50 dark:border-brand-900/30">
                          <Plus className="h-3.5 w-3.5" /> Registering New Customer
                        </div>
                      ) : null}

                      {/* Optional details toggle */}
                      <details className="col-span-2 group pt-1">
                        <summary className="text-[11px] font-semibold text-brand-650 hover:text-brand-700 cursor-pointer list-none select-none flex items-center gap-1 outline-none">
                          <span className="group-open:rotate-90 transition-transform">▸</span>{' '}
                          Additional Customer Fields
                        </summary>
                        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-150 dark:border-gray-805">
                          <div className="col-span-2">
                            <label
                              htmlFor="modal-cust-addr"
                              className="block text-xs text-gray-500"
                            >
                              Address
                            </label>
                            <input
                              id="modal-cust-addr"
                              type="text"
                              value={customerAddress}
                              onChange={(e) => setCustomerAddress(e.target.value)}
                              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800 text-xs focus-ring text-gray-950 dark:text-white"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="modal-cust-city"
                              className="block text-xs text-gray-500"
                            >
                              City
                            </label>
                            <input
                              id="modal-cust-city"
                              type="text"
                              value={customerCity}
                              onChange={(e) => setCustomerCity(e.target.value)}
                              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800 text-xs focus-ring text-gray-950 dark:text-white"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="modal-cust-notes"
                              className="block text-xs text-gray-500"
                            >
                              Notes / GSTIN
                            </label>
                            <input
                              id="modal-cust-notes"
                              type="text"
                              value={customerNotes}
                              onChange={(e) => setCustomerNotes(e.target.value)}
                              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800 text-xs focus-ring text-gray-950 dark:text-white"
                            />
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>

                  {/* Vehicle Section */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Car className="h-4 w-4 text-brand-500" /> Vehicle Information
                    </h4>

                    {isExistingCustomer && existingCustomerVehicles.length > 0 && (
                      <div className="bg-gray-50/30 dark:bg-gray-850/10 p-3 rounded-lg border border-gray-150 dark:border-gray-850 space-y-1.5">
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                          Customer's Vehicles:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {existingCustomerVehicles.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => {
                                setVehicleReg(v.registration_number);
                                handleVehicleRegSearch(v.registration_number);
                              }}
                              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                                vehicleReg.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() ===
                                v.registration_number_normalized
                                  ? 'bg-brand-50 border-brand-500 text-brand-700 dark:bg-brand-950/20 dark:text-brand-400'
                                  : 'bg-white border-gray-250 hover:bg-gray-50 dark:bg-gray-850 dark:border-gray-700 dark:text-gray-300'
                              }`}
                            >
                              <Car className="h-3.5 w-3.5" />
                              {v.registration_number}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 bg-gray-50/50 dark:bg-gray-850/20 p-4 border border-gray-150 dark:border-gray-800 rounded-xl">
                      <div>
                        <label
                          htmlFor="modal-veh-reg"
                          className="block text-xs font-semibold text-gray-500 dark:text-gray-400"
                        >
                          Registration Number *
                        </label>
                        <input
                          id="modal-veh-reg"
                          type="text"
                          required
                          placeholder="E.g. HR26AB1234"
                          value={vehicleReg}
                          onChange={(e) => {
                            setVehicleReg(e.target.value);
                            handleVehicleRegSearch(e.target.value);
                          }}
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm font-mono tracking-wide uppercase focus-ring text-gray-950 dark:text-white"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="modal-veh-odo"
                          className="block text-xs font-semibold text-gray-500 dark:text-gray-400"
                        >
                          Current Odometer *
                        </label>
                        <input
                          id="modal-veh-odo"
                          type="number"
                          required
                          placeholder="Km reading"
                          value={odometer}
                          onChange={(e) => setOdometer(e.target.value)}
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                        />
                      </div>

                      {isExistingVehicle ? (
                        <div className="col-span-2 flex items-center gap-2 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50/50 dark:bg-green-950/10 px-2.5 py-1 rounded-lg border border-green-200/50 dark:border-green-900/30">
                          <CheckCircle className="h-3.5 w-3.5" /> Existing Vehicle Identified
                        </div>
                      ) : vehicleReg && vehicleReg.replace(/[^a-zA-Z0-9]/g, '').length >= 4 ? (
                        <div className="col-span-2 flex items-center gap-2 text-[10px] font-bold text-brand-700 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-950/10 px-2.5 py-1 rounded-lg border border-brand-200/50 dark:border-brand-900/30">
                          <Plus className="h-3.5 w-3.5" /> Registering New Vehicle
                        </div>
                      ) : null}

                      {/* Owner mismatch check */}
                      {showOwnerMismatchWarning && (
                        <div className="col-span-2 border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 rounded-lg p-2.5 space-y-1.5">
                          <div className="flex items-start gap-2 text-xs font-semibold text-amber-850 dark:text-amber-400">
                            <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <div>
                              <p className="font-bold text-[11px]">Registered Owner Mismatch</p>
                              <p className="text-[10px] text-gray-505 mt-0.5 leading-normal">
                                This vehicle belongs to{' '}
                                <span className="font-bold text-gray-700 dark:text-gray-300">
                                  {vehicleOwnerName}
                                </span>{' '}
                                ({vehicleOwnerPhone}). Job card will be billed to{' '}
                                <span className="font-bold text-gray-700 dark:text-gray-300">
                                  {customerName}
                                </span>
                                .
                              </p>
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-[10px] text-gray-655 dark:text-gray-400 select-none cursor-pointer pl-6">
                            <input
                              type="checkbox"
                              checked={transferOwnership}
                              onChange={(e) => setTransferOwnership(e.target.checked)}
                              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 h-3.5 w-3.5"
                            />
                            <span>Transfer vehicle owner to {customerName}</span>
                          </label>
                        </div>
                      )}

                      <div className="col-span-2 grid grid-cols-3 gap-3 pt-1">
                        <div>
                          <label htmlFor="modal-veh-make" className="block text-xs text-gray-500">
                            Make *
                          </label>
                          <input
                            id="modal-veh-make"
                            type="text"
                            required
                            placeholder="E.g. Maruti"
                            value={vehicleMake}
                            onChange={(e) => setVehicleMake(e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800 text-xs focus-ring text-gray-950 dark:text-white"
                          />
                        </div>
                        <div>
                          <label htmlFor="modal-veh-model" className="block text-xs text-gray-500">
                            Model *
                          </label>
                          <input
                            id="modal-veh-model"
                            type="text"
                            required
                            placeholder="E.g. Swift"
                            value={vehicleModel}
                            onChange={(e) => setVehicleModel(e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800 text-xs focus-ring text-gray-950 dark:text-white"
                          />
                        </div>
                        <div>
                          <label htmlFor="modal-veh-fuel" className="block text-xs text-gray-500">
                            Fuel Type
                          </label>
                          <select
                            id="modal-veh-fuel"
                            value={vehicleFuelType}
                            onChange={(e) => setVehicleFuelType(e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800 text-xs focus-ring text-gray-950 dark:text-white"
                          >
                            <option value="Petrol">Petrol</option>
                            <option value="Diesel">Diesel</option>
                            <option value="CNG">CNG</option>
                            <option value="Electric">Electric</option>
                            <option value="Hybrid">Hybrid</option>
                            <option value="LPG">LPG</option>
                          </select>
                        </div>
                      </div>

                      <details className="col-span-2 group pt-1">
                        <summary className="text-[11px] font-semibold text-brand-650 hover:text-brand-700 cursor-pointer list-none select-none flex items-center gap-1 outline-none">
                          <span className="group-open:rotate-90 transition-transform">▸</span>{' '}
                          Additional Vehicle Fields
                        </summary>
                        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-150 dark:border-gray-855">
                          <div>
                            <label
                              htmlFor="modal-veh-chassis"
                              className="block text-xs text-gray-500"
                            >
                              Chassis Number
                            </label>
                            <input
                              id="modal-veh-chassis"
                              type="text"
                              placeholder="17-character VIN"
                              value={vehicleChassis}
                              onChange={(e) => setVehicleChassis(e.target.value)}
                              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800 text-xs focus-ring text-gray-950 dark:text-white font-mono tracking-wide"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="modal-veh-engine"
                              className="block text-xs text-gray-500"
                            >
                              Engine Number
                            </label>
                            <input
                              id="modal-veh-engine"
                              type="text"
                              placeholder="Engine number"
                              value={vehicleEngine}
                              onChange={(e) => setVehicleEngine(e.target.value)}
                              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800 text-xs focus-ring text-gray-950 dark:text-white font-mono tracking-wide"
                            />
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                </div>

                {/* Column 2: Service & Accessories */}
                <div className="space-y-6 md:pl-6 pt-6 md:pt-0">
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Wrench className="h-4 w-4 text-brand-500" /> Service Details
                    </h4>

                    <div className="space-y-3 bg-gray-50/50 dark:bg-gray-850/20 p-4 border border-gray-150 dark:border-gray-850 rounded-xl">
                      <div>
                        <label
                          htmlFor="modal-jc-complaint"
                          className="block text-xs font-semibold text-gray-500 dark:text-gray-400"
                        >
                          Customer Complaint *
                        </label>
                        <input
                          id="modal-jc-complaint"
                          type="text"
                          required
                          placeholder="E.g. Front suspension noise, Engine oil replacement..."
                          value={complaint}
                          onChange={(e) => setComplaint(e.target.value)}
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="modal-jc-fuel"
                            className="block text-xs font-semibold text-gray-500 dark:text-gray-400"
                          >
                            Fuel Level
                          </label>
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

                        <div>
                          <label
                            htmlFor="modal-jc-battery"
                            className="block text-xs font-semibold text-gray-500 dark:text-gray-400"
                          >
                            Battery Brand
                          </label>
                          <input
                            id="modal-jc-battery"
                            type="text"
                            placeholder="E.g. Exide, Amaron"
                            value={batteryBrand}
                            onChange={(e) => setBatteryBrand(e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Accessories Checklist
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-gray-50/50 dark:bg-gray-850/20 p-4 border border-gray-150 dark:border-gray-850 rounded-xl text-xs font-semibold text-gray-650">
                      <label className="flex items-center gap-2 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={toolkitPresent}
                          onChange={(e) => setToolkitPresent(e.target.checked)}
                          className="rounded border-gray-300 text-brand-600 h-4 w-4"
                        />{' '}
                        Toolkit
                      </label>
                      <label className="flex items-center gap-2 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={spareWheelPresent}
                          onChange={(e) => setSpareWheelPresent(e.target.checked)}
                          className="rounded border-gray-300 text-brand-600 h-4 w-4"
                        />{' '}
                        Spare Wheel
                      </label>
                      <label className="flex items-center gap-2 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={jackPresent}
                          onChange={(e) => setJackPresent(e.target.checked)}
                          className="rounded border-gray-300 text-brand-600 h-4 w-4"
                        />{' '}
                        Jack & Rod
                      </label>
                      <label className="flex items-center gap-2 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={stereoPresent}
                          onChange={(e) => setStereoPresent(e.target.checked)}
                          className="rounded border-gray-300 text-brand-600 h-4 w-4"
                        />{' '}
                        Stereo / LCD
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-gray-50/50 dark:bg-gray-850/20 p-4 border border-gray-150 dark:border-gray-850 rounded-xl">
                    <div>
                      <label
                        htmlFor="modal-jc-mechanic"
                        className="block text-xs font-semibold text-gray-650 dark:text-gray-400"
                      >
                        Assigned Technician
                      </label>
                      <select
                        id="modal-jc-mechanic"
                        value={technicianId}
                        onChange={(e) => setTechnicianId(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                      >
                        <option value="">Select Technician...</option>
                        {technicians.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.specialization || 'Mechanic'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="modal-jc-promised"
                        className="block text-xs font-semibold text-gray-650 dark:text-gray-400"
                      >
                        Promised Delivery
                      </label>
                      <input
                        id="modal-jc-promised"
                        type="date"
                        value={expectedDeliveryDate}
                        onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 border border-gray-300 dark:border-gray-700 text-gray-750 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-6 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Job Card'}
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
                <select
                  id="modal-part-select"
                  required
                  value={partItemId}
                  onChange={(e) => setPartItemId(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                >
                  <option value="">Select SKU...</option>
                  {partsItems.map((i) => (
                    <option
                      key={i.id}
                      value={i.id}
                    >{`${i.sku} - ${i.item_name} (Stock: ${i.current_quantity})`}</option>
                  ))}
                </select>
              </div>
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
