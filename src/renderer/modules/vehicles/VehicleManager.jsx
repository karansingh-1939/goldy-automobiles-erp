import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/apiClient.js';
import { useAppStore } from '../../shared/store/useAppStore.js';
import { validateRequired, validateVehicleReg } from '../../shared/utils/validation.js';
import { usePermissions } from '../../shared/hooks/usePermissions.js';
import DataTable from '../../shared/components/DataTable.jsx';
import { Search, Plus, Car, X, Edit2, Trash2 } from 'lucide-react';

export default function VehicleManager() {
  const queryClient = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);
  const showConfirm = useAppStore((state) => state.showConfirm);
  const { hasPermission } = usePermissions();

  const canWrite = hasPermission('vehicles.write');

  // Search & Navigation States
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [sortBy, setSortBy] = useState('registration_number');
  const [sortOrder, setSortOrder] = useState('asc');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);

  // Form Fields State
  const [customerId, setCustomerId] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [fuelType, setFuelType] = useState('Petrol');
  const [year, setYear] = useState('');
  const [vin, setVin] = useState('');
  const [engineNumber, setEngineNumber] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [odometer, setOdometer] = useState('');

  // Fetch Vehicles Query
  const { data: response, isLoading, error } = useQuery({
    queryKey: ['vehicles', search, page, sortBy, sortOrder],
    queryFn: () => 
      api.get(`/api/v1/vehicles?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}&sortBy=${sortBy}&sortOrder=${sortOrder}`),
  });

  const vehicles = response?.data || [];
  const pagination = response?.pagination || { totalPages: 1, currentPage: 1 };

  // Fetch Customers (for select owner list)
  const { data: customersResponse } = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => api.get('/api/v1/customers'),
  });
  const customers = customersResponse?.data || [];

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/api/v1/vehicles', payload),
    onSuccess: () => {
      queryClient.invalidateQueries(['vehicles']);
      addNotification('Vehicle registered successfully.', 'success');
      setShowAddModal(false);
      resetForm();
    },
    onError: (err) => addNotification(err.message || 'Failed to register vehicle.', 'error')
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.patch(`/api/v1/vehicles/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries(['vehicles']);
      addNotification('Vehicle details updated.', 'success');
      setEditingVehicle(null);
      resetForm();
    },
    onError: (err) => addNotification(err.message || 'Failed to update vehicle.', 'error')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.del(`/api/v1/vehicles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['vehicles']);
      addNotification('Vehicle deleted.', 'success');
    },
    onError: (err) => addNotification(err.message || 'Failed to delete vehicle.', 'error')
  });

  const resetForm = () => {
    setCustomerId('');
    setRegNumber('');
    setMake('');
    setModel('');
    setVariant('');
    setFuelType('Petrol');
    setYear('');
    setVin('');
    setEngineNumber('');
    setChassisNumber('');
    setOdometer('');
  };

  const handleOpenEdit = (vehicle) => {
    setEditingVehicle(vehicle);
    setCustomerId(vehicle.customer_id || '');
    setRegNumber(vehicle.registration_number || '');
    setMake(vehicle.make || '');
    setModel(vehicle.model || '');
    setVariant(vehicle.variant || '');
    setFuelType(vehicle.fuel_type || 'Petrol');
    setYear(vehicle.year || '');
    setVin(vehicle.vin || '');
    setEngineNumber(vehicle.engine_number || '');
    setChassisNumber(vehicle.chassis_number || '');
    setOdometer(vehicle.odometer_reading || '');
    setShowAddModal(true);
  };

  const handleSave = (e) => {
    e.preventDefault();

    // Validations
    if (!validateRequired(customerId)) return addNotification('Owner account selection is required.', 'error');
    if (!validateRequired(regNumber)) return addNotification('Registration number is required.', 'error');
    if (!validateRequired(make)) return addNotification('Vehicle manufacturer make is required.', 'error');
    if (!validateRequired(model)) return addNotification('Vehicle model is required.', 'error');
    
    if (!validateVehicleReg(regNumber)) {
      return addNotification('Invalid Indian vehicle registration format (e.g. HR26AB1234).', 'error');
    }

    const payload = {
      customer_id: Number(customerId),
      registration_number: regNumber.replace(/[-\s]/g, '').toUpperCase(),
      make,
      model,
      variant: variant || undefined,
      fuel_type: fuelType,
      year: year ? Number(year) : undefined,
      vin: vin || undefined,
      engine_number: engineNumber || undefined,
      chassis_number: chassisNumber || undefined,
      odometer_reading: odometer ? Number(odometer) : undefined
    };

    if (editingVehicle) {
      updateMutation.mutate({ id: editingVehicle.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (vehicle) => {
    showConfirm(
      'Delete Vehicle Profile',
      `Are you sure you want to permanently delete vehicle "${vehicle.registration_number}"? This will dissolve invoice history reference records.`,
      () => deleteMutation.mutate(vehicle.id)
    );
  };

  const columns = [
    {
      accessorKey: 'registration_number',
      header: 'Registration No.',
      cell: (info) => <span className="font-mono font-bold text-gray-900 dark:text-white">{info.getValue()}</span>
    },
    {
      accessorKey: 'make',
      header: 'Make & Model',
      cell: (info) => {
        const row = info.row.original;
        return `${row.make} ${row.model} ${row.variant || ''}`;
      }
    },
    {
      accessorKey: 'fuel_type',
      header: 'Fuel Type',
      cell: (info) => <span className="capitalize">{info.getValue()}</span>
    },
    {
      accessorKey: 'odometer_reading',
      header: 'Odometer',
      cell: (info) => {
        const val = info.getValue();
        return val ? `${val.toLocaleString('en-IN')} km` : '-';
      }
    },
    {
      accessorKey: 'customer_name',
      header: 'Owner Account',
      cell: (info) => <span className="text-brand-650 dark:text-brand-400 font-semibold">{info.getValue() || `ID: ${info.row.original.customer_id}`}</span>
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const v = info.row.original;
        return (
          <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => handleOpenEdit(v)}
              disabled={!canWrite}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500 hover:text-brand-650 disabled:opacity-30 transition-colors"
            >
              <Edit2 className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => handleDelete(v)}
              disabled={!canWrite}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-450 hover:text-red-650 disabled:opacity-30 transition-colors"
            >
              <Trash2 className="h-4.5 w-4.5" />
            </button>
          </div>
        );
      }
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Vehicle Database</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Complete fleet management, lookup search, and owner assignments.</p>
        </div>
        <button
          onClick={() => { resetForm(); setEditingVehicle(null); setShowAddModal(true); }}
          disabled={!canWrite}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Register Vehicle
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by registration number, make, model..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus-ring"
        />
      </div>

      {/* Shared DataTable Component */}
      <DataTable
        columns={columns}
        data={vehicles}
        isLoading={isLoading}
        error={error}
        enablePagination={false}
        emptyStateMessage="No matching vehicle accounts found."
      />

      {/* Pagination controls */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-250 dark:border-gray-800 pt-4">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-xs font-semibold rounded hover:bg-gray-100 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">Page {page} of {pagination.totalPages}</span>
          <button
            disabled={page === pagination.totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-xs font-semibold rounded hover:bg-gray-100 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
                <Car className="h-5 w-5" />
                <h3 className="text-lg font-bold">{editingVehicle ? 'Edit Vehicle Profile' : 'Register Customer Vehicle'}</h3>
              </div>
              <button
                onClick={() => { setShowAddModal(false); setEditingVehicle(null); }}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label htmlFor="vehicle-owner-select" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Owner Account *</label>
                  <select
                    id="vehicle-owner-select"
                    required
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  >
                    <option value="">Select owner profile...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{`${c.name} (${c.phone || 'No Phone'})`}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="vehicle-reg-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Registration Number *</label>
                  <input
                    id="vehicle-reg-field"
                    type="text"
                    required
                    value={regNumber}
                    onChange={(e) => setRegNumber(e.target.value)}
                    placeholder="E.g. HR26AB1234"
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring font-mono text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="vehicle-make-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Make *</label>
                  <input
                    id="vehicle-make-field"
                    type="text"
                    required
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="vehicle-model-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Model *</label>
                  <input
                    id="vehicle-model-field"
                    type="text"
                    required
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="vehicle-variant-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Variant</label>
                  <input
                    id="vehicle-variant-field"
                    type="text"
                    value={variant}
                    onChange={(e) => setVariant(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="vehicle-fuel-select" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Fuel Type</label>
                  <select
                    id="vehicle-fuel-select"
                    value={fuelType}
                    onChange={(e) => setFuelType(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  >
                    <option value="Petrol">Petrol</option>
                    <option value="Diesel">Diesel</option>
                    <option value="CNG">CNG</option>
                    <option value="Electric">Electric</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="vehicle-year-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Manufacture Year</label>
                  <input
                    id="vehicle-year-field"
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="vehicle-vin-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">VIN Number (17-digit)</label>
                  <input
                    id="vehicle-vin-field"
                    type="text"
                    value={vin}
                    onChange={(e) => setVin(e.target.value.toUpperCase())}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring font-mono text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="vehicle-engine-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Engine Number</label>
                  <input
                    id="vehicle-engine-field"
                    type="text"
                    value={engineNumber}
                    onChange={(e) => setEngineNumber(e.target.value.toUpperCase())}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring font-mono text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="vehicle-chassis-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Chassis Number</label>
                  <input
                    id="vehicle-chassis-field"
                    type="text"
                    value={chassisNumber}
                    onChange={(e) => setChassisNumber(e.target.value.toUpperCase())}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring font-mono text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="vehicle-odometer-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Odometer Reading (km)</label>
                  <input
                    id="vehicle-odometer-field"
                    type="number"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setEditingVehicle(null); }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  Save Vehicle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
