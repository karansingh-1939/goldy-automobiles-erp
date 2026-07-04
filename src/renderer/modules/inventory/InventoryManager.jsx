import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/apiClient.js';
import { useAppStore } from '../../shared/store/useAppStore.js';
import { validateRequired, validateNumericRange } from '../../shared/utils/validation.js';
import { usePermissions } from '../../shared/hooks/usePermissions.js';
import DataTable from '../../shared/components/DataTable.jsx';
import { 
  Search, 
  Plus, 
  Package, 
  X, 
  Layers, 
  AlertCircle, 
  Edit2, 
  Check, 
  XCircle,
  ClipboardList
} from 'lucide-react';

export default function InventoryManager() {
  const queryClient = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);
  const showConfirm = useAppStore((state) => state.showConfirm);
  const { hasPermission } = usePermissions();

  const canWrite = hasPermission('inventory.write');
  const canAdjust = hasPermission('inventory.adjust');

  // Sub-Tab Switcher State: 'catalog' or 'audit'
  const [activeTab, setActiveTab] = useState('catalog');

  // Search & Navigation States (Catalog)
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [sortBy, setSortBy] = useState('sku');
  const [sortOrder, setSortOrder] = useState('asc');

  // Selected item detail and modal state
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Form State (Catalog)
  const [sku, setSku] = useState('');
  const [itemName, setItemName] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [gstRate, setGstRate] = useState('18');
  const [unitOfMeasure, setUnitOfMeasure] = useState('pcs');
  const [warrantyMonths, setWarrantyMonths] = useState('0');

  // ==========================================
  // TAB 1: CATALOG QUERIES & MUTATIONS
  // ==========================================
  const { data: response, isLoading, error } = useQuery({
    queryKey: ['inventory-items', search, page, sortBy, sortOrder],
    queryFn: () => 
      api.get(`/api/v1/inventory/items?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}&sortBy=${sortBy}&sortOrder=${sortOrder}`),
    enabled: activeTab === 'catalog'
  });

  const items = response?.data || [];
  const pagination = response?.pagination || { totalPages: 1, currentPage: 1 };

  const { data: batchesResponse, isLoading: loadingBatches } = useQuery({
    queryKey: ['item-batches', selectedItemId],
    queryFn: () => api.get(`/api/v1/inventory/items/${selectedItemId}/batches`),
    enabled: !!selectedItemId && activeTab === 'catalog'
  });

  const batches = batchesResponse?.data || [];

  const createMutation = useMutation({
    mutationFn: (newItem) => api.post('/api/v1/inventory/items', newItem),
    onSuccess: () => {
      queryClient.invalidateQueries(['inventory-items']);
      addNotification('Inventory item created successfully.', 'success');
      setShowAddModal(false);
      resetForm();
    },
    onError: (err) => addNotification(err.message || 'Failed to create item.', 'error')
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.patch(`/api/v1/inventory/items/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries(['inventory-items']);
      addNotification('Inventory item details updated.', 'success');
      setEditingItem(null);
      resetForm();
    },
    onError: (err) => addNotification(err.message || 'Failed to update item.', 'error')
  });

  const resetForm = () => {
    setSku('');
    setItemName('');
    setPurchaseCost('');
    setSellingPrice('');
    setReorderLevel('5');
    setGstRate('18');
    setUnitOfMeasure('pcs');
    setWarrantyMonths('0');
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setSku(item.sku || '');
    setItemName(item.item_name || '');
    setPurchaseCost(item.purchase_cost || '');
    setSellingPrice(item.selling_price || '');
    setReorderLevel(item.reorder_level || '5');
    setGstRate(item.gst_rate || '18');
    setUnitOfMeasure(item.unit_of_measure || 'pcs');
    setWarrantyMonths(item.warranty_period_months || '0');
    setShowAddModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validateRequired(itemName)) return addNotification('Catalog item name is required.', 'error');
    if (!validateRequired(purchaseCost)) return addNotification('Purchase cost is required.', 'error');
    if (!validateRequired(sellingPrice)) return addNotification('Selling price is required.', 'error');

    if (!validateNumericRange(purchaseCost, 0)) return addNotification('Purchase cost cannot be negative.', 'error');
    if (!validateNumericRange(sellingPrice, 0)) return addNotification('Selling price cannot be negative.', 'error');

    const payload = {
      sku: sku || undefined,
      itemName,
      purchase_cost: Number(purchaseCost),
      selling_price: Number(sellingPrice),
      reorder_level: Number(reorderLevel),
      gst_rate: Number(gstRate),
      unit_of_measure: unitOfMeasure,
      warranty_period_months: Number(warrantyMonths)
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // ==========================================
  // TAB 2: AUDIT & STOCK VERIFICATIONS
  // ==========================================
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditWarehouseId, setAuditWarehouseId] = useState('');
  const [auditItemId, setAuditItemId] = useState('');
  const [auditBatchId, setAuditBatchId] = useState('');
  const [auditCountedQty, setAuditCountedQty] = useState('');
  const [auditNotes, setAuditNotes] = useState('');

  // Fetch past verifications
  const { data: verificationsResponse, isLoading: loadingVerifications } = useQuery({
    queryKey: ['stock-verifications'],
    queryFn: () => api.get('/api/v1/inventory/verifications?limit=50'),
    enabled: activeTab === 'audit'
  });

  const verifications = verificationsResponse?.data?.items || [];

  // Fetch Warehouses for dropdown
  const { data: warehousesResponse } = useQuery({
    queryKey: ['warehouses-list'],
    queryFn: () => api.get('/api/v1/warehouses'),
    enabled: showAuditModal
  });
  const warehouses = warehousesResponse?.data || [];

  // Fetch All Items for dropdown
  const { data: allItemsResponse } = useQuery({
    queryKey: ['all-items'],
    queryFn: () => api.get('/api/v1/inventory/items?limit=100'),
    enabled: showAuditModal
  });
  const allItems = allItemsResponse?.data || [];

  // Fetch Batches for chosen audit item
  const { data: auditBatchesResponse } = useQuery({
    queryKey: ['audit-item-batches', auditItemId],
    queryFn: () => api.get(`/api/v1/inventory/items/${auditItemId}/batches`),
    enabled: !!auditItemId && showAuditModal
  });
  const auditBatches = auditBatchesResponse?.data || [];

  const selectedAuditBatch = auditBatches.find(b => String(b.id) === String(auditBatchId));
  const expectedQty = selectedAuditBatch ? Number(selectedAuditBatch.quantity) : 0;
  const variance = auditCountedQty !== '' ? Number(auditCountedQty) - expectedQty : 0;

  // Mutations for Audit
  const createVerificationMutation = useMutation({
    mutationFn: (payload) => api.post('/api/v1/inventory/verifications', payload),
    onSuccess: () => {
      queryClient.invalidateQueries(['stock-verifications']);
      addNotification('Stock verification audit submitted.', 'success');
      setShowAuditModal(false);
      resetAuditForm();
    },
    onError: (err) => addNotification(err.message || 'Failed to submit verification.', 'error')
  });

  const approveVerificationMutation = useMutation({
    mutationFn: (id) => api.post(`/api/v1/inventory/verifications/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries(['stock-verifications']);
      queryClient.invalidateQueries(['inventory-items']);
      addNotification('Inventory reconciliation adjustment approved.', 'success');
    },
    onError: (err) => addNotification(err.message || 'Approval failed.', 'error')
  });

  const rejectVerificationMutation = useMutation({
    mutationFn: (id) => api.post(`/api/v1/inventory/verifications/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries(['stock-verifications']);
      addNotification('Verification adjustment rejected.', 'success');
    },
    onError: (err) => addNotification(err.message || 'Rejection failed.', 'error')
  });

  const resetAuditForm = () => {
    setAuditWarehouseId('');
    setAuditItemId('');
    setAuditBatchId('');
    setAuditCountedQty('');
    setAuditNotes('');
  };

  const handleSaveAudit = (e) => {
    e.preventDefault();

    if (!validateRequired(auditWarehouseId)) return addNotification('Warehouse selection is required.', 'error');
    if (!validateRequired(auditItemId)) return addNotification('Item is required.', 'error');
    if (!validateRequired(auditBatchId)) return addNotification('Batch is required.', 'error');
    if (!validateRequired(auditCountedQty)) return addNotification('Counted quantity is required.', 'error');

    createVerificationMutation.mutate({
      verification_type: 'Single Item',
      warehouse_id: Number(auditWarehouseId),
      item_id: Number(auditItemId),
      batch_id: Number(auditBatchId),
      counted_quantity: Number(auditCountedQty),
      notes: auditNotes || undefined
    });
  };

  // Catalog Columns
  const catalogColumns = [
    {
      accessorKey: 'sku',
      header: 'SKU',
      cell: (info) => <span className="font-mono text-xs font-bold text-gray-900 dark:text-white">{info.getValue()}</span>
    },
    {
      accessorKey: 'item_name',
      header: 'Item Name',
      cell: (info) => {
        const row = info.row.original;
        return (
          <div>
            <p className="font-semibold text-gray-950 dark:text-white">{row.item_name}</p>
            <p className="text-xs text-gray-400">{row.category_name || 'Uncategorized'}</p>
          </div>
        );
      }
    },
    {
      accessorKey: 'purchase_cost',
      header: 'Cost',
      cell: (info) => `₹${Number(info.getValue()).toFixed(2)}`
    },
    {
      accessorKey: 'selling_price',
      header: 'Price',
      cell: (info) => `₹${Number(info.getValue()).toFixed(2)}`
    },
    {
      accessorKey: 'current_quantity',
      header: 'Stock Status',
      cell: (info) => {
        const row = info.row.original;
        const isLow = Number(row.current_quantity) <= Number(row.reorder_level);
        return (
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
            isLow 
              ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-450' 
              : 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-450'
          }`}>
            {row.current_quantity} {row.unit_of_measure}
          </span>
        );
      }
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const item = info.row.original;
        return (
          <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => handleOpenEdit(item)}
              disabled={!canWrite}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500 hover:text-brand-650 disabled:opacity-30 transition-colors"
            >
              <Edit2 className="h-4 w-4" />
            </button>
          </div>
        );
      }
    }
  ];

  // Audit Columns
  const auditColumns = [
    {
      accessorKey: 'verification_number',
      header: 'Verification ID',
      cell: (info) => <span className="font-mono text-xs font-bold text-gray-900 dark:text-white">{info.getValue()}</span>
    },
    {
      accessorKey: 'warehouse_name',
      header: 'Warehouse',
      cell: (info) => info.getValue()
    },
    {
      accessorKey: 'item_name',
      header: 'Audited Item',
      cell: (info) => (
        <div>
          <p className="font-semibold text-gray-950 dark:text-white">{info.getValue()}</p>
          <p className="text-[10px] text-gray-400 font-mono">Batch: {info.row.original.batch_number || 'N/A'}</p>
        </div>
      )
    },
    {
      accessorKey: 'expected_quantity',
      header: 'Expected',
      cell: (info) => <span className="font-mono">{info.getValue()}</span>
    },
    {
      accessorKey: 'counted_quantity',
      header: 'Counted',
      cell: (info) => <span className="font-mono font-bold">{info.getValue()}</span>
    },
    {
      id: 'variance',
      header: 'Variance',
      cell: (info) => {
        const row = info.row.original;
        const diff = Number(row.counted_quantity) - Number(row.expected_quantity);
        return (
          <span className={`font-bold font-mono ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-450'}`}>
            {diff > 0 ? `+${diff}` : diff}
          </span>
        );
      }
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info) => {
        const val = info.getValue();
        return (
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
            val === 'APPROVED' 
              ? 'bg-green-50 text-green-800 dark:bg-green-950/20 dark:text-green-400'
              : val === 'REJECTED'
              ? 'bg-red-50 text-red-800 dark:bg-red-950/20 dark:text-red-400'
              : 'bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400'
          }`}>
            {val}
          </span>
        );
      }
    },
    {
      id: 'actions',
      header: 'Approvals',
      cell: (info) => {
        const row = info.row.original;
        if (row.status !== 'PENDING') return <span className="text-xs text-gray-400">Archived</span>;
        return (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => showConfirm('Approve Adjustment', 'Post this stock adjustment and reconcile inventory values?', () => approveVerificationMutation.mutate(row.id))}
              disabled={!canAdjust}
              className="p-1 hover:bg-green-50 dark:hover:bg-green-950/30 rounded text-green-600 hover:text-green-700 disabled:opacity-30"
              title="Approve reconciliation"
            >
              <Check className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => showConfirm('Reject Adjustment', 'Reject this stock adjustment?', () => rejectVerificationMutation.mutate(row.id))}
              disabled={!canAdjust}
              className="p-1 hover:bg-red-50 dark:hover:bg-red-950/30 rounded text-red-500 hover:text-red-655 disabled:opacity-30"
              title="Reject adjustment"
            >
              <XCircle className="h-4.5 w-4.5" />
            </button>
          </div>
        );
      }
    }
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Sub tabs list */}
      <div className="flex border-b border-gray-250 dark:border-gray-800 gap-6">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'catalog'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <Package className="h-4.5 w-4.5" />
          Inventory Catalog
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <ClipboardList className="h-4.5 w-4.5" />
          Stock Audit & Reconciliation
        </button>
      </div>

      {/* CATALOG VIEW */}
      {activeTab === 'catalog' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Items Registry</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Complete items index, automatic sequential SKU allocation, and stock batch tracking.</p>
            </div>
            <button
              onClick={() => { resetForm(); setEditingItem(null); setShowAddModal(true); }}
              disabled={!canWrite}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2 space-y-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search by SKU, name, or barcode..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus-ring"
                />
              </div>

              <DataTable
                columns={catalogColumns}
                data={items}
                isLoading={isLoading}
                error={error}
                onRowClick={(item) => setSelectedItemId(item.id)}
                enablePagination={false}
                emptyStateMessage="No catalog items registered."
              />

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
            </div>

            {/* Right Side - Batch Details */}
            <div className="col-span-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm h-fit space-y-6">
              <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
                <Layers className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                <h3 className="font-bold text-gray-950 dark:text-white">Active Warehouse Batches</h3>
              </div>

              {!selectedItemId ? (
                <div className="p-12 text-center text-xs text-gray-400">
                  Select an item on the left to inspect warehouse locations and batch details.
                </div>
              ) : loadingBatches ? (
                <div className="p-12 text-center text-xs text-gray-400">Loading batch details...</div>
              ) : batches.length === 0 ? (
                <div className="p-12 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <span>No active stock batches found in any warehouse for this item.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {batches.map((b) => (
                    <div key={b.id} className="p-4 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-800 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono text-gray-900 dark:text-white">{b.batch_number}</span>
                        <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full dark:bg-green-950/30 dark:text-green-450">
                          {b.quantity} remaining
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800/60 pt-2">
                        <span>Warehouse:</span>
                        <span className="font-semibold text-right text-gray-850 dark:text-gray-200">{b.warehouse_name}</span>
                        <span>Cost snapshot:</span>
                        <span className="font-semibold text-right text-gray-850 dark:text-gray-200 font-mono">₹{b.purchase_cost}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* AUDIT VIEW */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Physical Stock Audits</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Reconcile system counts with physical warehouse inventory states and log variances.</p>
            </div>
            <button
              onClick={() => { resetAuditForm(); setShowAuditModal(true); }}
              disabled={!canAdjust}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Perform Stock Count
            </button>
          </div>

          <DataTable
            columns={auditColumns}
            data={verifications}
            isLoading={loadingVerifications}
            emptyStateMessage="No physical stock audits recorded."
            enablePagination={false}
          />
        </div>
      )}

      {/* Catalog Create/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
                <Package className="h-5 w-5" />
                <h3 className="text-lg font-bold">{editingItem ? 'Edit Item Details' : 'New Catalog Item'}</h3>
              </div>
              <button onClick={() => { setShowAddModal(false); setEditingItem(null); }} className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Form inputs identical to previous CRUD definitions */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-650 dark:text-gray-400">SKU (Auto if blank)</label>
                  <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} disabled={!!editingItem} placeholder="E.g. SPARE-ALT-01" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring font-mono text-gray-950 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-650 dark:text-gray-400">Item Name *</label>
                  <input type="text" required value={itemName} onChange={(e) => setItemName(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-655 dark:text-gray-400">Purchase Cost (₹) *</label>
                  <input type="number" required value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-655 dark:text-gray-400">Selling Price (₹) *</label>
                  <input type="number" required value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button type="button" onClick={() => { setShowAddModal(false); setEditingItem(null); }} className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">Save Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock count audit modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
                <ClipboardList className="h-5 w-5" />
                <h3 className="text-lg font-bold">Physical Stock Audit count</h3>
              </div>
              <button onClick={() => setShowAuditModal(false)} className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <form onSubmit={handleSaveAudit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label htmlFor="audit-warehouse-select" className="block text-xs font-semibold text-gray-655 dark:text-gray-400">Target Warehouse *</label>
                  <select
                    id="audit-warehouse-select"
                    required
                    value={auditWarehouseId}
                    onChange={(e) => setAuditWarehouseId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  >
                    <option value="">Select warehouse location...</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>
                
                <div className="col-span-2">
                  <label htmlFor="audit-item-select" className="block text-xs font-semibold text-gray-655 dark:text-gray-400">Select Audited Item *</label>
                  <select
                    id="audit-item-select"
                    required
                    value={auditItemId}
                    onChange={(e) => { setAuditItemId(e.target.value); setAuditBatchId(''); }}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  >
                    <option value="">Select inventory item...</option>
                    {allItems.map(i => (
                      <option key={i.id} value={i.id}>{i.item_name} ({i.sku})</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label htmlFor="audit-batch-select" className="block text-xs font-semibold text-gray-655 dark:text-gray-400">Select Item Batch *</label>
                  <select
                    id="audit-batch-select"
                    required
                    disabled={!auditItemId}
                    value={auditBatchId}
                    onChange={(e) => setAuditBatchId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white disabled:opacity-50"
                  >
                    <option value="">Select stock batch...</option>
                    {auditBatches.map(b => (
                      <option key={b.id} value={b.id}>{b.batch_number} (Qty: {b.quantity})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="audit-counted-field" className="block text-xs font-semibold text-gray-655 dark:text-gray-400">Counted Quantity *</label>
                  <input
                    id="audit-counted-field"
                    type="number"
                    required
                    value={auditCountedQty}
                    onChange={(e) => setAuditCountedQty(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>

                <div className="flex flex-col justify-end p-2 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
                  <span className="text-[10px] text-gray-400 font-bold uppercase">Variance Summary</span>
                  <div className="flex justify-between text-xs mt-1">
                    <span>Expected: {expectedQty}</span>
                    <span className={`font-bold ${variance > 0 ? 'text-green-600' : variance < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                      Variance: {variance > 0 ? `+${variance}` : variance}
                    </span>
                  </div>
                </div>

                <div className="col-span-2">
                  <label htmlFor="audit-notes-field" className="block text-xs font-semibold text-gray-655 dark:text-gray-400">Audit Notes / Reason</label>
                  <input
                    id="audit-notes-field"
                    type="text"
                    value={auditNotes}
                    onChange={(e) => setAuditNotes(e.target.value)}
                    placeholder="E.g. Discrepancy due to damaged components"
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-250 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowAuditModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-755 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createVerificationMutation.isPending}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50"
                >
                  Post verification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
