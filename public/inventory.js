const token = sessionStorage.getItem('goldy_auth_token');
const message = document.querySelector('#message');

let activeSubreport = 'movements';

let editingItemId = null;
let page = 1;
let activeItemsList = [];

// Message display helper
function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? '#dc2626' : '#15803d';
}

// API wrapper with token
async function api(endpoint, options = {}) {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    sessionStorage.removeItem('goldy_auth_token');
    window.location.replace('/index.html');
    return;
  }

  const body = await response.json();

  if (!response.ok) {
    const error = new Error(body.error?.message || 'Request failed.');
    if (body.error?.details) {
      error.details = body.error.details;
    }
    throw error;
  }

  return body;
}

// Check session
if (!token) {
  window.location.replace('/index.html');
} else {
  init();
}

async function init() {
  setupTabs();
  setupListeners();
  setupLogout();
  await loadMetadataDropdowns();
  await cacheActiveItems();
  // Autocomplete setup
  setupAutocomplete('quick-item-search', 'quick-search-results', 'quick-item-id', (item) => {
    const detailsDiv = document.getElementById('quick-item-details');
    detailsDiv.style.display = 'block';
    document.getElementById('quick-selected-name').textContent = item.item_name;
    document.getElementById('quick-selected-sku').textContent = item.sku;
    document.getElementById('quick-selected-stock').textContent = item.current_quantity;
    document.getElementById('quick-selected-unit').textContent = item.unit_of_measure || 'pcs';

    // Default actual count input to current quantity
    document.getElementById('quick-qty').value = item.current_quantity;
    updateVariance();
  });

  // Default first tab view
  switchTab('catalog');
}

function setupLogout() {
  const logoutBtn = document.querySelector('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error('Logout API failed:', err);
      }
      sessionStorage.removeItem('goldy_auth_token');
      window.location.replace('/index.html');
    });
  }
}

// Sidebar Tab switching
function setupTabs() {
  const tabsContainer = document.querySelector('#inventory-tabs');
  tabsContainer.querySelectorAll('button').forEach((btn) => {
    if (btn.id === 'sidebar-quick-add-btn') {
      btn.addEventListener('click', () => {
        openQuickAddModal();
      });
      return;
    }
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });

  // Reports inner tabs
  const reportsTabs = document.querySelector('#reports-inner-tabs');
  reportsTabs.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const subreport = btn.dataset.subreport;
      switchSubreport(subreport);
    });
  });

  // Dashboard card click listener for low stock
  document.getElementById('dash-low-stock-card').addEventListener('click', () => {
    switchTab('low-stock');
  });
}

function switchTab(tab) {
  document
    .querySelector('#inventory-tabs')
    .querySelectorAll('button')
    .forEach((btn) => {
      btn.setAttribute('aria-selected', btn.dataset.tab === tab ? 'true' : 'false');
    });

  const allTabs = ['dashboard', 'catalog', 'initial-count', 'quick-update', 'low-stock', 'reports'];
  allTabs.forEach((t) => {
    const element = document.querySelector(`#tab-${t}`);
    if (element) {
      element.style.display = t === tab ? 'block' : 'none';
    }
  });

  if (tab === 'dashboard') {
    loadDashboardStats();
  } else if (tab === 'catalog') {
    loadInventoryCatalog();
  } else if (tab === 'initial-count') {
    loadInitialCountPage();
  } else if (tab === 'low-stock') {
    loadLowStockReport();
  } else if (tab === 'reports') {
    switchSubreport(activeSubreport);
  }
}

function switchSubreport(subreport) {
  activeSubreport = subreport;
  document
    .querySelector('#reports-inner-tabs')
    .querySelectorAll('button')
    .forEach((btn) => {
      btn.setAttribute('aria-selected', btn.dataset.subreport === subreport ? 'true' : 'false');
    });

  const allSubreports = ['summary', 'valuation', 'movements'];
  allSubreports.forEach((sr) => {
    const element = document.querySelector(`#subreport-${sr}`);
    if (element) {
      element.style.display = sr === subreport ? 'block' : 'none';
    }
  });

  loadReportsData(subreport);
}

