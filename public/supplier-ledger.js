const token = sessionStorage.getItem('goldy_auth_token');
const message = document.querySelector('#message');
const supplierSelect = document.querySelector('#supplier-select');
const ledgerView = document.querySelector('#ledger-view');
const noSelectionView = document.querySelector('#no-selection-view');

let selectedSupplierId = null;
let page = 1;

// Message helper
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
  setupListeners();
  setupLogout();
  loadSuppliers();
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

function setupListeners() {
  supplierSelect.addEventListener('change', () => {
    const id = supplierSelect.value;
    if (id) {
      selectedSupplierId = Number(id);
      page = 1;
      loadLedgerData();
    } else {
      selectedSupplierId = null;
      ledgerView.style.display = 'none';
      noSelectionView.style.display = 'block';
    }
  });

  document.querySelector('#refresh-btn').addEventListener('click', () => {
    if (selectedSupplierId) {
      page = 1;
      loadLedgerData();
    }
  });

  document.querySelector('#prev-btn').addEventListener('click', () => {
    if (page > 1) {
      page--;
      loadLedgerData();
    }
  });

  document.querySelector('#next-btn').addEventListener('click', () => {
    page++;
    loadLedgerData();
  });
}

async function loadSuppliers() {
  try {
    const res = await api('/api/v1/suppliers?pageSize=1000');
    const suppliers = res.data;

    supplierSelect.innerHTML = '<option value="">-- Choose Supplier --</option>';
    suppliers.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      supplierSelect.appendChild(opt);
    });
  } catch (err) {
    showMessage('Failed to load suppliers list: ' + err.message, true);
  }
}

async function loadLedgerData() {
  if (!selectedSupplierId) return;
  showMessage('');

  try {
    // 1. Fetch Supplier Profile details
    const supRes = await api(`/api/v1/suppliers/${selectedSupplierId}`);
    const sup = supRes.data;

    document.querySelector('#supplier-name').textContent = sup.name;
    document.querySelector('#supplier-phone').textContent = sup.phone || '-';
    document.querySelector('#supplier-email').textContent = sup.email || '-';
    document.querySelector('#supplier-gstin').textContent = sup.gstin || 'UNREGISTERED';
    document.querySelector('#supplier-city-state').textContent =
      `${sup.city || ''}, ${sup.state || ''}`.trim().replace(/^,\s*/, '') || '-';
    document.querySelector('#supplier-address').textContent = sup.address || '-';

    // 2. Fetch Supplier Ledger entries
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '10',
    });
    const ledgerRes = await api(
      `/api/v1/purchases/suppliers/${selectedSupplierId}/ledger?${params}`,
    );

    // The outstanding balance is held in the latest ledger entry (index 0 on page 1)
    let currentBalance = 0;
    if (ledgerRes.data && ledgerRes.data.length > 0) {
      // Since ordered DESC by ID, index 0 of page 1 is the latest
      if (page === 1) {
        currentBalance = ledgerRes.data[0].balance_after;
      } else {
        // Fallback: fetch page 1 to extract the actual current balance
        const latestRes = await api(
          `/api/v1/purchases/suppliers/${selectedSupplierId}/ledger?page=1&pageSize=1`,
        );
        if (latestRes.data && latestRes.data.length > 0) {
          currentBalance = latestRes.data[0].balance_after;
        }
      }
    }

    const balEl = document.querySelector('#outstanding-balance');
    balEl.textContent = `Rs. ${Number(currentBalance).toFixed(2)}`;

    const balCard = document.querySelector('#balance-card');
    if (currentBalance > 0) {
      balCard.classList.add('warning');
    } else {
      balCard.classList.remove('warning');
    }

    renderLedgerTable(ledgerRes.data);

    document.querySelector('#page-info').textContent =
      `Page ${page} of ${ledgerRes.pagination.totalPages || 1} (Total transactions: ${ledgerRes.pagination.total})`;

    noSelectionView.style.display = 'none';
    ledgerView.style.display = 'block';
  } catch (err) {
    showMessage('Failed to load ledger: ' + err.message, true);
  }
}

function renderLedgerTable(rows) {
  const container = document.querySelector('#table-container');
  if (!rows || rows.length === 0) {
    container.innerHTML =
      '<p style="padding:20px; background:#f8fafc; text-align:center; color:#64748b;">No transaction ledger entries recorded for this supplier.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Transaction Type</th>
          <th>Reference ID</th>
          <th>Debit (Paid/Returned)</th>
          <th>Credit (Purchased)</th>
          <th>Running Balance</th>
          <th>Notes / Remarks</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach((row) => {
    let refLabel = '-';
    if (row.reference_type === 'purchase_receipts') {
      refLabel = `GRN #${row.reference_id}`;
    } else if (row.reference_type === 'purchase_returns') {
      refLabel = `Return #${row.reference_id}`;
    } else if (row.reference_type) {
      refLabel = `${row.reference_type} #${row.reference_id}`;
    }

    html += `
      <tr>
        <td>${row.entry_date}</td>
        <td><strong>${row.entry_type}</strong></td>
        <td><span style="font-family:monospace; font-weight:bold;">${refLabel}</span></td>
        <td style="${row.debit > 0 ? 'color:#dc2626; font-weight:bold;' : ''}">
          ${row.debit > 0 ? `Rs. ${Number(row.debit).toFixed(2)}` : '-'}
        </td>
        <td style="${row.credit > 0 ? 'color:#15803d; font-weight:bold;' : ''}">
          ${row.credit > 0 ? `Rs. ${Number(row.credit).toFixed(2)}` : '-'}
        </td>
        <td><strong>Rs. ${Number(row.balance_after).toFixed(2)}</strong></td>
        <td>${row.notes || '-'}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}
