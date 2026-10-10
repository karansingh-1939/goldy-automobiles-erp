// Stock Verification client logic
let warehouses = [];
let itemsList = [];
let auditItemsData = []; // Store items loaded in bulk audit count sheet

async function api(url, options = {}) {
  const token = sessionStorage.getItem('goldy_auth_token');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    sessionStorage.removeItem('goldy_auth_token');
    window.location.replace('/index.html');
    return;
  }
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message || json.message || 'API request failed');
  return json;
}

document.addEventListener('DOMContentLoaded', () => {
  // Check auth
  api('/api/v1/auth/me')
    .then(() => {
      initPage();
    })
    .catch(() => {
      window.location.href = '/';
    });
});

function initPage() {
  setupTabs();
  loadCommonData();
  setupSingleVerifyForm();
  setupBulkVerifyForm();

  // Logout listener
  document.querySelector('#logout-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = '/';
    }
  });
}

function setupTabs() {
  const sidebar = document.querySelector('#verification-tabs');
  const buttons = sidebar.querySelectorAll('button');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.removeAttribute('aria-selected'));
      btn.setAttribute('aria-selected', 'true');

      const targetTab = btn.getAttribute('data-tab');

      clearMessage();

      // Show/Hide tabs
      document.querySelector('#tab-single').style.display =
        targetTab === 'single' ? 'block' : 'none';
      document.querySelector('#tab-bulk').style.display = targetTab === 'bulk' ? 'block' : 'none';
      document.querySelector('#tab-history').style.display =
        targetTab === 'history' ? 'block' : 'none';

      if (targetTab === 'history') {
        loadVerificationHistory();
      }
    });
  });
}

async function loadCommonData() {
  try {
    // Load warehouses
    const whRes = await api('/api/v1/warehouses?pageSize=100');
    warehouses = whRes.data.filter((w) => w.is_active);

    const singleWh = document.querySelector('#single-warehouse');
    const bulkWh = document.querySelector('#bulk-warehouse');

    // Clear and fill warehouse select dropdowns
    [singleWh, bulkWh].forEach((select) => {
      while (select.children.length > 1) {
        select.removeChild(select.lastChild);
      }
      warehouses.forEach((w) => {
        const opt = document.createElement('option');
        opt.value = w.id;
        opt.textContent = `${w.name} (${w.code})`;
        select.appendChild(opt);
      });
    });

    // Load items for single verification select
    const itemsRes = await api('/api/v1/inventory/items?pageSize=1000');
    // We only want normal inventory items, not equipment.
    // However, in the DB, is there any equipment in the catalog?
    // Let's filter out assets if we have category = 'Equipment'
    itemsList = itemsRes.data.filter((i) => i.is_active && i.category !== 'Equipment');

    const singleItemSelect = document.querySelector('#single-item');
    while (singleItemSelect.children.length > 1) {
      singleItemSelect.removeChild(singleItemSelect.lastChild);
    }
    itemsList.forEach((i) => {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.textContent = `${i.item_name} (SKU: ${i.sku})`;
      singleItemSelect.appendChild(opt);
    });
  } catch (err) {
    showMessage('Failed to load initial data: ' + err.message, true);
  }
}

