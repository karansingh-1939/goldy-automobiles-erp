const token = sessionStorage.getItem('goldy_auth_token');
const message = document.querySelector('#message');
const tabsContainer = document.querySelector('#job-card-tabs');
const detailsTabBtn = document.querySelector('#details-tab-btn');

let editingJobCardId = null;
let page = 1;

// Alert / Message Helper
function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? '#dc2626' : '#15803d';
}

// API Call Helper
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

function init() {
  setupTabs();
  loadJobCards();
  setupListeners();
  setupLogout();
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

// Tab Switching
function setupTabs() {
  tabsContainer.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  tabsContainer.querySelectorAll('button').forEach((btn) => {
    btn.setAttribute('aria-selected', btn.dataset.tab === tab ? 'true' : 'false');
  });

  document.querySelector('#tab-list').style.display = tab === 'list' ? 'block' : 'none';
  document.querySelector('#tab-create').style.display = tab === 'create' ? 'block' : 'none';
  document.querySelector('#tab-details').style.display = tab === 'details' ? 'block' : 'none';

  if (tab === 'create') {
    document.querySelector('#job-card-form').reset();
    document.querySelector('#registration-lookup-status').style.display = 'none';
    document.querySelector('#customer-info-panel').style.display = 'none';
    document.querySelector('#vehicle-history-panel').style.display = 'none';
    loadTechniciansDropdown();
    loadRecentVisits();

    // Toggle quick entry elements reset
    document.querySelector('#quick-entry-toggle').checked = false;
    triggerQuickEntryUI(false);
  }
}

// SETUP LISTENERS
function setupListeners() {
  // Search & Filter
  document.querySelector('#search-btn').addEventListener('click', () => {
    page = 1;
    loadJobCards();
  });

  document.querySelector('#clear-btn').addEventListener('click', () => {
    document.querySelector('#search-query').value = '';
    document.querySelector('#filter-status').value = '';
    document.querySelector('#filter-from-date').value = '';
    document.querySelector('#filter-to-date').value = '';
    document.querySelector('#filter-exact-match').checked = true;

    // Reset quick filter buttons style
    document.querySelectorAll('.quick-filter-btn').forEach((btn) => {
      if (btn.dataset.range === 'all') {
        btn.style.background = '#f1f5f9';
        btn.style.color = '#172033';
        btn.style.borderColor = '#c5ceda';
      } else {
        btn.style.background = '#ffffff';
        btn.style.color = '#172033';
        btn.style.borderColor = '#c5ceda';
      }
    });

    page = 1;
    loadJobCards();
  });

  // Automatically trigger search on status/date/exact-match changes for fluid UX
  document.querySelector('#filter-exact-match').addEventListener('change', () => {
    page = 1;
    loadJobCards();
  });
  document.querySelector('#filter-status').addEventListener('change', () => {
    page = 1;
    loadJobCards();
  });
  document.querySelector('#filter-from-date').addEventListener('change', () => {
    page = 1;
    loadJobCards();
  });
  document.querySelector('#filter-to-date').addEventListener('change', () => {
    page = 1;
    loadJobCards();
  });

  // Previous Visits Click Redirect
  const prevVisitsBadge = document.querySelector('#detail-previous-visits-badge');
  if (prevVisitsBadge) {
    prevVisitsBadge.addEventListener('click', () => {
      const phone = prevVisitsBadge.dataset.phone;
      const reg = prevVisitsBadge.dataset.reg;

      // Prioritize registration number for historical search
      const searchVal = reg || phone || '';
      document.querySelector('#search-query').value = searchVal;

      // Reset other filters
      document.querySelector('#filter-status').value = '';
      document.querySelector('#filter-from-date').value = '';
      document.querySelector('#filter-to-date').value = '';
      document.querySelector('#filter-exact-match').checked = true;

      page = 1;
      switchTab('list');
      loadJobCards();
    });
  }

  // Press enter in search box
  document.querySelector('#search-query').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      page = 1;
      loadJobCards();
    }
  });

  // Quick date filters
  document.querySelectorAll('.quick-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const range = btn.dataset.range;
      const today = new Date();
      const formatDate = (date) => {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };

      let from = '';
      let to = '';

      switch (range) {
        case 'today':
          from = formatDate(today);
          to = formatDate(today);
          break;
        case 'yesterday': {
          const yesterday = new Date(today);
          yesterday.setDate(today.getDate() - 1);
          from = formatDate(yesterday);
          to = formatDate(yesterday);
          break;
        }
        case 'last7': {
          const last7 = new Date(today);
          last7.setDate(today.getDate() - 6);
          from = formatDate(last7);
          to = formatDate(today);
          break;
        }
        case 'thisMonth': {
          const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
          const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          from = formatDate(firstDay);
          to = formatDate(lastDay);
          break;
        }
        case 'lastMonth': {
          const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
          from = formatDate(firstDay);
          to = formatDate(lastDay);
          break;
        }
        case 'all':
        default:
          from = '';
          to = '';
          break;
      }

      document.querySelector('#filter-from-date').value = from;
      document.querySelector('#filter-to-date').value = to;

      document.querySelectorAll('.quick-filter-btn').forEach((b) => {
        if (b.dataset.range === range) {
          b.style.background = '#0f766e';
          b.style.color = '#ffffff';
          b.style.borderColor = '#0f766e';
        } else {
          b.style.background = b.dataset.range === 'all' ? '#f1f5f9' : '#ffffff';
          b.style.color = '#172033';
          b.style.borderColor = '#c5ceda';
        }
      });

      page = 1;
      loadJobCards();
    });
  });

  document.querySelector('#prev-btn').addEventListener('click', () => {
    if (page > 1) {
      page--;
      loadJobCards();
    }
  });

  document.querySelector('#next-btn').addEventListener('click', () => {
    page++;
    loadJobCards();
  });

  // Print Job Card Action
  document.querySelector('#print-job-card-btn').addEventListener('click', () => {
    if (editingJobCardId) {
      window.open(`/print-job-card.html?id=${editingJobCardId}`, '_blank');
    }
  });

  // Reset Create Form
  document.querySelector('#reset-create-btn').addEventListener('click', () => {
    document.querySelector('#job-card-form').reset();
    document.querySelector('#registration-lookup-status').style.display = 'none';
    document.querySelector('#customer-info-panel').style.display = 'none';
    document.querySelector('#vehicle-history-panel').style.display = 'none';
    document.querySelector('#quick-entry-toggle').checked = false;
    triggerQuickEntryUI(false);
  });

  // Quick Entry Mode Toggle Listener
  document.querySelector('#quick-entry-toggle').addEventListener('change', (e) => {
    triggerQuickEntryUI(e.target.checked);
  });

  // Setup Autocomplete
  setupAutocomplete(
    'form-registration-number',
    'reg-suggestions',
    '/api/v1/autocomplete/vehicles?q=',
    (vehicle) => {
      selectCustomer({
        id: vehicle.customer_id,
        name: vehicle.customer_name,
        phone: vehicle.customer_phone,
        address: vehicle.customer_address,
        city: vehicle.customer_city,
        notes: vehicle.customer_notes,
      });
      selectVehicle(vehicle);
    },
  );

  setupAutocomplete(
    'form-phone',
    'phone-suggestions',
    '/api/v1/autocomplete/customers?q=',
    (customer) => {
      selectCustomer(customer);
    },
  );

  setupAutocomplete(
    'form-customer-name',
    'name-suggestions',
    '/api/v1/autocomplete/customers?q=',
    (customer) => {
      selectCustomer(customer);
    },
  );

  // Registration Number blur/change lookup check
  const regInput = document.querySelector('#form-registration-number');
  const handleRegCheck = () => {
    setTimeout(handleRegistrationLookup, 250); // slight delay to allow suggestion click
  };
  regInput.addEventListener('change', handleRegCheck);

  // Create Job Card Submit
  document.querySelector('#create-card-btn').addEventListener('click', async () => {
    const form = document.querySelector('#job-card-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const payload = {
      registration_number: formData.get('registration_number'),
      customer_name: formData.get('customer_name'),
      phone: formData.get('phone') || null,
      model: formData.get('model') || null,
      fuel_type: formData.get('fuel_type') || null,
      chassis_number: formData.get('chassis_number') || null,
      engine_number: formData.get('engine_number') || null,
      address: formData.get('address') || null,
      city: formData.get('city') || null,
      notes: formData.get('notes') || null,
      odometer_reading: Number(formData.get('odometer_reading')),
      complaint: formData.get('complaint'),
      fuel_level: formData.get('fuel_level') || null,
      promised_delivery_at: formData.get('promised_delivery_at') || null,
      battery_brand: formData.get('battery_brand') || null,
      toolkit_present: formData.get('toolkit_present') === 'on',
      spare_wheel_present: formData.get('spare_wheel_present') === 'on',
      jack_present: formData.get('jack_present') === 'on',
      stereo_present: formData.get('stereo_present') === 'on',
    };

    if (formData.get('technician_id')) {
      payload.technician_id = Number(formData.get('technician_id'));
    }

    try {
      const res = await api('/api/v1/job-cards', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showMessage('Job Card created successfully.');
      form.reset();
      document.querySelector('#registration-lookup-status').style.display = 'none';
      document.querySelector('#customer-info-panel').style.display = 'none';
      document.querySelector('#vehicle-history-panel').style.display = 'none';
      // Navigate to details
      viewDetails(res.data.id);
    } catch (err) {
      if (err.details) {
        const detailsStr = Object.entries(err.details)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        showMessage(`Creation failed: ${detailsStr}`, true);
      } else {
        showMessage(err.message, true);
      }
    }
  });

  // Add Part Form Submission
  const addPartForm = document.querySelector('#add-part-form');
  addPartForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const batchSelect = document.querySelector('#part-batch-id');
    const selectedOpt = batchSelect.options[batchSelect.selectedIndex];
    const availableQty = selectedOpt ? Number(selectedOpt.dataset.qty) : 0;
    const enteredQty = Number(document.querySelector('#part-quantity').value);

    if (enteredQty > availableQty) {
      showMessage(
        `Cannot add part: stock cannot go negative. Remaining stock is ${availableQty}.`,
        true,
      );
      return;
    }

    const payload = {
      inventory_item_id: Number(document.querySelector('#part-item-id').value),
      batch_id: Number(document.querySelector('#part-batch-id').value),
      quantity: enteredQty,
      selling_price: Number(document.querySelector('#part-price').value),
      gst_rate: Number(document.querySelector('#part-gst-rate').value),
    };

    try {
      await api(`/api/v1/job-cards/${editingJobCardId}/parts`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showMessage('Part added successfully.');
      addPartForm.reset();
      document.querySelector('#part-batch-id').disabled = true;
      document.querySelector('#stock-indicator-message').textContent = '';
      loadJobCardDetails(editingJobCardId);
    } catch (err) {
      showMessage(err.message, true);
    }
  });

  // Add Labour Form Submission
  const addLabourForm = document.querySelector('#add-labour-form');
  addLabourForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const descInput = document.querySelector('#labour-description');
    const isOutside = document.querySelector('#labour-is-outside').checked;
    const description = isOutside
      ? `[Outside Job] ${descInput.value.trim()}`
      : descInput.value.trim();

    const payload = {
      description: description,
      labour_charge: Number(document.querySelector('#labour-charge').value),
      gst_rate: Number(document.querySelector('#labour-gst-rate').value),
    };

    try {
      await api(`/api/v1/job-cards/${editingJobCardId}/labour`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showMessage('Labour activity added successfully.');
      addLabourForm.reset();
      loadJobCardDetails(editingJobCardId);
    } catch (err) {
      showMessage(err.message, true);
    }
  });

  // Dynamic Part/Batch select listeners
  const partItemSelect = document.querySelector('#part-item-id');
  const partBatchSelect = document.querySelector('#part-batch-id');
  const stockIndicator = document.querySelector('#stock-indicator-message');

  partItemSelect.addEventListener('change', async () => {
    const itemId = partItemSelect.value;
    partBatchSelect.innerHTML = '<option value="">-- Select Batch --</option>';
    stockIndicator.textContent = '';
    partBatchSelect.disabled = true;

    if (!itemId) return;

    try {
      // Load batches and filter by item_id in client
      const res = await api(`/api/v1/batches?pageSize=1000`);
      const batches = res.data.filter(
        (b) => Number(b.item_id) === Number(itemId) && b.quantity > 0,
      );

      if (batches.length === 0) {
        partBatchSelect.innerHTML = '<option value="">No stock batches available</option>';
      } else {
        batches.forEach((b) => {
          const opt = document.createElement('option');
          opt.value = b.id;
          opt.dataset.qty = b.quantity;
          opt.dataset.wh = b.warehouse_name || `WH ${b.warehouse_id}`;
          opt.dataset.cost = b.selling_price || 0;
          opt.textContent = `${b.batch_number} (${b.quantity} available in ${b.warehouse_name || `Godown ${b.warehouse_id}`})`;
          partBatchSelect.appendChild(opt);
        });
        partBatchSelect.disabled = false;
      }
    } catch (err) {
      showMessage(err.message, true);
    }
  });

  partBatchSelect.addEventListener('change', () => {
    const opt = partBatchSelect.options[partBatchSelect.selectedIndex];
    if (opt && opt.value) {
      const qty = Number(opt.dataset.qty);
      const wh = opt.dataset.wh;
      const cost = opt.dataset.cost;

      stockIndicator.textContent = `${qty} units available in ${wh}`;
      if (qty <= 0) {
        stockIndicator.className = 'stock-indicator stock-none';
      } else if (qty < 5) {
        stockIndicator.className = 'stock-indicator stock-low';
      } else {
        stockIndicator.className = 'stock-indicator stock-ok';
      }

      document.querySelector('#part-price').value = cost;
    } else {
      stockIndicator.textContent = '';
    }
  });
}