// SETUP LISTENERS
function setupListeners() {
  // Search & Filter
  document.querySelector('#search-btn').addEventListener('click', () => {
    page = 1;
    loadInventoryCatalog();
  });

  document.querySelector('#reset-filters-btn').addEventListener('click', () => {
    document.querySelector('#search-query').value = '';
    document.querySelector('#filter-category').value = '';
    page = 1;
    loadInventoryCatalog();
  });

  // Pagination
  document.querySelector('#prev-btn').addEventListener('click', () => {
    if (page > 1) {
      page--;
      loadInventoryCatalog();
    }
  });

  document.querySelector('#next-btn').addEventListener('click', () => {
    page++;
    loadInventoryCatalog();
  });

  // Modal actions
  document.querySelector('#add-item-btn').addEventListener('click', () => {
    openItemModal();
  });

  document.querySelector('#modal-cancel-btn').addEventListener('click', () => {
    closeItemModal();
  });

  // Quick Add actions
  document.querySelector('#quick-add-btn').addEventListener('click', () => {
    openQuickAddModal();
  });

  document.querySelector('#quick-add-cancel-btn').addEventListener('click', () => {
    closeQuickAddModal();
  });

  // Form Submit for Add/Edit Item
  document.querySelector('#item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveInventoryItem();
  });

  // Form Submit for Quick Add Item
  document.querySelector('#quick-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveQuickInventoryItem();
  });

  // Initial count handlers
  document.getElementById('initial-search-btn').addEventListener('click', () => {
    initialCountSearch = document.getElementById('initial-search-query').value.trim();
    initialCountPage = 1;
    loadInitialCountPage();
  });

  document.getElementById('initial-clear-btn').addEventListener('click', () => {
    document.getElementById('initial-search-query').value = '';
    initialCountSearch = '';
    initialCountPage = 1;
    loadInitialCountPage();
  });

  document.getElementById('initial-prev-btn').addEventListener('click', () => {
    if (initialCountPage > 1) {
      initialCountPage--;
      loadInitialCountPage();
    }
  });

  document.getElementById('initial-next-btn').addEventListener('click', () => {
    initialCountPage++;
    loadInitialCountPage();
  });

  document.getElementById('initial-save-all-btn').addEventListener('click', saveAllInitialCounts);
  document
    .getElementById('initial-save-all-bottom-btn')
    .addEventListener('click', saveAllInitialCounts);

  // Update stock form event listeners
  document.getElementById('quick-qty').addEventListener('input', updateVariance);

  const reasonSelect = document.getElementById('quick-reason-select');
  if (reasonSelect) {
    reasonSelect.addEventListener('change', () => {
      const customWrapper = document.getElementById('quick-reason-custom-wrapper');
      if (customWrapper) {
        customWrapper.style.display = reasonSelect.value === 'Other' ? 'block' : 'none';
        const customInput = document.getElementById('quick-reason-custom');
        if (customInput) {
          if (reasonSelect.value === 'Other') {
            customInput.required = true;
          } else {
            customInput.required = false;
            customInput.value = '';
          }
        }
      }
    });
  }

  document.getElementById('quick-update-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('quick-item-id').value;
    if (!itemId) {
      showMessage('Please select an item from the autocomplete list.', true);
      return;
    }

    const newQty = Number(document.getElementById('quick-qty').value);
    const currentQty = Number(document.getElementById('quick-selected-stock').textContent || 0);

    if (newQty === currentQty) {
      showMessage('No stock change detected.', true);
      return;
    }

    let reason = document.getElementById('quick-reason-select').value;
    if (reason === 'Other') {
      reason = document.getElementById('quick-reason-custom').value.trim() || 'Physical Count';
    }

    try {
      await api('/api/v1/inventory/verifications', {
        method: 'POST',
        body: JSON.stringify({
          item_id: Number(itemId),
          warehouse_id: 1,
          counted_quantity: newQty,
          notes: reason,
        }),
      });
      showMessage('Stock updated successfully!');

      document.getElementById('quick-update-form').reset();
      document.getElementById('quick-item-details').style.display = 'none';
      document.getElementById('quick-item-id').value = '';

      const varianceVal = document.getElementById('quick-variance-val');
      if (varianceVal) {
        varianceVal.textContent = '0';
        varianceVal.style.color = '#64748b';
      }

      const customWrapper = document.getElementById('quick-reason-custom-wrapper');
      if (customWrapper) customWrapper.style.display = 'none';

      await cacheActiveItems();
      loadInventoryCatalog();
    } catch (err) {
      showMessage('Failed to update stock: ' + err.message, true);
    }
  });

  // Print buttons
  document.querySelector('#print-low-stock-btn').addEventListener('click', () => window.print());
  document.querySelector('#print-valuation-btn').addEventListener('click', () => window.print());
  document.querySelector('#print-summary-btn').addEventListener('click', () => window.print());

  // Movements filter change
  document.querySelector('#movement-item-filter').addEventListener('change', () => {
    loadMovementsReport();
  });
}

