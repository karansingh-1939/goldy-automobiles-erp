import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/apiClient.js';
import { useAppStore } from '../../shared/store/useAppStore.js';
import { validateRequired, validateEmail, validatePhone, validateGstin } from '../../shared/utils/validation.js';
import { usePermissions } from '../../shared/hooks/usePermissions.js';
import DataTable from '../../shared/components/DataTable.jsx';
import { Search, Plus, UserPlus, X, Edit2, Trash2 } from 'lucide-react';

export default function CustomerManager() {
  const queryClient = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);
  const showConfirm = useAppStore((state) => state.showConfirm);
  const { hasPermission } = usePermissions();

  const canWrite = hasPermission('customers.write');

  // Search & Navigation States
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  // Modal Control States
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);

  // Form Fields State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [creditLimit, setCreditLimit] = useState('');

  // Fetch Customers Query
  const { data: response, isLoading, error } = useQuery({
    queryKey: ['customers', search, page, sortBy, sortOrder],
    queryFn: () => 
      api.get(`/api/v1/customers?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}&sortBy=${sortBy}&sortOrder=${sortOrder}`),
  });

  const customers = response?.data || [];
  const pagination = response?.pagination || { totalPages: 1, currentPage: 1 };

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/api/v1/customers', payload),
    onSuccess: () => {
      queryClient.invalidateQueries(['customers']);
      addNotification('Customer profile registered.', 'success');
      setShowAddModal(false);
      resetForm();
    },
    onError: (err) => addNotification(err.message || 'Failed to create customer.', 'error')
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.patch(`/api/v1/customers/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries(['customers']);
      addNotification('Customer profile updated.', 'success');
      setEditingCustomer(null);
      resetForm();
    },
    onError: (err) => addNotification(err.message || 'Failed to update customer.', 'error')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.del(`/api/v1/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['customers']);
      addNotification('Customer profile deleted.', 'success');
    },
    onError: (err) => addNotification(err.message || 'Failed to delete customer.', 'error')
  });

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setGstin('');
    setAddress('');
    setCity('');
    setState('');
    setPincode('');
    setCreditLimit('');
  };

  const handleOpenEdit = (customer) => {
    setEditingCustomer(customer);
    setName(customer.name || '');
    setPhone(customer.phone || '');
    setEmail(customer.email || '');
    setGstin(customer.gstin || '');
    setAddress(customer.address || '');
    setCity(customer.city || '');
    setState(customer.state || '');
    setPincode(customer.pincode || '');
    setCreditLimit(customer.credit_limit || '');
    setShowAddModal(true);
  };

  const handleSave = (e) => {
    e.preventDefault();

    // Run unified validations
    if (!validateRequired(name)) {
      return addNotification('Client name is required.', 'error');
    }
    if (email && !validateEmail(email)) {
      return addNotification('Please input a valid email coordinates.', 'error');
    }
    if (phone && !validatePhone(phone)) {
      return addNotification('Phone number must be exactly 10 numeric digits.', 'error');
    }
    if (gstin && !validateGstin(gstin)) {
      return addNotification('Invalid 15-digit GSTIN registration code.', 'error');
    }

    const payload = {
      name,
      phone: phone || undefined,
      email: email || undefined,
      gstin: gstin || undefined,
      address: address || undefined,
      city: city || undefined,
      state: state || undefined,
      pincode: pincode || undefined,
      credit_limit: creditLimit ? Number(creditLimit) : undefined
    };

    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (customer) => {
    showConfirm(
      'Delete Customer Profile',
      `Are you sure you want to permanently delete customer "${customer.name}"? This action cannot be undone.`,
      () => deleteMutation.mutate(customer.id)
    );
  };

  // TanStack Columns mapping
  const columns = [
    {
      accessorKey: 'name',
      header: 'Client Name',
      cell: (info) => <span className="font-semibold text-gray-900 dark:text-white">{info.getValue()}</span>
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: (info) => info.getValue() || '-'
    },
    {
      accessorKey: 'gstin',
      header: 'GSTIN',
      cell: (info) => <span className="font-mono text-xs">{info.getValue() || '-'}</span>
    },
    {
      accessorKey: 'city',
      header: 'City/State',
      cell: (info) => {
        const row = info.row.original;
        return row.city ? `${row.city}, ${row.state || ''}` : '-';
      }
    },
    {
      accessorKey: 'credit_limit',
      header: 'Credit Limit',
      cell: (info) => {
        const val = info.getValue();
        return val ? `₹${val.toLocaleString('en-IN')}` : 'No Limit';
      }
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const c = info.row.original;
        return (
          <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => handleOpenEdit(c)}
              disabled={!canWrite}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500 hover:text-brand-650 disabled:opacity-30 transition-colors"
            >
              <Edit2 className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => handleDelete(c)}
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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Customer Directory</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Complete fleet management, lookup search, and credit limit configuration.</p>
        </div>
        <button
          onClick={() => { resetForm(); setEditingCustomer(null); setShowAddModal(true); }}
          disabled={!canWrite}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Customer
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Filter by name, phone, or GSTIN..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus-ring"
        />
      </div>

      {/* Unified DataTable Component */}
      <DataTable
        columns={columns}
        data={customers}
        isLoading={isLoading}
        error={error}
        enablePagination={false}
        emptyStateMessage="No matching customer records found."
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
                <UserPlus className="h-5 w-5" />
                <h3 className="text-lg font-bold">{editingCustomer ? 'Edit Customer Settings' : 'New Customer Profile'}</h3>
              </div>
              <button
                onClick={() => { setShowAddModal(false); setEditingCustomer(null); }}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label htmlFor="customer-name-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Client Name *</label>
                  <input
                    id="customer-name-field"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="customer-phone-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Phone Number</label>
                  <input
                    id="customer-phone-field"
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="customer-email-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Email Address</label>
                  <input
                    id="customer-email-field"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label htmlFor="customer-gstin-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">GSTIN Number (15-digit)</label>
                  <input
                    id="customer-gstin-field"
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring font-mono text-gray-950 dark:text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label htmlFor="customer-address-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Billing Address</label>
                  <input
                    id="customer-address-field"
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="customer-city-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">City</label>
                  <input
                    id="customer-city-field"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="customer-state-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">State</label>
                  <input
                    id="customer-state-field"
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="customer-pincode-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">PIN Code</label>
                  <input
                    id="customer-pincode-field"
                    type="text"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="customer-limit-field" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Credit Limit (₹)</label>
                  <input
                    id="customer-limit-field"
                    type="number"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setEditingCustomer(null); }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