// LOAD LIST OF JOB CARDS
async function loadJobCards() {
  const searchQuery = document.querySelector('#search-query').value.trim();
  const status = document.querySelector('#filter-status').value;
  const fromDate = document.querySelector('#filter-from-date').value;
  const toDate = document.querySelector('#filter-to-date').value;
  const exactMatchOnly = document.querySelector('#filter-exact-match').checked;

  const params = new URLSearchParams({
    page: String(page),
    pageSize: '10',
    search: searchQuery,
    status: status,
    fromDate: fromDate,
    toDate: toDate,
    exactMatchOnly: String(exactMatchOnly),
  });

  try {
    const res = await api(`/api/v1/job-cards?${params}`);
    const cards = res.data;

    renderJobCardsTable(cards);

    // Update filter summary text
    const summary = document.querySelector('#filter-summary');
    if (res.pagination.total === 0) {
      summary.textContent = 'No matching Job Cards found';
    } else if (res.pagination.matchType) {
      let label = 'Customer/Vehicle';
      if (res.pagination.matchType === 'Registration Number') label = 'Vehicle';
      else if (res.pagination.matchType === 'Phone Number') label = 'Customer Phone';
      else if (res.pagination.matchType === 'Job Card Number') label = 'Job Card';
      else if (res.pagination.matchType === 'Customer Name') label = 'Customer Name';
      summary.textContent = `Found ${res.pagination.total} Job Card${res.pagination.total === 1 ? '' : 's'} for ${label} ${res.pagination.matchValue}`;
    } else if (searchQuery) {
      summary.textContent = `Found ${res.pagination.total} Job Card${res.pagination.total === 1 ? '' : 's'}`;
    } else if (status || fromDate || toDate) {
      summary.textContent = `Showing ${res.pagination.total} of ${res.pagination.unfilteredTotal} Job Cards`;
    } else {
      summary.textContent = `Total Job Cards: ${res.pagination.unfilteredTotal}`;
    }

    document.querySelector('#page-info').textContent =
      `Page ${page} of ${res.pagination.totalPages || 1} (Total: ${res.pagination.total})`;

    if (cards.length === 1 && searchQuery) {
      viewDetails(cards[0].id);
    }
  } catch (err) {
    showMessage(err.message, true);
  }
}

