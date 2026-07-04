const token = sessionStorage.getItem('goldy_auth_token');
const message = document.querySelector('#message');
const tabsContainer = document.querySelector('#purchasing-tabs');
const detailsTabBtn = document.querySelector('#details-tab-btn');

let activeTab = 'list';
let page = 1;
let suppliers = [];
let warehouses = [];
let inventoryItems = [];
let currentViewingReceiptId = null;

// Notification Alert helper
function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.display = 'block';
  message.style.background = isError ? '#fef2f2' : '#f0fdf4';
  message.style.border = isError ? '1px solid #fee2e2' : '1px solid #bbf7d0';
  message.style.color = isError ? '#991b1b' : '#166534';
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    message.style.display = 'none';
  }, 5000);
}

// API wrapper
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

// Initialize page
if (!token) {
  window.location.replace('/index.html');
} else {
  init();
}

async function init() {
  setupTabs();
  setupListeners();
  setupLogout();
  
  // Set default invoice date to today
  document.querySelector('#form-invoice-date').value = new Date().toISOString().slice(0, 10);

  // Fetch initial master lists
  try {
    await Promise.all([
      loadSuppliers(),
      loadWarehouses(),
      loadInventoryItems()
    ]);
    loadReceipts();
  } catch (err) {
    showMessage('Failed to initialize metadata: ' + err.message, true);
  }
}

function setupLogout() {
  const logoutBtn = document.querySelector('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (err) {
        console.error('Logout API failed:', err);
      }
      sessionStorage.removeItem('goldy_auth_token');
      window.location.replace('/index.html');
    });
  }
}

// Tab navigation management
function setupTabs() {
  tabsContainer.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });
}

function switchTab(tab) {
  activeTab = tab;
  tabsContainer.querySelectorAll('button').forEach((btn) => {
    btn.setAttribute('aria-selected', btn.dataset.tab === tab ? 'true' : 'false');
  });

  document.querySelector('#tab-list').style.display = tab === 'list' ? 'block' : 'none';
  document.querySelector('#tab-create').style.display = tab === 'create' ? 'block' : 'none';
  document.querySelector('#tab-details').style.display = tab === 'details' ? 'block' : 'none';

  if (tab === 'list') {
    detailsTabBtn.style.display = 'none';
    loadReceipts();
  } else if (tab === 'create') {
    detailsTabBtn.style.display = 'none';
    resetCreateForm();
  }
}

function setupListeners() {
  // Search
  document.querySelector('#search-btn').addEventListener('click', () => {
    page = 1;
    loadReceipts();
  });

  document.querySelector('#search-query').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      page = 1;
      loadReceipts();
    }
  });

  // Pagination
  document.querySelector('#prev-btn').addEventListener('click', () => {
    if (page > 1) {
      page--;
      loadReceipts();
    }
  });

  document.querySelector('#next-btn').addEventListener('click', () => {
    page++;
    loadReceipts();
  });

  // Supplier dropdown change auto-populates GSTIN
  document.querySelector('#form-supplier-id').addEventListener('change', (e) => {
    const supplierId = Number(e.target.value);
    const supplierGstInput = document.querySelector('#form-supplier-gstin');
    
    if (!supplierId) {
      supplierGstInput.value = '';
      return;
    }

    const supplier = suppliers.find(s => s.id === supplierId);
    supplierGstInput.value = supplier ? (supplier.gstin || 'No GSTIN registered') : '';
  });

  // Add line item row button
  document.querySelector('#add-grid-row-btn').addEventListener('click', () => {
    addGridRow();
  });

  // Cancel and Back buttons
  document.querySelector('#cancel-create-btn').addEventListener('click', () => {
    switchTab('list');
  });

  document.querySelector('#back-to-list-btn').addEventListener('click', () => {
    switchTab('list');
  });

  // Submit invoice import form
  document.querySelector('#invoice-import-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveInvoiceImport();
  });
}