// METADATA LOADERS
async function loadMetadataDropdowns() {
  try {
    // 1. Fetch categories
    const categoriesRes = await api('/api/v1/inventory-categories?pageSize=500');
    const catSelects = [
      document.querySelector('#filter-category'),
      document.querySelector('#modal-category-id'),
    ];
    catSelects.forEach((select) => {
      if (!select) return;
      select.innerHTML = select.id.includes('filter')
        ? '<option value="">All Categories</option>'
        : '<option value="">-- Select Category --</option>';
      categoriesRes.data.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        select.appendChild(opt);
      });
    });

    // 2. Fetch suppliers
    const suppliersRes = await api('/api/v1/suppliers?pageSize=500');
    const supSelects = [document.querySelector('#modal-supplier-id')];
    supSelects.forEach((select) => {
      if (!select) return;
      select.innerHTML = '<option value="">-- Select Supplier --</option>';
      suppliersRes.data
        .filter((s) => s.is_active)
        .forEach((s) => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.name;
          select.appendChild(opt);
        });
    });
  } catch (err) {
    showMessage(err.message, true);
  }
}

// Cache active items locally for autocomplete functionality
async function cacheActiveItems() {
  try {
    const res = await api('/api/v1/inventory/items?pageSize=1000');
    activeItemsList = res.data.filter((i) => i.is_active);
  } catch (err) {
    console.error('Failed to cache active items:', err);
  }
}

// Generic Autocomplete Utility
function setupAutocomplete(inputId, resultsId, hiddenId, onSelectCallback) {
  const input = document.getElementById(inputId);
  const resultsDiv = document.getElementById(resultsId);
  const hiddenInput = document.getElementById(hiddenId);

  input.addEventListener('input', () => {
    const val = input.value.trim().toLowerCase();
    resultsDiv.innerHTML = '';
    if (!val) {
      resultsDiv.style.display = 'none';
      return;
    }

    const matches = activeItemsList
      .filter(
        (item) =>
          item.sku.toLowerCase().includes(val) || item.item_name.toLowerCase().includes(val),
      )
      .slice(0, 10);

    if (matches.length === 0) {
      resultsDiv.innerHTML =
        '<div style="padding: 8px; color: #64748b; font-size: 14px;">No matching items found</div>';
    } else {
      matches.forEach((item) => {
        const div = document.createElement('div');
        div.style.padding = '8px 12px';
        div.style.cursor = 'pointer';
        div.style.borderBottom = '1px solid #e2e8f0';
        div.className = 'autocomplete-item';
        div.innerHTML = `<strong>${item.sku}</strong> - ${item.item_name} <span style="font-size: 12px; color: #64748b;">(${item.current_quantity} in stock)</span>`;
        div.addEventListener('click', () => {
          input.value = `${item.sku} - ${item.item_name}`;
          hiddenInput.value = item.id;
          resultsDiv.style.display = 'none';
          if (onSelectCallback) onSelectCallback(item);
        });
        resultsDiv.appendChild(div);
      });
    }
    resultsDiv.style.display = 'block';
  });

  // Hide results when clicking outside
  document.addEventListener('click', (e) => {
    if (e.target !== input && e.target !== resultsDiv) {
      resultsDiv.style.display = 'none';
    }
  });
}