function setupSingleVerifyForm() {
  const whSelect = document.querySelector('#single-warehouse');
  const itemSelect = document.querySelector('#single-item');
  const batchSelect = document.querySelector('#single-batch');
  const countInput = document.querySelector('#single-counted');
  const sysStockDisplay = document.querySelector('#system-stock-display');
  const reconInfo = document.querySelector('#reconciliation-info');
  const reconAction = document.querySelector('#reconciliation-action');
  const form = document.querySelector('#single-verify-form');

  let currentSystemQty = 0;

  // Listeners to update system stock & batches dropdown
  const onSelectionChange = async () => {
    const warehouseId = whSelect.value;
    const itemId = itemSelect.value;

    if (!warehouseId || !itemId) {
      sysStockDisplay.textContent = '0.00';
      currentSystemQty = 0;
      updateReconciliationText(0);
      // Reset batches
      while (batchSelect.children.length > 1) {
        batchSelect.removeChild(batchSelect.lastChild);
      }
      return;
    }

    try {
      // 1. Fetch batches for this item in this warehouse
      const batchesRes = await api(`/api/v1/batches?pageSize=500`);
      // Filter batches for this item and warehouse
      const relevantBatches = batchesRes.data.filter(
        (b) =>
          Number(b.item_id) === Number(itemId) && Number(b.warehouse_id) === Number(warehouseId),
      );

      // Populate batches dropdown
      const selectedBatchVal = batchSelect.value;
      while (batchSelect.children.length > 1) {
        batchSelect.removeChild(batchSelect.lastChild);
      }

      relevantBatches.forEach((b) => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = `Batch: ${b.batch_number} (Stock: ${b.quantity})`;
        // Custom attribute to store qty
        opt.setAttribute('data-qty', b.quantity);
        batchSelect.appendChild(opt);
      });

      // Restore selection if possible, otherwise trigger calculate qty
      if (
        selectedBatchVal &&
        relevantBatches.some((b) => Number(b.id) === Number(selectedBatchVal))
      ) {
        batchSelect.value = selectedBatchVal;
      }

      calculateSystemQty();
    } catch (err) {
      console.error(err);
    }
  };

  const calculateSystemQty = () => {
    const selectedBatch = batchSelect.value;
    if (selectedBatch) {
      const opt = batchSelect.querySelector(`option[value="${selectedBatch}"]`);
      currentSystemQty = Number(opt?.getAttribute('data-qty') || 0);
    } else {
      // Aggregate quantity from all options
      let total = 0;
      const opts = batchSelect.querySelectorAll('option[data-qty]');
      opts.forEach((o) => {
        total += Number(o.getAttribute('data-qty') || 0);
      });
      currentSystemQty = total;
    }

    sysStockDisplay.textContent = currentSystemQty.toFixed(2);
    calculateDifference();
  };

  const calculateDifference = () => {
    const counted = Number(countInput.value || 0);
    const diff = counted - currentSystemQty;
    updateReconciliationText(diff);
  };

  const updateReconciliationText = (diff) => {
    if (diff === 0) {
      reconInfo.style.display = 'none';
      reconAction.textContent = 'None';
      reconAction.className = '';
    } else {
      reconInfo.style.display = 'block';
      if (diff > 0) {
        reconAction.textContent = `Stock Increase (+${diff.toFixed(2)} units)`;
        reconAction.className = 'success-text';
      } else {
        reconAction.textContent = `Stock Decrease (${diff.toFixed(2)} units)`;
        reconAction.className = 'error-text';
      }
    }
  };

  whSelect.addEventListener('change', onSelectionChange);
  itemSelect.addEventListener('change', onSelectionChange);
  batchSelect.addEventListener('change', calculateSystemQty);
  countInput.addEventListener('input', calculateDifference);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    const payload = {
      verification_type: 'Single Item',
      warehouse_id: whSelect.value,
      item_id: itemSelect.value,
      batch_id: batchSelect.value || null,
      counted_quantity: countInput.value,
      notes: document.querySelector('#single-notes').value.trim(),
    };

    try {
      await api('/api/v1/inventory/verifications', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      showMessage('Reconciliation posted successfully. Stock levels have been reconciled.', false);
      form.reset();
      sysStockDisplay.textContent = '0.00';
      reconInfo.style.display = 'none';
    } catch (err) {
      showMessage(err.message, true);
    }
  });
}