// Master Loaders
async function loadSuppliers() {
  const select = document.querySelector('#form-supplier-id');
  const res = await api('/api/v1/suppliers?pageSize=500');
  suppliers = res.data.filter(s => s.is_active);
  
  suppliers.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} (Phone: ${s.phone || 'N/A'})`;
    select.appendChild(opt);
  });
}

async function loadWarehouses() {
  const select = document.querySelector('#form-warehouse-id');
  const res = await api('/api/v1/warehouses?pageSize=100');
  warehouses = res.data.filter(w => w.is_active);
  
  warehouses.forEach((w) => {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = `${w.name} (${w.code})`;
    select.appendChild(opt);
  });

  // Set first warehouse as default if available
  if (warehouses.length > 0) {
    select.value = warehouses[0].id;
  }
}

async function loadInventoryItems() {
  const res = await api('/api/v1/inventory/items?pageSize=1000');
  inventoryItems = res.data.filter(i => i.is_active);
}

// Load purchase receipts list
async function loadReceipts() {
  const search = document.querySelector('#search-query').value.trim();
  const params = new URLSearchParams({
    page: String(page),
    pageSize: '10',
    search: search
  });

  try {
    const res = await api(`/api/v1/purchases/receipts?${params}`);
    renderReceiptsTable(res.data);
    
    const pageInfo = document.querySelector('#page-info');
    pageInfo.textContent = `Page ${page} of ${res.pagination.totalPages || 1} (Total: ${res.pagination.total})`;
    
    document.querySelector('#prev-btn').disabled = page <= 1;
    document.querySelector('#next-btn').disabled = page >= res.pagination.totalPages;
  } catch (err) {
    showMessage('Failed to load receipts list: ' + err.message, true);
  }
}

function renderReceiptsTable(rows) {
  const container = document.querySelector('#table-container');
  if (rows.length === 0) {
    container.innerHTML = '<p style="padding:15px; background:#f8fafc; border: 1px solid #cbd5e1; border-radius:6px; text-align:center; color:#64748b;">No recorded invoices or receipts found.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Invoice / GRN No</th>
          <th>Invoice Date</th>
          <th>Supplier</th>
          <th>Subtotal</th>
          <th>GST Tax</th>
          <th>Grand Total</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach((row) => {
    const supplierName = row.supplier_name || `ID ${row.supplier_id}`;
    html += `
      <tr>
        <td><strong>${row.receipt_number}</strong></td>
        <td>${row.receipt_date}</td>
        <td>${supplierName}</td>
        <td>Rs. ${Number(row.subtotal).toFixed(2)}</td>
        <td>Rs. ${Number(row.gst_total).toFixed(2)}</td>
        <td><strong>Rs. ${Number(row.grand_total).toFixed(2)}</strong></td>
        <td>
          <button type="button" class="primary view-details-btn" data-id="${row.id}">View Details</button>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;

  container.querySelectorAll('.view-details-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      viewReceiptDetails(Number(btn.dataset.id));
    });
  });
}