// 0. INVENTORY DASHBOARD
async function loadDashboardStats() {
  try {
    const res = await api('/api/v1/inventory/dashboard-stats');
    document.getElementById('dash-total-items').textContent = res.totalItems;
    document.getElementById('dash-total-value').textContent = `Rs. ${res.totalValue.toFixed(2)}`;
    document.getElementById('dash-low-stock').textContent = res.lowStockCount;
    document.getElementById('dash-out-stock').textContent = res.outOfStockCount;
  } catch (err) {
    showMessage('Failed to load dashboard metrics: ' + err.message, true);
  }
}

// 1. CATALOG LIST
async function loadInventoryCatalog() {
  const search = document.querySelector('#search-query').value;
  const category = document.querySelector('#filter-category').value;

  const isFiltered = category;
  const params = new URLSearchParams({
    page: isFiltered ? '1' : String(page),
    pageSize: isFiltered ? '1000' : '10',
    search: search,
  });

  try {
    const res = await api(`/api/v1/inventory/items?${params}`);
    let data = res.data;

    if (category) {
      data = data.filter((item) => Number(item.category_id) === Number(category));
    }

    renderCatalogTable(data);

    if (isFiltered) {
      document.querySelector('#prev-btn').style.display = 'none';
      document.querySelector('#next-btn').style.display = 'none';
      document.querySelector('#page-info').textContent =
        `Showing ${data.length} filtered items (Total: ${res.pagination.total})`;
    } else {
      document.querySelector('#prev-btn').style.display = 'inline-block';
      document.querySelector('#next-btn').style.display = 'inline-block';
      document.querySelector('#page-info').textContent =
        `Page ${page} of ${res.pagination.totalPages || 1} (Total: ${res.pagination.total})`;

      document.querySelector('#prev-btn').disabled = page <= 1;
      document.querySelector('#next-btn').disabled = page >= (res.pagination.totalPages || 1);
    }
  } catch (err) {
    showMessage(err.message, true);
  }
}