function setupBulkVerifyForm() {
  const loadBtn = document.querySelector('#load-audit-btn');
  const postBtn = document.querySelector('#post-bulk-btn');
  const whSelect = document.querySelector('#bulk-warehouse');
  const typeSelect = document.querySelector('#bulk-type');
  const container = document.querySelector('#audit-table-container');
  const tableBody = document.querySelector('#audit-table-body');

  loadBtn.addEventListener('click', async () => {
    const warehouseId = whSelect.value;
    const type = typeSelect.value;

    if (type === 'Warehouse' && !warehouseId) {
      alert('Please select a warehouse godown to perform warehouse verification.');
      return;
    }

    clearMessage();
    container.style.display = 'none';
    postBtn.disabled = true;
    tableBody.innerHTML =
      '<tr><td colspan="8" style="text-align: center; padding: 20px;">Fetching count list...</td></tr>';

    try {
      // We load all batches to get item/warehouse locations
      const batchesRes = await api('/api/v1/batches?pageSize=1000');
      let relevantBatches = batchesRes.data;

      if (type === 'Warehouse' && warehouseId) {
        relevantBatches = relevantBatches.filter(
          (b) => Number(b.warehouse_id) === Number(warehouseId),
        );
      }

      // Filter out fixed equipment categories
      relevantBatches = relevantBatches.filter((b) => b.category !== 'Equipment');

      if (relevantBatches.length === 0) {
        tableBody.innerHTML =
          '<tr><td colspan="8" style="text-align: center; color: #64748b; padding: 20px;">No batches found in the selected scope. Perform opening stock or purchasing first.</td></tr>';
        container.style.display = 'block';
        return;
      }

      auditItemsData = relevantBatches;
      renderAuditSheet(relevantBatches);
      container.style.display = 'block';
      postBtn.disabled = false;
    } catch (err) {
      showMessage('Failed to load count sheet: ' + err.message, true);
    }
  });

  function renderAuditSheet(batches) {
    tableBody.innerHTML = '';
    batches.forEach((b, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(b.sku)}</strong></td>
        <td>${escapeHtml(b.item_name)}</td>
        <td>${escapeHtml(b.warehouse_name || `ID: ${b.warehouse_id}`)}</td>
        <td>${escapeHtml(b.batch_number)}</td>
        <td style="text-align: center; font-weight: bold;">${b.quantity.toFixed(2)}</td>
        <td style="text-align: center;">
          <input type="number" step="0.01" min="0" class="inline-count-input" data-idx="${idx}" value="${b.quantity}" style="width: 100px;">
        </td>
        <td style="text-align: center;" id="inline-diff-${idx}">
          <span class="discrepancy-badge discrepancy-none">0.00</span>
        </td>
        <td>
          <input type="text" placeholder="Audit note..." class="inline-note-input" data-idx="${idx}">
        </td>
      `;
      tableBody.appendChild(tr);
    });

    // Listeners for inline inputs
    tableBody.querySelectorAll('.inline-count-input').forEach((input) => {
      input.addEventListener('input', (e) => {
        const idx = Number(e.target.getAttribute('data-idx'));
        const counted = Number(e.target.value || 0);
        const original = auditItemsData[idx].quantity;
        const diff = counted - original;

        const diffCell = document.querySelector(`#inline-diff-${idx}`);
        if (diff === 0) {
          diffCell.innerHTML = '<span class="discrepancy-badge discrepancy-none">0.00</span>';
        } else if (diff > 0) {
          diffCell.innerHTML = `<span class="discrepancy-badge discrepancy-in">+${diff.toFixed(2)}</span>`;
        } else {
          diffCell.innerHTML = `<span class="discrepancy-badge discrepancy-out">${diff.toFixed(2)}</span>`;
        }
      });
    });
  }

  postBtn.addEventListener('click', async () => {
    if (
      !window.confirm(
        'Are you sure you want to submit this count audit reconciliation? Stock levels will be adjusted to match physical counts.',
      )
    ) {
      return;
    }

    clearMessage();
    postBtn.disabled = true;

    const auditType = typeSelect.value;
    const warehouseId = whSelect.value || null;
    const auditSessionId = `SES-${Date.now()}`;

    const verifications = [];
    const countInputs = tableBody.querySelectorAll('.inline-count-input');
    const noteInputs = tableBody.querySelectorAll('.inline-note-input');

    countInputs.forEach((input) => {
      const idx = Number(input.getAttribute('data-idx'));
      const counted = Number(input.value);
      const note = noteInputs[idx]?.value.trim() || '';

      // We only post verifications where there is a difference or if we want to log the audit
      verifications.push({
        warehouse_id: auditItemsData[idx].warehouse_id,
        item_id: auditItemsData[idx].item_id,
        batch_id: auditItemsData[idx].id,
        counted_quantity: counted,
        notes: note || `${auditType} reconciliation count`,
      });
    });

    const payload = {
      verification_type: auditType,
      audit_session_id: auditSessionId,
      warehouse_id: warehouseId || 1, // Default warehouse ID if null
      verifications: verifications,
    };

    try {
      await api('/api/v1/inventory/verifications', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      showMessage(
        `Audit session ${auditSessionId} posted successfully. Stock levels reconciled.`,
        false,
      );
      container.style.display = 'none';
      auditItemsData = [];
    } catch (err) {
      showMessage('Reconciliation failed: ' + err.message, true);
      postBtn.disabled = false;
    }
  });
}

