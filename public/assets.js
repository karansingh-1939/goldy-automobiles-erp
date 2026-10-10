import { localDate } from './local-date.js';
// Capital assets registration and rendering module
let currentPage = 1;
const pageSize = 20;

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
    .then((user) => {
      // User is verified, boot page
      initPage();
    })
    .catch((err) => {
      window.location.href = '/';
    });
});

function initPage() {
  loadAssets();
  loadSuppliers();

  // Search & Filter listeners
  document.querySelector('#search-btn').addEventListener('click', () => {
    currentPage = 1;
    loadAssets();
  });
  document.querySelector('#search-query').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      currentPage = 1;
      loadAssets();
    }
  });
  document.querySelector('#reset-btn').addEventListener('click', () => {
    document.querySelector('#search-query').value = '';
    currentPage = 1;
    loadAssets();
  });

  // Modal actions
  const modal = document.querySelector('#asset-modal');
  document.querySelector('#add-asset-btn').addEventListener('click', () => {
    // Reset form and set default date to today
    document.querySelector('#asset-form').reset();
    document.querySelector('#asset-date').value = localDate();
    modal.style.display = 'flex';
  });

  document.querySelector('#close-modal-btn').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Form submission
  document.querySelector('#asset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    const payload = {
      asset_name: document.querySelector('#asset-name').value,
      sku: document.querySelector('#asset-sku').value,
      category: document.querySelector('#asset-category').value,
      supplier_id: document.querySelector('#asset-supplier').value,
      invoice_number: document.querySelector('#asset-invoice').value,
      purchase_date: document.querySelector('#asset-date').value,
      purchase_cost: document.querySelector('#asset-cost').value,
      gst_amount: document.querySelector('#asset-gst').value,
      serial_number: document.querySelector('#asset-serial').value,
      warranty_info: document.querySelector('#asset-warranty').value,
      notes: document.querySelector('#asset-notes').value,
    };

    try {
      await api('/api/v1/inventory/assets', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      modal.style.display = 'none';
      showMessage('Fixed asset registered successfully.', false);
      currentPage = 1;
      loadAssets();
    } catch (err) {
      alert(err.message);
    }
  });

  // Pagination buttons
  document.querySelector('#prev-page-btn').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadAssets();
    }
  });
  document.querySelector('#next-page-btn').addEventListener('click', () => {
    currentPage++;
    loadAssets();
  });

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

async function loadAssets() {
  const tableBody = document.querySelector('#assets-list-body');
  tableBody.innerHTML =
    '<tr><td colspan="12" style="text-align: center; color: #64748b; padding: 20px;">Loading fixed assets...</td></tr>';

  const query = document.querySelector('#search-query').value.trim();
  const url = `/api/v1/inventory/assets?page=${currentPage}&pageSize=${pageSize}&search=${encodeURIComponent(query)}`;

  try {
    const res = await api(url);
    renderAssetsTable(res.data);
    updatePagination(res.pagination);
  } catch (err) {
    showMessage(err.message, true);
    tableBody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: #dc2626; padding: 20px;">Error: ${err.message}</td></tr>`;
  }
}

function renderAssetsTable(assets) {
  const tableBody = document.querySelector('#assets-list-body');
  if (!assets || assets.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="12" style="text-align: center; color: #64748b; padding: 20px;">No fixed assets registered yet.</td></tr>';
    return;
  }

  tableBody.innerHTML = '';
  assets.forEach((asset) => {
    const tr = document.createElement('tr');

    const cost = Number(asset.purchase_cost);
    const gst = Number(asset.gst_amount);
    const total = cost + gst;

    tr.innerHTML = `
      <td><strong>${escapeHtml(asset.sku)}</strong></td>
      <td>${escapeHtml(asset.asset_name)}</td>
      <td><span style="font-size: 12px; font-weight: bold; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">${escapeHtml(asset.category)}</span></td>
      <td>${escapeHtml(asset.supplier_name || `ID: ${asset.supplier_id}`)}</td>
      <td>${escapeHtml(asset.invoice_number)}</td>
      <td>${escapeHtml(asset.purchase_date)}</td>
      <td>Rs. ${cost.toFixed(2)}</td>
      <td>Rs. ${gst.toFixed(2)}</td>
      <td><strong>Rs. ${total.toFixed(2)}</strong></td>
      <td>${asset.serial_number ? escapeHtml(asset.serial_number) : '<span style="color:#94a3b8; font-style:italic;">N/A</span>'}</td>
      <td>${asset.warranty_info ? escapeHtml(asset.warranty_info) : '<span style="color:#94a3b8; font-style:italic;">None</span>'}</td>
      <td><span style="font-size: 11px; font-weight: bold; padding: 2px 6px; border-radius: 4px; ${asset.status === 'Active' ? 'background:#dcfce7; color:#15803d;' : 'background:#fee2e2; color:#dc2626;'}">${escapeHtml(asset.status)}</span></td>
    `;

    tableBody.appendChild(tr);
  });
}

async function loadSuppliers() {
  const select = document.querySelector('#asset-supplier');
  try {
    const res = await api('/api/v1/suppliers?pageSize=100');
    // Clear select except first child
    while (select.children.length > 1) {
      select.removeChild(select.lastChild);
    }

    res.data.forEach((s) => {
      if (s.is_active) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} ${s.gstin ? `(${s.gstin})` : ''}`;
        select.appendChild(opt);
      }
    });
  } catch (err) {
    console.error('Failed to load suppliers:', err);
  }
}

function updatePagination(pagination) {
  const prevBtn = document.querySelector('#prev-page-btn');
  const nextBtn = document.querySelector('#next-page-btn');
  const infoSpan = document.querySelector('#pagination-info');

  const { page, pageSize, total, totalPages } = pagination;
  currentPage = page;

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  infoSpan.textContent = `Showing ${start} to ${end} of ${total} entries (Page ${page} of ${totalPages})`;

  prevBtn.disabled = page <= 1;
  nextBtn.disabled = page >= totalPages;
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