function renderJobCardsTable(rows) {
  const container = document.querySelector('#table-container');
  if (rows.length === 0) {
    container.innerHTML =
      '<p style="padding:10px; background:#f3f4f6; text-align:center;">No Job Cards found.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Job Card No</th>
          <th>Customer</th>
          <th>Vehicle Reg</th>
          <th>Status</th>
          <th>Odometer</th>
          <th>Opened At</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach((row) => {
    const isSelected = Number(row.id) === Number(editingJobCardId) || rows.length === 1;
    const rowClass = isSelected ? 'style="background-color: #f0fdfa;"' : '';
    const statusClass = `badge badge-${row.status.toLowerCase()}`;
    html += `
      <tr ${rowClass} id="job-card-row-${row.id}">
        <td><strong>${row.job_card_number}</strong></td>
        <td>${row.customer_name || `Cust ID ${row.customer_id}`}</td>
        <td>${row.registration_number || `Vehicle ID ${row.vehicle_id}`}</td>
        <td><span class="${statusClass}">${row.status}</span></td>
        <td>${row.odometer_reading} km</td>
        <td>${new Date(row.opened_at).toLocaleString()}</td>
        <td>
          <button type="button" class="primary view-details-btn" data-id="${row.id}">Manage</button>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;

  container.querySelectorAll('.view-details-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      viewDetails(btn.dataset.id);
    });
  });

  const highlightId = editingJobCardId || (rows.length === 1 ? rows[0].id : null);
  if (highlightId) {
    const activeRow = container.querySelector(`#job-card-row-${highlightId}`);
    if (activeRow) {
      setTimeout(() => {
        activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }
}

// VIEW DETAILS PORTAL
function viewDetails(id) {
  editingJobCardId = id;
  detailsTabBtn.style.display = 'block';
  switchTab('details');
  loadJobCardDetails(id);
}

async function loadJobCardDetails(id) {
  try {
    const res = await api(`/api/v1/job-cards/${id}`);
    const jc = res.data;

    const prevVisitsBadge = document.querySelector('#detail-previous-visits-badge');
    if (prevVisitsBadge) {
      if (jc.previous_visits_count > 0) {
        prevVisitsBadge.style.display = 'inline-block';
        document.querySelector('#lbl-previous-visits-count').textContent = jc.previous_visits_count;
        prevVisitsBadge.dataset.phone = jc.customer_phone || '';
        prevVisitsBadge.dataset.reg = jc.registration_number || '';
      } else {
        prevVisitsBadge.style.display = 'none';
      }
    }

    document.querySelector('#detail-job-number').textContent = `Job Card ${jc.job_card_number}`;
    const badge = document.querySelector('#detail-job-status-badge');
    badge.textContent = jc.status;
    badge.className = `badge badge-${jc.status.toLowerCase()}`;

    document.querySelector('#detail-customer-name').textContent =
      jc.customer_name || `ID ${jc.customer_id}`;
    document.querySelector('#detail-vehicle-reg').textContent =
      jc.registration_number || `ID ${jc.vehicle_id}`;
    document.querySelector('#detail-odometer').textContent = jc.odometer_reading;
    document.querySelector('#detail-assigned-mechanic').textContent =
      jc.assigned_mechanic_name || 'Unassigned';
    document.querySelector('#detail-engine-number').textContent = jc.engine_number || '-';
    document.querySelector('#detail-chassis-number').textContent = jc.chassis_number || '-';
    document.querySelector('#detail-fuel-level').textContent = jc.fuel_level || '-';
    document.querySelector('#detail-promised-delivery').textContent = jc.promised_delivery_at
      ? new Date(jc.promised_delivery_at).toLocaleString()
      : '-';
    document.querySelector('#detail-battery-brand').textContent = jc.battery_brand || '-';
    document.querySelector('#detail-complaint').textContent = jc.complaint || 'No complaint notes.';

    const checklistItems = [];
    if (jc.toolkit_present) checklistItems.push('Toolkit');
    if (jc.spare_wheel_present) checklistItems.push('Spare Wheel');
    if (jc.jack_present) checklistItems.push('Jack');
    if (jc.stereo_present) checklistItems.push('Stereo');
    document.querySelector('#detail-checklist').textContent =
      checklistItems.length > 0 ? checklistItems.join(', ') : 'None';

    // Populate Lists & Totals
    const partsConsumption = (jc.parts || []).filter((p) => p.item_type === 'PART');
    const lubricants = (jc.parts || []).filter((p) => p.item_type === 'LUBRICANT');
    const standardLabour = (jc.labour || []).filter(
      (l) => !String(l.description).startsWith('[Outside Job]'),
    );
    const outsideJobs = (jc.labour || []).filter((l) =>
      String(l.description).startsWith('[Outside Job]'),
    );

    renderPartsTable(partsConsumption, '#parts-list-container', 'No parts consumed yet.');
    renderPartsTable(lubricants, '#lubricants-list-container', 'No lubricants consumed yet.');
    renderLabourTable(standardLabour, '#labour-list-container', 'No standard labour added yet.');
    renderLabourTable(outsideJobs, '#outside-jobs-list-container', 'No outside jobs added yet.');
    calculateTotals(jc.parts, jc.labour);

    // Populate Add-Parts Item selector
    loadInventoryItemsDropdown();

    // Controls Visibility based on Status
    const controls = document.querySelector('#workspace-controls-container');
    const finalizeContainer = document.querySelector('#finalize-action-container');

    if (jc.status === 'DRAFT' || jc.status === 'OPEN' || jc.status === 'IN_PROGRESS') {
      controls.style.display = 'block';
      finalizeContainer.innerHTML =
        '<button id="finalize-job-btn" class="primary" style="font-size:16px; padding: 12px 18px;">Finalize Repair & Invoice</button>';
      document
        .querySelector('#finalize-job-btn')
        .addEventListener('click', () => finalizeJobCard(jc));
    } else {
      controls.style.display = 'none';
      if (jc.status === 'COMPLETED' && jc.invoice) {
        finalizeContainer.innerHTML = `<a href="/invoices.html?id=${jc.invoice.id}" class="primary" style="display:inline-block; font-weight:700; text-decoration:none; padding:10px 14px; border-radius:6px;">View Linked Invoice (${jc.invoice.invoice_number})</a>`;
      } else {
        finalizeContainer.innerHTML = '';
      }
    }
  } catch (err) {
    showMessage(err.message, true);
  }
}

function renderPartsTable(parts, containerId, emptyMessage) {
  const container = document.querySelector(containerId);
  if (!parts || parts.length === 0) {
    container.innerHTML = `<p style="font-size:13px; color:#4b5563; margin:0;">${emptyMessage}</p>`;
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Part Description</th>
          <th>Qty</th>
          <th>Price</th>
          <th>GST %</th>
          <th>Line Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  parts.forEach((p) => {
    html += `
      <tr>
        <td>${p.description} (${p.sku})</td>
        <td>${p.quantity}</td>
        <td>Rs. ${Number(p.selling_price).toFixed(2)}</td>
        <td>${p.gst_rate}%</td>
        <td>Rs. ${Number(p.line_total).toFixed(2)}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderLabourTable(labour, containerId, emptyMessage) {
  const container = document.querySelector(containerId);
  if (!labour || labour.length === 0) {
    container.innerHTML = `<p style="font-size:13px; color:#4b5563; margin:0;">${emptyMessage}</p>`;
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Labour Description</th>
          <th>Rate</th>
          <th>GST %</th>
          <th>Line Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  labour.forEach((l) => {
    const charge = Number(l.labour_charge);
    const tax = charge * (Number(l.gst_rate) / 100);
    const total = charge + tax;
    const displayDesc = String(l.description).startsWith('[Outside Job]')
      ? String(l.description).replace(/^\[Outside Job\]\s*/, '')
      : l.description;

    html += `
      <tr>
        <td>${displayDesc}</td>
        <td>Rs. ${charge.toFixed(2)}</td>
        <td>${l.gst_rate}%</td>
        <td>Rs. ${total.toFixed(2)}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function calculateTotals(parts, labour) {
  let partsTotal = 0;
  let lubricantsTotal = 0;
  let labourTotal = 0;
  let outsideJobTotal = 0;

  (parts || []).forEach((p) => {
    const lineTotal = Number(p.line_total);
    if (p.item_type === 'LUBRICANT') {
      lubricantsTotal += lineTotal;
    } else {
      partsTotal += lineTotal;
    }
  });

  (labour || []).forEach((l) => {
    const charge = Number(l.labour_charge);
    const tax = charge * (Number(l.gst_rate) / 100);
    const lineTotal = charge + tax;

    if (String(l.description).startsWith('[Outside Job]')) {
      outsideJobTotal += lineTotal;
    } else {
      labourTotal += lineTotal;
    }
  });

  document.querySelector('#sum-parts-total').textContent = `Rs. ${partsTotal.toFixed(2)}`;
  document.querySelector('#sum-lubricants-total').textContent = `Rs. ${lubricantsTotal.toFixed(2)}`;
  document.querySelector('#sum-labour-total').textContent = `Rs. ${labourTotal.toFixed(2)}`;
  document.querySelector('#sum-outside-job-total').textContent =
    `Rs. ${outsideJobTotal.toFixed(2)}`;
  document.querySelector('#sum-grand-total').textContent =
    `Rs. ${(partsTotal + lubricantsTotal + labourTotal + outsideJobTotal).toFixed(2)}`;
}

// DROPDOWN LOADERS
async function loadTechniciansDropdown() {
  const select = document.querySelector('#form-assigned-to');
  if (select.children.length > 1) return; // already loaded

  try {
    const res = await api('/api/v1/technicians?pageSize=500&activeOnly=true');
    res.data.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.full_name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load technicians:', err);
  }
}

async function loadInventoryItemsDropdown() {
  const select = document.querySelector('#part-item-id');
  if (select.children.length > 1) return; // already loaded

  try {
    const res = await api('/api/v1/inventory/items?pageSize=500');
    res.data.forEach((i) => {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.textContent = `${i.item_name} (SKU: ${i.sku} | Qty: ${i.current_quantity} | Price: Rs. ${Number(i.selling_price).toFixed(2)})`;
      select.appendChild(opt);
    });
  } catch (err) {
    showMessage(err.message, true);
  }
}

// FINALIZE WORKFLOW
async function finalizeJobCard(jc) {
  if (jc.parts.length === 0 && jc.labour.length === 0) {
    alert('Cannot finalize an empty job card. Add at least one part or labour charge.');
    return;
  }

  let confirmText = `Are you sure you want to finalize Job Card ${jc.job_card_number}?\n\n`;
  confirmText += `Consumables Stock Deduction:\n`;
  jc.parts.forEach((p) => {
    confirmText += `- ${p.description}: ${p.quantity} units\n`;
  });

  if (!window.confirm(confirmText)) {
    return;
  }

  try {
    await api(`/api/v1/job-cards/${jc.id}/finalize`, {
      method: 'POST',
    });
    showMessage('Job Card finalized successfully. Invoice generated.');
    loadJobCardDetails(jc.id);
  } catch (err) {
    showMessage(err.message, true);
  }
}

// ==========================================
// AUTOCOMPLETE & WORKSHOP CRM IMPLEMENTATION
// ==========================================

function setupAutocomplete(inputId, dropdownId, apiEndpoint, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  let activeIndex = -1;
  let currentSuggestions = [];
  let timeout = null;

  input.addEventListener('input', () => {
    clearTimeout(timeout);
    const q = input.value.trim();

    // Performance trigger rules: 3 digits phone, 3 chars reg, 2 chars name
    const minLength = inputId === 'form-customer-name' ? 2 : 3;
    if (q.length < minLength) {
      dropdown.style.display = 'none';
      return;
    }

    timeout = setTimeout(async () => {
      try {
        const res = await api(`${apiEndpoint}${encodeURIComponent(q)}`);
        currentSuggestions = res.data || [];
        renderSuggestions();
      } catch (err) {
        console.error('Autocomplete query failed:', err);
      }
    }, 200); // 200ms debounce (within 300ms requirement)
  });

  function renderSuggestions() {
    dropdown.innerHTML = '';
    if (currentSuggestions.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    activeIndex = -1;
    currentSuggestions.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'autocomplete-item';

      if (inputId === 'form-registration-number') {
        div.innerHTML = `<span><strong>${item.registration_number}</strong> (${item.make} ${item.model})</span><span style="color: #64748b; font-size: 11px;">${item.customer_name}</span>`;
      } else if (inputId === 'form-phone') {
        div.innerHTML = `<span><strong>${item.phone}</strong> - ${item.name}</span>`;
      } else {
        div.innerHTML = `<span><strong>${item.name}</strong> (${item.phone || 'No Phone'})</span>`;
      }

      div.addEventListener('click', () => {
        selectItem(item);
      });
      dropdown.appendChild(div);
    });
    dropdown.style.display = 'block';
  }

  function selectItem(item) {
    onSelect(item);
    dropdown.style.display = 'none';
  }

  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length === 0) return;
      activeIndex = (activeIndex + 1) % items.length;
      updateHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length === 0) return;
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateHighlight(items);
    } else if (e.key === 'Enter') {
      if (activeIndex > -1 && activeIndex < currentSuggestions.length) {
        e.preventDefault();
        selectItem(currentSuggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
    }
  });

  function updateHighlight(items) {
    items.forEach((item, index) => {
      if (index === activeIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (e.target !== input && e.target !== dropdown) {
      dropdown.style.display = 'none';
    }
  });
}

// Prefill selected vehicle details & load history panel
async function selectVehicle(vehicle) {
  document.querySelector('#form-registration-number').value = vehicle.registration_number || '';
  document.querySelector('#form-model').value = vehicle.model || '';
  document.querySelector('#form-fuel-type').value = vehicle.fuel_type || '';
  document.querySelector('#form-chassis-number').value = vehicle.chassis_number || '';
  document.querySelector('#form-engine-number').value = vehicle.engine_number || '';

  const lookupStatus = document.querySelector('#registration-lookup-status');
  lookupStatus.textContent = 'Existing Vehicle - Loaded Details';
  lookupStatus.style.color = '#15803d';
  lookupStatus.style.background = '#f0fdf4';
  lookupStatus.style.border = '1px solid #bbf7d0';
  lookupStatus.style.display = 'block';

  try {
    const res = await api(
      `/api/v1/vehicles/lookup?registration_number=${encodeURIComponent(vehicle.registration_number)}`,
    );
    if (res.data && res.data.vehicleStats) {
      const stats = res.data.vehicleStats;
      document.querySelector('#info-veh-total-job-cards').textContent = stats.totalJobCards;
      document.querySelector('#info-veh-last-service').textContent = stats.lastServiceDate
        ? new Date(stats.lastServiceDate).toLocaleDateString()
        : 'Never';
      document.querySelector('#info-veh-last-odometer').textContent = stats.lastOdometer;
      document.querySelector('#info-veh-outstanding').textContent =
        `Rs. ${Number(stats.outstandingBalance || 0).toFixed(2)}`;
      document.querySelector('#info-veh-last-complaint').textContent =
        stats.lastComplaint || 'None';

      // Service Due details
      document.querySelector('#due-service-date').textContent = stats.nextServiceDate
        ? new Date(stats.nextServiceDate).toLocaleDateString()
        : 'N/A';
      document.querySelector('#due-service-odometer').textContent = stats.nextServiceOdometer
        ? `${stats.nextServiceOdometer} km`
        : 'N/A';

      // Due calculations (Days)
      const daysSpan = document.querySelector('#due-service-days');
      if (stats.nextServiceDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(stats.nextServiceDate);
        due.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          daysSpan.textContent = `(Overdue by ${Math.abs(diffDays)} days)`;
          daysSpan.style.color = '#dc2626';
        } else {
          daysSpan.textContent = `(Due in ${diffDays} days)`;
          daysSpan.style.color = '#15803d';
        }
      } else {
        daysSpan.textContent = '';
      }

      // Odometer Due Kilometers calculation
      const odoInput = document.querySelector('#form-odometer');
      const kmSpan = document.querySelector('#due-service-km');

      const updateKmDue = () => {
        const enteredVal = Number(odoInput.value);
        if (!enteredVal) {
          kmSpan.textContent = '';
          return;
        }
        const diff = stats.nextServiceOdometer - enteredVal;
        if (diff < 0) {
          kmSpan.textContent = `(Overdue by ${Math.abs(diff)} km)`;
          kmSpan.style.color = '#dc2626';
        } else {
          kmSpan.textContent = `(Due in ${diff} km)`;
          kmSpan.style.color = '#15803d';
        }
      };

      odoInput.addEventListener('input', updateKmDue);
      updateKmDue();

      document.querySelector('#vehicle-history-panel').style.display = 'block';
    }
  } catch (err) {
    console.error('Failed to load vehicle stats:', err);
  }
}

// Prefill customer details & load stats panel
async function selectCustomer(customer) {
  document.querySelector('#form-customer-name').value = customer.name || '';
  document.querySelector('#form-phone').value = customer.phone || '';
  document.querySelector('#form-address').value = customer.address || '';
  document.querySelector('#form-city').value = customer.city || '';
  document.querySelector('#form-customer-notes').value = customer.notes || '';

  try {
    const res = await api(`/api/v1/customers/${customer.id}/details`);
    const details = res.data;

    document.querySelector('#info-cust-name').textContent = details.name;
    document.querySelector('#info-cust-phone').textContent = details.phone || 'No Phone';
    document.querySelector('#info-cust-total-vehicles').textContent = details.vehicle_count;
    document.querySelector('#info-cust-total-job-cards').textContent = details.job_card_count;
    document.querySelector('#info-cust-last-visit').textContent = details.last_visit_at
      ? new Date(details.last_visit_at).toLocaleDateString()
      : 'Never';
    document.querySelector('#info-cust-notes').textContent = details.notes || 'None';

    const vehiclesDiv = document.querySelector('#info-cust-linked-vehicles');
    vehiclesDiv.innerHTML = '';
    if (details.vehicles && details.vehicles.length > 0) {
      details.vehicles.forEach((v) => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.fontSize = '12px';
        div.style.padding = '4px 0';
        div.style.borderBottom = '1px dashed #e2e8f0';

        div.innerHTML = `
          <span><strong>${v.registration_number}</strong> (${v.model})</span>
          <button type="button" class="select-linked-veh-btn" data-reg="${v.registration_number}" style="font-size: 11px; padding: 2px 6px;">Select</button>
        `;

        div.querySelector('.select-linked-veh-btn').addEventListener('click', () => {
          selectVehicle(v);
        });
        vehiclesDiv.appendChild(div);
      });

      // Auto-prefill if exactly 1 vehicle is linked
      if (details.vehicles.length === 1) {
        selectVehicle(details.vehicles[0]);
      }
    } else {
      vehiclesDiv.textContent = 'No linked vehicles found.';
    }

    document.querySelector('#customer-info-panel').style.display = 'block';
  } catch (err) {
    console.error('Failed to load customer details:', err);
  }
}

// Perform smart vehicle lookup by registration number on blur/change
async function handleRegistrationLookup() {
  const regInput = document.querySelector('#form-registration-number');
  const regValue = regInput.value.trim().toUpperCase();
  if (!regValue || regValue.length < 3) return;

  try {
    const res = await api(
      `/api/v1/vehicles/lookup?registration_number=${encodeURIComponent(regValue)}`,
    );
    const lookupStatus = document.querySelector('#registration-lookup-status');

    if (res.data) {
      // Vehicle exists! Prefill customer + vehicle history
      await selectCustomer({
        id: res.data.customer_id,
        name: res.data.customer_name,
        phone: res.data.customer_phone,
        address: res.data.customer_address,
        city: res.data.customer_city,
        notes: res.data.customer_notes,
      });
      selectVehicle(res.data);
    } else {
      // New vehicle
      lookupStatus.textContent = 'New Vehicle - Enter Vehicle Details';
      lookupStatus.style.color = '#d97706';
      lookupStatus.style.background = '#fffbeb';
      lookupStatus.style.border = '1px solid #fde68a';
      lookupStatus.style.display = 'block';

      document.querySelector('#customer-info-panel').style.display = 'none';
      document.querySelector('#vehicle-history-panel').style.display = 'none';
    }
  } catch (err) {
    console.error('Lookup failed:', err);
  }
}

// Toggle Quick Entry UI mode
function triggerQuickEntryUI(isQuick) {
  const selectors = [
    '#form-phone',
    '#form-model',
    '#form-fuel-type',
    '#form-chassis-number',
    '#form-engine-number',
    '#form-address',
    '#form-city',
    '#form-customer-notes',
    '#form-battery-brand',
    '#form-fuel-level',
    '#form-promised-delivery',
  ];

  selectors.forEach((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      const label = el.closest('label');
      if (label) label.style.display = isQuick ? 'none' : 'block';
      if (isQuick) {
        el.removeAttribute('required');
      } else {
        if (sel === '#form-model' || sel === '#form-fuel-type') {
          el.setAttribute('required', 'true');
        }
      }
    }
  });

  const formElement = document.querySelector('#job-card-form');
  formElement.style.gridTemplateColumns = isQuick ? '1fr' : '1fr 1fr';

  const checklistDiv = document.querySelector('#form-toolkit').closest('div').parentNode;
  if (checklistDiv) {
    checklistDiv.style.display = isQuick ? 'none' : 'block';
  }
}

// Load 5 most recently created job cards as quick visits selector
async function loadRecentVisits() {
  const container = document.querySelector('#recent-visits-container');
  try {
    const res = await api('/api/v1/job-cards?pageSize=5');
    const cards = res.data || [];
    if (cards.length === 0) {
      container.innerHTML =
        '<p style="padding:10px; background:#f8fafc; font-size:13px; text-align:center;">No recent workshop visits found.</p>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Customer Name</th>
            <th>Phone</th>
            <th>Vehicle Reg</th>
            <th>Model</th>
            <th>Last Odometer</th>
            <th>Visit Date</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
    `;

    cards.forEach((c) => {
      html += `
        <tr>
          <td><strong>${c.customer_name || 'Walk-in'}</strong></td>
          <td>${c.customer_phone || '-'}</td>
          <td><span class="badge badge-draft">${c.registration_number}</span></td>
          <td>${c.model || '-'}</td>
          <td>${c.odometer_reading} km</td>
          <td>${new Date(c.opened_at).toLocaleDateString()}</td>
          <td>
            <button type="button" class="use-recent-btn" data-reg="${c.registration_number}" style="font-size:12px; padding: 4px 8px;">Select</button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.use-recent-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const reg = btn.dataset.reg;
        try {
          const res = await api(
            `/api/v1/vehicles/lookup?registration_number=${encodeURIComponent(reg)}`,
          );
          if (res.data) {
            await selectCustomer({
              id: res.data.customer_id,
              name: res.data.customer_name,
              phone: res.data.customer_phone,
              address: res.data.customer_address,
              city: res.data.customer_city,
              notes: res.data.customer_notes,
            });
            selectVehicle(res.data);
          }
        } catch (err) {
          console.error('Failed to load recent customer:', err);
        }
      });
    });
  } catch (err) {
    console.error('Failed to load recent visits:', err);
    container.innerHTML =
      '<p style="padding:10px; color:#dc2626;">Failed to load recent workshop visits.</p>';
  }
}