function renderCatalogTable(rows) {
  const container = document.querySelector('#table-container');
  if (rows.length === 0) {
    container.innerHTML =
      '<p style="padding:10px; background:#f3f4f6; text-align:center;">No inventory items found.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Part Name</th>
          <th>Current Quantity</th>
          <th>Purchase Cost</th>
          <th>Selling Price</th>
          <th>Stock Value</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach((row) => {
    let stockClass = 'stock-indicator stock-ok';
    if (Number(row.current_quantity) <= 0) {
      stockClass = 'stock-indicator stock-none';
    } else if (Number(row.current_quantity) <= Number(row.reorder_level)) {
      stockClass = 'stock-indicator stock-low';
    }

    const status = row.is_active ? 'Active' : 'Inactive';
    const cost = Number(row.average_cost || row.purchase_cost || 0).toFixed(2);
    const price = Number(row.selling_price || 0).toFixed(2);
    const stockValue = (
      Number(row.current_quantity) * Number(row.average_cost || row.purchase_cost || 0)
    ).toFixed(2);

    html += `
      <tr>
        <td>
          <strong>${row.item_name}</strong>
          <div style="font-size:11px; color:#64748b; margin-top:2px;">SKU: ${row.sku}</div>
        </td>
        <td>
          <span class="${stockClass}">${row.current_quantity} ${row.unit_of_measure || 'pcs'}</span>
          <div style="font-size:10px; color:#64748b; margin-top:2px;">Min: ${row.reorder_level}</div>
        </td>
        <td>Rs. ${cost}</td>
        <td>Rs. ${price}</td>
        <td>Rs. ${stockValue}</td>
        <td>${status}</td>
        <td>
          <button type="button" class="view-edit-btn" data-id="${row.id}" style="padding:6px 10px; font-size:12px;">Edit</button>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;

  container.querySelectorAll('.view-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openItemModal(Number(btn.dataset.id));
    });
  });
}

// 2. ADD / EDIT ITEM MODAL WORKFLOW
async function openItemModal(id = null) {
  const modal = document.querySelector('#item-modal');
  const form = document.querySelector('#item-form');
  const title = document.querySelector('#modal-title');
  const skuInput = document.querySelector('#modal-sku');
  const openingStockSec = document.getElementById('modal-opening-stock-section');

  form.reset();
  editingItemId = id;

  if (id) {
    title.textContent = 'Edit Inventory Item';
    skuInput.disabled = true; // SKU is unmodifiable on update
    openingStockSec.style.display = 'none'; // Hide opening stock count when editing
    try {
      const res = await api(`/api/v1/inventory/items/${id}`);
      const item = res.data;

      document.querySelector('#modal-item-id').value = item.id;
      document.querySelector('#modal-sku').value = item.sku;
      document.querySelector('#modal-barcode').value = item.barcode || '';
      document.querySelector('#modal-name').value = item.item_name;
      document.querySelector('#modal-category-id').value = item.category_id || '';
      document.querySelector('#modal-supplier-id').value = item.supplier_id || '';
      document.querySelector('#modal-hsn').value = item.hsn_code || '';
      document.querySelector('#modal-gst').value = item.gst_rate;
      document.querySelector('#modal-unit').value = item.unit_of_measure || 'pcs';
      document.querySelector('#modal-cost').value = item.purchase_cost;
      document.querySelector('#modal-price').value = item.selling_price;
      document.querySelector('#modal-reorder').value = item.reorder_level;
      document.querySelector('#modal-active').checked = Boolean(item.is_active);
    } catch (err) {
      showMessage(err.message, true);
      return;
    }
  } else {
    title.textContent = 'Add New Inventory Item';
    skuInput.disabled = false;
    openingStockSec.style.display = 'grid'; // Show opening stock count only when creating new item
    document.querySelector('#modal-item-id').value = '';
    document.querySelector('#modal-active').checked = true;
  }

  modal.style.display = 'flex';
}

function closeItemModal() {
  document.querySelector('#item-modal').style.display = 'none';
  editingItemId = null;
}

async function saveInventoryItem() {
  const payload = {
    barcode: document.querySelector('#modal-barcode').value || null,
    item_name: document.querySelector('#modal-name').value,
    category_id: document.querySelector('#modal-category-id').value
      ? Number(document.querySelector('#modal-category-id').value)
      : null,
    supplier_id: document.querySelector('#modal-supplier-id').value
      ? Number(document.querySelector('#modal-supplier-id').value)
      : null,
    hsn_code: document.querySelector('#modal-hsn').value || null,
    gst_rate: Number(document.querySelector('#modal-gst').value),
    unit_of_measure: document.querySelector('#modal-unit').value,
    purchase_cost: Number(document.querySelector('#modal-cost').value),
    selling_price: Number(document.querySelector('#modal-price').value),
    reorder_level: Number(document.querySelector('#modal-reorder').value),
    is_active: document.querySelector('#modal-active').checked ? 1 : 0,
  };

  if (!editingItemId) {
    payload.sku = document.querySelector('#modal-sku').value.trim().toUpperCase();
  }

  const method = editingItemId ? 'PATCH' : 'POST';
  const url = editingItemId
    ? `/api/v1/inventory/items/${editingItemId}`
    : '/api/v1/inventory/items';

  try {
    const res = await api(url, {
      method,
      body: JSON.stringify(payload),
    });

    // If opening stock quantity is entered, submit it
    if (!editingItemId) {
      const opQty = Number(document.querySelector('#modal-opening-qty').value || 0);
      const opCost = Number(document.querySelector('#modal-opening-cost').value || 0);
      const createdItem = res.data;
      if (opQty > 0) {
        await api('/api/v1/inventory/opening-stock', {
          method: 'POST',
          body: JSON.stringify({
            item_id: createdItem.id,
            warehouse_id: 1,
            supplier_id: payload.supplier_id,
            quantity: opQty,
            unit_cost: opCost || payload.purchase_cost,
            batch_number: `BAT-${createdItem.sku}-OPEN`,
            notes: 'Initial opening stock count entered',
          }),
        });
      }
    }

    showMessage(editingItemId ? 'Item updated successfully.' : 'Item created successfully.');
    closeItemModal();
    loadInventoryCatalog();
    await cacheActiveItems();
  } catch (err) {
    if (err.details) {
      const details = Object.entries(err.details)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      showMessage(`Validation error: ${details}`, true);
    } else {
      showMessage(err.message, true);
    }
  }
}

// 3. INITIAL STOCK COUNT MODE
let initialCountPage = 1;
let initialCountSearch = '';
const initialCountsMap = new Map();

async function loadInitialCountPage() {
  const params = new URLSearchParams({
    page: String(initialCountPage),
    pageSize: '15',
    search: initialCountSearch,
  });

  try {
    const res = await api(`/api/v1/inventory/items?${params}`);
    const container = document.getElementById('initial-table-container');

    if (res.data.length === 0) {
      container.innerHTML =
        '<p style="padding:10px; background:#f3f4f6; text-align:center;">No items found.</p>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Item Description</th>
            <th>Category</th>
            <th>Current Stock</th>
            <th style="width: 150px;">Physical Count</th>
          </tr>
        </thead>
        <tbody>
    `;

    res.data.forEach((item) => {
      const currentVal = initialCountsMap.has(item.id)
        ? initialCountsMap.get(item.id)
        : item.current_quantity;

      html += `
        <tr>
          <td><strong>${item.sku}</strong></td>
          <td>${item.item_name}</td>
          <td>${item.category_name || item.category || '-'}</td>
          <td>${item.current_quantity} ${item.unit_of_measure || 'pcs'}</td>
          <td>
            <input type="number" min="0" step="any" class="initial-count-input" data-id="${item.id}" value="${currentVal}" style="width: 100px; padding: 4px 8px;">
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Listen to value edits
    container.querySelectorAll('.initial-count-input').forEach((input) => {
      input.addEventListener('input', () => {
        const id = Number(input.dataset.id);
        const val = input.value === '' ? '' : Number(input.value);
        if (val !== '') {
          initialCountsMap.set(id, val);
        } else {
          initialCountsMap.delete(id);
        }
      });
    });

    // Pagination bounds
    document.getElementById('initial-prev-btn').disabled = initialCountPage <= 1;
    document.getElementById('initial-next-btn').disabled =
      initialCountPage >= (res.pagination.totalPages || 1);
    document.getElementById('initial-page-info').textContent =
      `Page ${initialCountPage} of ${res.pagination.totalPages || 1} (Total: ${res.pagination.total})`;
  } catch (err) {
    showMessage('Failed to load initial count grid: ' + err.message, true);
  }
}

async function saveAllInitialCounts() {
  if (initialCountsMap.size === 0) {
    showMessage('No counts entered to save.', true);
    return;
  }

  const items = [];
  for (const [itemId, quantity] of initialCountsMap.entries()) {
    items.push({ itemId, quantity });
  }

  try {
    showMessage('Saving counts...');
    await api('/api/v1/inventory/bulk-save', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
    showMessage('Initial stock counts saved successfully!');
    initialCountsMap.clear();
    loadInitialCountPage();
    await cacheActiveItems();
  } catch (err) {
    showMessage('Failed to save stock counts: ' + err.message, true);
  }
}

// 4. REPORTS TAB WORKFLOWS
function loadReportsData(subreport) {
  if (subreport === 'summary') {
    loadSummaryReport();
  } else if (subreport === 'valuation') {
    loadValuationReport();
  } else if (subreport === 'movements') {
    loadMovementsMetadata();
  }
}

// Low Stock Report (Main Tab)
async function loadLowStockReport() {
  const container = document.getElementById('low-stock-list-container');
  try {
    const res = await api('/api/v1/inventory/reports/low-stock');
    const data = res.data;

    if (data.length === 0) {
      container.innerHTML =
        '<p style="padding:10px; background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; border-radius:6px; font-weight:bold;">All stock levels are optimal. No items are below minimum thresholds.</p>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Item Name</th>
            <th>Current Stock</th>
            <th>Reorder Level</th>
            <th>Unit</th>
          </tr>
        </thead>
        <tbody>
    `;
    data.forEach((row) => {
      html += `
        <tr>
          <td><strong>${row.sku}</strong></td>
          <td>${row.item_name}</td>
          <td style="color:#dc2626; font-weight:bold;">${row.current_quantity}</td>
          <td>${row.reorder_level}</td>
          <td>${row.unit_of_measure || 'pcs'}</td>
        </tr>
      `;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    showMessage(err.message, true);
  }
}

// Inventory Summary Report
async function loadSummaryReport() {
  const container = document.getElementById('summary-report-container');
  try {
    const res = await api('/api/v1/inventory/reports/summary');
    const data = res.data;

    if (data.length === 0) {
      container.innerHTML =
        '<p style="padding:10px; background:#f3f4f6; text-align:center;">No inventory summary data available.</p>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Item Name</th>
            <th>Current Quantity</th>
            <th>Min Stock Warning Level</th>
            <th>Selling Price</th>
          </tr>
        </thead>
        <tbody>
    `;
    data.forEach((row) => {
      html += `
        <tr>
          <td><strong>${row.sku}</strong></td>
          <td>${row.item_name}</td>
          <td>${row.current_quantity}</td>
          <td>${row.reorder_level}</td>
          <td>Rs. ${Number(row.selling_price).toFixed(2)}</td>
        </tr>
      `;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    showMessage(err.message, true);
  }
}

// Valuation Report
async function loadValuationReport() {
  const container = document.querySelector('#valuation-container');
  try {
    const res = await api('/api/v1/inventory/reports/valuation');
    const data = res.data;
    const totals = res.totals;

    if (data.length === 0) {
      container.innerHTML =
        '<p style="padding:10px; background:#f3f4f6; text-align:center;">No valuation data available.</p>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Item Name</th>
            <th>Stock Quantity</th>
            <th>Average Cost</th>
            <th>Total Asset Value</th>
          </tr>
        </thead>
        <tbody>
    `;
    data.forEach((row) => {
      html += `
        <tr>
          <td><strong>${row.sku}</strong></td>
          <td>${row.item_name}</td>
          <td>${row.current_quantity}</td>
          <td>Rs. ${Number(row.average_cost).toFixed(2)}</td>
          <td><strong>Rs. ${Number(row.stock_value).toFixed(2)}</strong></td>
        </tr>
      `;
    });
    html += `
      <tr style="background:#f8fafc; font-weight:bold; font-size:15px; border-top:2px solid #cbd5e1;">
        <td colspan="2" style="text-align:right;">Grand Totals:</td>
        <td>${totals.quantity} units</td>
        <td>-</td>
        <td style="color:#0f766e;">Rs. ${Number(totals.value).toFixed(2)}</td>
      </tr>
    `;
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    showMessage(err.message, true);
  }
}

// Movements Report Metadata Items Dropdown
async function loadMovementsMetadata() {
  const select = document.querySelector('#movement-item-filter');
  if (select.children.length > 1) {
    loadMovementsReport();
    return;
  }

  try {
    const itemsRes = await api('/api/v1/inventory/items?pageSize=1000');
    select.innerHTML = '<option value="">-- All Items --</option>';
    itemsRes.data.forEach((i) => {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.textContent = `${i.item_name} (SKU: ${i.sku})`;
      select.appendChild(opt);
    });
    loadMovementsReport();
  } catch (err) {
    showMessage(err.message, true);
  }
}

// Movements Report Loader
async function loadMovementsReport() {
  const container = document.querySelector('#movements-container');
  const itemId = document.querySelector('#movement-item-filter').value;
  const url = itemId
    ? `/api/v1/inventory/reports/movements?itemId=${itemId}`
    : '/api/v1/inventory/reports/movements';

  try {
    const res = await api(url);
    const data = res.data;

    if (data.length === 0) {
      container.innerHTML =
        '<p style="padding:10px; background:#f3f4f6; text-align:center;">No stock transaction movements logged.</p>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Date & Time</th>
            <th>Item Name</th>
            <th>Previous Quantity</th>
            <th>Adjustment (+/-)</th>
            <th>New Quantity</th>
            <th>Reason</th>
            <th>User</th>
          </tr>
        </thead>
        <tbody>
    `;
    data.forEach((row) => {
      const prevQty =
        row.direction === 'IN'
          ? Number(row.quantity_after) - Number(row.quantity)
          : Number(row.quantity_after) + Number(row.quantity);

      const adjSign = row.direction === 'IN' ? '+' : '-';
      const adjColor = row.direction === 'IN' ? '#16a34a' : '#dc2626';
      const adjText = `${adjSign}${row.quantity}`;

      const userText = row.user_name || 'System';

      html += `
        <tr>
          <td>${new Date(row.created_at).toLocaleString()}</td>
          <td>
            <strong>${row.item_name}</strong>
            <div style="font-size:11px; color:#64748b; margin-top:2px;">SKU: ${row.sku}</div>
          </td>
          <td>${prevQty} ${row.unit_of_measure || 'pcs'}</td>
          <td style="color:${adjColor}; font-weight:bold;">${adjText}</td>
          <td><strong>${row.quantity_after} ${row.unit_of_measure || 'pcs'}</strong></td>
          <td style="font-size:12px; color:#4b5563;">${row.notes || '-'}</td>
          <td>${userText}</td>
        </tr>
      `;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    showMessage(err.message, true);
  }
}

function openQuickAddModal() {
  const modal = document.querySelector('#quick-add-modal');
  const form = document.querySelector('#quick-add-form');
  form.reset();
  modal.style.display = 'flex';
}

function closeQuickAddModal() {
  document.querySelector('#quick-add-modal').style.display = 'none';
}

async function saveQuickInventoryItem() {
  const payload = {
    barcode: null,
    item_name: document.querySelector('#quick-add-name').value,
    category_id: null,
    supplier_id: null,
    hsn_code: null,
    gst_rate: 18,
    unit_of_measure: 'pcs',
    purchase_cost: Number(document.querySelector('#quick-add-cost').value),
    selling_price: Number(document.querySelector('#quick-add-price').value),
    reorder_level: 5,
    is_active: 1,
    sku: '', // Triggers backend auto-generation
  };

  try {
    const res = await api('/api/v1/inventory/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const opQty = Number(document.querySelector('#quick-add-opening-qty').value || 0);
    const createdItem = res.data;
    if (opQty > 0) {
      await api('/api/v1/inventory/opening-stock', {
        method: 'POST',
        body: JSON.stringify({
          item_id: createdItem.id,
          warehouse_id: 1,
          supplier_id: null,
          quantity: opQty,
          unit_cost: payload.purchase_cost,
          batch_number: `BAT-${createdItem.sku}-OPEN`,
          notes: 'Initial opening stock count entered via Quick Add',
        }),
      });
    }

    showMessage('Item created successfully.');
    closeQuickAddModal();
    loadInventoryCatalog();
    await cacheActiveItems();
  } catch (err) {
    if (err.details) {
      const details = Object.entries(err.details)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      showMessage(`Validation error: ${details}`, true);
    } else {
      showMessage(err.message, true);
    }
  }
}

function updateVariance() {
  const newQtyInput = document.getElementById('quick-qty').value;
  const currentQty = Number(document.getElementById('quick-selected-stock').textContent || 0);
  const varianceVal = document.getElementById('quick-variance-val');

  if (!varianceVal) return;

  if (newQtyInput !== '' && document.getElementById('quick-item-id').value) {
    const newQty = Number(newQtyInput);
    const variance = newQty - currentQty;
    varianceVal.textContent = (variance > 0 ? '+' : '') + variance.toFixed(2).replace(/\.00$/, '');
    if (variance > 0) {
      varianceVal.style.color = '#16a34a'; // green
    } else if (variance < 0) {
      varianceVal.style.color = '#dc2626'; // red
    } else {
      varianceVal.style.color = '#64748b'; // gray
    }
  } else {
    varianceVal.textContent = '0';
    varianceVal.style.color = '#64748b';
  }
}