async function loadVerificationHistory() {
  const tableBody = document.querySelector('#history-table-body');
  tableBody.innerHTML =
    '<tr><td colspan="12" style="text-align: center; color: #64748b; padding: 20px;">Loading verification history...</td></tr>';

  try {
    const res = await api('/api/v1/inventory/verifications?pageSize=100');
    if (!res.data || res.data.length === 0) {
      tableBody.innerHTML =
        '<tr><td colspan="12" style="text-align: center; color: #64748b; padding: 20px;">No verification records found.</td></tr>';
      return;
    }

    tableBody.innerHTML = '';
    res.data.forEach((v) => {
      const tr = document.createElement('tr');
      const diff = Number(v.difference);

      let diffBadge = '';
      if (diff === 0) {
        diffBadge = '<span class="discrepancy-badge discrepancy-none">0.00</span>';
      } else if (diff > 0) {
        diffBadge = `<span class="discrepancy-badge discrepancy-in">+${diff.toFixed(2)}</span>`;
      } else {
        diffBadge = `<span class="discrepancy-badge discrepancy-out">${diff.toFixed(2)}</span>`;
      }

      tr.innerHTML = `
        <td><strong>${escapeHtml(v.verification_number)}</strong></td>
        <td><span style="font-family: monospace; font-size: 11px;">${escapeHtml(v.audit_session_id || 'N/A')}</span></td>
        <td><span style="font-weight:bold; font-size:11px; color:#475569;">${escapeHtml(v.verification_type)}</span></td>
        <td>${escapeHtml(v.item_name)} (${escapeHtml(v.sku)})</td>
        <td>${escapeHtml(v.warehouse_name)}</td>
        <td>${v.batch_number ? escapeHtml(v.batch_number) : '<span style="color:#94a3b8; font-style:italic;">None</span>'}</td>
        <td>${Number(v.previous_quantity).toFixed(2)}</td>
        <td>${Number(v.counted_quantity).toFixed(2)}</td>
        <td>${diffBadge}</td>
        <td>${v.adjustment_id ? `<span style="font-weight:bold; font-family:monospace; color:#0f766e;">ADJ-${v.adjustment_id}</span>` : '<span style="color:#64748b; font-style:italic;">No Adj</span>'}</td>
        <td>${escapeHtml(v.verified_by_name || `ID: ${v.verified_by}`)}</td>
        <td>${v.verified_at}</td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (err) {
    showMessage(err.message, true);
    tableBody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: #dc2626; padding: 20px;">Error: ${err.message}</td></tr>`;
  }
}

function showMessage(text, isError = false) {
  const msg = document.querySelector('#message');
  msg.textContent = text;
  msg.className = isError ? 'error-text' : 'success-text';
}

function clearMessage() {
  const msg = document.querySelector('#message');
  msg.textContent = '';
  msg.className = '';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