// View individual receipt details
async function viewReceiptDetails(id) {
  currentViewingReceiptId = id;
  detailsTabBtn.style.display = 'block';
  switchTab('details');

  try {
    const res = await api(`/api/v1/purchases/receipts/${id}`);
    const receipt = res.data;

    // Fill details header
    document.querySelector('#detail-receipt-no').textContent = receipt.receipt_number;
    document.querySelector('#detail-receipt-date').textContent = receipt.receipt_date;
    
    // Find supplier details
    let supName = `Supplier ID ${receipt.supplier_id}`;
    let supGst = 'N/A';
    try {
      const supRes = await api(`/api/v1/suppliers/${receipt.supplier_id}`);
      supName = supRes.data.name;
      supGst = supRes.data.gstin || 'None';
    } catch (e) {
      console.warn('Could not fetch supplier details');
    }

    document.querySelector('#detail-supplier-name').textContent = supName;
    document.querySelector('#detail-supplier-gstin').textContent = supGst;
    document.querySelector('#detail-notes').textContent = receipt.notes || 'None';
    document.querySelector('#detail-status').textContent = receipt.status;
    document.querySelector('#detail-status').className = `badge ${receipt.status === 'POSTED' ? 'badge-completed' : 'badge-draft'}`;

    // Load warehouse name
    let whName = `Warehouse ID ${receipt.items[0]?.warehouse_id || ''}`;
    if (receipt.items[0]?.warehouse_id) {
      try {
        const whRes = await api(`/api/v1/warehouses/${receipt.items[0].warehouse_id}`);
        whName = whRes.data.name;
      } catch (e) {
        console.warn('Could not fetch warehouse details');
      }
    }
    document.querySelector('#detail-warehouse').textContent = whName;

    // Build items table
    const tbody = document.querySelector('#detail-items-body');
    tbody.innerHTML = '';

    receipt.items.forEach((item, idx) => {
      const qty = Number(item.quantity);
      const cost = Number(item.purchase_cost);
      const taxRate = Number(item.gst_rate);
      const gstAmt = Number(item.gst_amount || 0);
      const lineTotal = Number(item.line_total);

      // Join items metadata to retrieve name/HSN if missing
      let name = item.item_name || `Item ID ${item.item_id}`;
      let hsn = item.hsn_code || '8708';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><strong>${name}</strong> (${item.sku || 'N/A'})</td>
        <td>${hsn}</td>
        <td>${whName}</td>
        <td><code>${item.batch_number || 'N/A'}</code></td>
        <td>${qty}</td>
        <td>Rs. ${cost.toFixed(2)}</td>
        <td>${taxRate}%</td>
        <td>Rs. ${gstAmt.toFixed(2)}</td>
        <td><strong>Rs. ${lineTotal.toFixed(2)}</strong></td>
      `;
      tbody.appendChild(tr);
    });

    // Totals
    document.querySelector('#detail-subtotal').textContent = `Rs. ${Number(receipt.subtotal).toFixed(2)}`;
    document.querySelector('#detail-gst').textContent = `Rs. ${Number(receipt.gst_total).toFixed(2)}`;
    document.querySelector('#detail-grand-total').textContent = `Rs. ${Number(receipt.grand_total).toFixed(2)}`;
  } catch (err) {
    showMessage('Failed to load receipt details: ' + err.message, true);
  }
}

// Add row to items grid in Invoice Import
function addGridRow() {
  const tbody = document.querySelector('#items-grid-body');
  const tr = document.createElement('tr');
  tr.className = 'grid-row';

  // Create spare parts select option HTML
  let optionsHtml = '<option value="">-- Choose Spare Part/Consumable --</option>';
  inventoryItems.forEach((i) => {
    optionsHtml += `<option value="${i.id}">${i.item_name} (${i.sku})</option>`;
  });

  tr.innerHTML = `
    <td>
      <select class="row-item-select" required style="width: 100%;">
        ${optionsHtml}
      </select>
    </td>
    <td>
      <input type="text" class="row-sku" placeholder="SKU" disabled style="font-family: monospace;">
    </td>
    <td>
      <input type="number" class="row-qty" min="1" value="1" required style="text-align: center;">
    </td>
    <td>
      <input type="number" class="row-rate" min="0" step="0.01" placeholder="Cost" required style="text-align: right;">
    </td>
    <td>
      <select class="row-gst-rate" required>
        <option value="0">0%</option>
        <option value="5">5%</option>
        <option value="12">12%</option>
        <option value="18" selected>18%</option>
        <option value="28">28%</option>
      </select>
    </td>
    <td>
      <input type="text" class="row-total" value="Rs. 0.00" disabled style="text-align: right; font-weight: bold; color: #0f766e;">
    </td>
    <td style="text-align: center;">
      <button type="button" class="danger remove-row-btn" style="padding: 6px 10px;">Remove</button>
    </td>
  `;

  tbody.appendChild(tr);

  // Set up listeners on the new row elements
  const select = tr.querySelector('.row-item-select');
  const skuInput = tr.querySelector('.row-sku');
  const qtyInput = tr.querySelector('.row-qty');
  const rateInput = tr.querySelector('.row-rate');
  const gstSelect = tr.querySelector('.row-gst-rate');
  const removeBtn = tr.querySelector('.remove-row-btn');

  // Spare part select selection change loader
  select.addEventListener('change', () => {
    const itemId = Number(select.value);
    if (!itemId) {
      skuInput.value = '';
      rateInput.value = '';
      recalculateRowTotal(tr);
      return;
    }

    const item = inventoryItems.find(i => i.id === itemId);
    if (item) {
      skuInput.value = item.sku;
      rateInput.value = item.purchase_cost || '';
      gstSelect.value = item.gst_rate !== undefined ? String(Math.round(item.gst_rate)) : '18';
      recalculateRowTotal(tr);
    }
  });

  // Input value changes trigger row recalculations
  qtyInput.addEventListener('input', () => recalculateRowTotal(tr));
  rateInput.addEventListener('input', () => recalculateRowTotal(tr));
  gstSelect.addEventListener('change', () => recalculateRowTotal(tr));

  // Row removal trigger
  removeBtn.addEventListener('click', () => {
    tr.remove();
    recalculateAllTotals();
  });

  // Focus select search dropdown
  select.focus();
}

function recalculateRowTotal(row) {
  const qty = Number(row.querySelector('.row-qty').value) || 0;
  const rate = Number(row.querySelector('.row-rate').value) || 0;
  const gstRate = Number(row.querySelector('.row-gst-rate').value) || 0;
  
  const taxable = qty * rate;
  const tax = (taxable * gstRate) / 100;
  const total = taxable + tax;

  row.querySelector('.row-total').value = `Rs. ${total.toFixed(2)}`;
  
  recalculateAllTotals();
}

function recalculateAllTotals() {
  let subtotal = 0;
  let gstTotal = 0;

  document.querySelectorAll('.grid-row').forEach((row) => {
    const qty = Number(row.querySelector('.row-qty').value) || 0;
    const rate = Number(row.querySelector('.row-rate').value) || 0;
    const gstRate = Number(row.querySelector('.row-gst-rate').value) || 0;

    const lineTaxable = qty * rate;
    const lineTax = (lineTaxable * gstRate) / 100;

    subtotal += lineTaxable;
    gstTotal += lineTax;
  });

  const grandTotal = subtotal + gstTotal;

  document.querySelector('#summary-subtotal').textContent = `Rs. ${subtotal.toFixed(2)}`;
  document.querySelector('#summary-gst').textContent = `Rs. ${gstTotal.toFixed(2)}`;
  document.querySelector('#summary-grand-total').textContent = `Rs. ${grandTotal.toFixed(2)}`;
}

// Reset create invoice form and empty row grids
function resetCreateForm() {
  document.querySelector('#invoice-import-form').reset();
  document.querySelector('#items-grid-body').innerHTML = '';
  document.querySelector('#form-invoice-date').value = new Date().toISOString().slice(0, 10);
  document.querySelector('#form-supplier-gstin').value = '';
  
  // Prepopulate with one empty row for user ease
  addGridRow();
  recalculateAllTotals();
}

// Submit POST request to save invoice import
async function saveInvoiceImport() {
  const supplierId = Number(document.querySelector('#form-supplier-id').value);
  const invoiceNo = document.querySelector('#form-invoice-number').value.trim();
  const invoiceDate = document.querySelector('#form-invoice-date').value;
  const warehouseId = Number(document.querySelector('#form-warehouse-id').value);
  const notes = document.querySelector('#form-notes').value.trim() || 'Supplier Invoice Import';

  const rows = document.querySelectorAll('.grid-row');
  if (rows.length === 0) {
    showMessage('You must add at least one line item to record the receipt.', true);
    return;
  }

  const items = [];
  let validationError = null;

  rows.forEach((row, index) => {
    const select = row.querySelector('.row-item-select');
    const itemId = Number(select.value);
    const qty = Number(row.querySelector('.row-qty').value);
    const rate = Number(row.querySelector('.row-rate').value);
    const gstRate = Number(row.querySelector('.row-gst-rate').value);
    const sku = row.querySelector('.row-sku').value;

    if (!itemId) {
      validationError = `Row #${index + 1}: Select an inventory item.`;
      return;
    }
    if (qty <= 0) {
      validationError = `Row #${index + 1}: Quantity must be greater than zero.`;
      return;
    }
    if (rate < 0) {
      validationError = `Row #${index + 1}: Purchase cost cannot be negative.`;
      return;
    }

    // Default markup of 35% on purchase cost for selling price
    const sellingPrice = Math.round(rate * 1.35);

    items.push({
      item_id: itemId,
      warehouse_id: warehouseId,
      batch_number: `BAT-${invoiceNo}-${sku}`,
      quantity: qty,
      purchase_cost: rate,
      selling_price: sellingPrice,
      gst_rate: gstRate
    });
  });

  if (validationError) {
    showMessage(validationError, true);
    return;
  }

  const payload = {
    supplier_id: supplierId,
    purchase_order_id: null,
    receipt_number: invoiceNo,
    receipt_date: invoiceDate,
    notes: notes,
    items: items
  };

  const saveBtn = document.querySelector('#save-invoice-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving & Seeding Batches...';

  try {
    const res = await api('/api/v1/purchases/receipts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showMessage(`Invoice ${invoiceNo} recorded successfully! Stock levels increased.`);
    
    // Refresh inventory items metadata list in background so job cards/dropdown reflect new stocks
    loadInventoryItems().catch(console.error);

    // Navigate back to list
    switchTab('list');
  } catch (err) {
    showMessage('Failed to import supplier invoice: ' + err.message, true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save & Update Stock';
  }
}
