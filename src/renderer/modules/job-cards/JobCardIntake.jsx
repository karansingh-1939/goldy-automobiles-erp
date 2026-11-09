import React from 'react';
import RemoteSelect from '../../shared/components/RemoteSelect.jsx';
import { Wrench, X, User, Car, ShieldAlert, Plus, CheckCircle } from 'lucide-react';
export default function JobCardIntake({
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
}) {
  return (
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
            onClick={() => {
              cancelLookups();
              setShowAddModal(false);
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-150 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleCreateJc}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 overflow-y-auto max-h-[70vh] divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-800">
            {lookupBusy && (
              <p role="status" className="text-sm text-gray-500">
                Checking customer and vehicle details...
              </p>
            )}
            {lookupError && (
              <p role="alert" className="text-sm text-red-600">
                {lookupError} Change or re-enter the lookup field to retry.
              </p>
            )}

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
                        <label htmlFor="modal-cust-addr" className="block text-xs text-gray-500">
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
                        <label htmlFor="modal-cust-city" className="block text-xs text-gray-500">
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
                        <label htmlFor="modal-cust-notes" className="block text-xs text-gray-500">
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
                        <label htmlFor="modal-veh-chassis" className="block text-xs text-gray-500">
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
                        <label htmlFor="modal-veh-engine" className="block text-xs text-gray-500">
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
                  <RemoteSelect
                    id="modal-jc-mechanic"
                    endpoint="/api/v1/technicians"
                    queryKey="intake-technicians"
                    value={technicianId}
                    onChange={setTechnicianId}
                    required={false}
                    searchLabel="Search technicians"
                    optionLabel={(t) => `${t.name} (${t.specialization || 'Mechanic'})`}
                  />
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
              onClick={() => {
                cancelLookups();
                setShowAddModal(false);
              }}
              className="px-5 py-2.5 border border-gray-300 dark:border-gray-700 text-gray-750 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canWrite || createMutation.isPending || lookupBusy || Boolean(lookupError)}
              className="px-6 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Job Card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
