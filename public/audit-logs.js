const token = sessionStorage.getItem('goldy_auth_token');
const message = document.querySelector('#message');

let page = 1;
let totalPages = 1;
let currentLogs = [];

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

  if (response.status === 403) {
    throw new Error('Access Denied: You do not have permission to view audit logs.');
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
  setupListeners();
  setupLogout();
  loadAuditLogs();
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

// SETUP LISTENERS
function setupListeners() {
  // Apply filters button
  document.querySelector('#apply-filters-btn').addEventListener('click', () => {
    page = 1;
    loadAuditLogs();
  });

  // Clear filters button
  document.querySelector('#clear-filters-btn').addEventListener('click', () => {
    document.querySelector('#filter-search').value = '';
    document.querySelector('#filter-action').value = '';
    document.querySelector('#filter-entity-type').value = '';
    document.querySelector('#filter-date-from').value = '';
    document.querySelector('#filter-date-to').value = '';
    page = 1;
    loadAuditLogs();
  });

  // Pagination Previous button
  document.querySelector('#prev-page-btn').addEventListener('click', () => {
    if (page > 1) {
      page--;
      loadAuditLogs();
    }
  });

  // Pagination Next button
  document.querySelector('#next-page-btn').addEventListener('click', () => {
    if (page < totalPages) {
      page++;
      loadAuditLogs();
    }
  });

  // Modal Close button
  document.querySelector('#close-modal-btn').addEventListener('click', () => {
    closeDetailsModal();
  });

  // Close modal when clicking background
  document.querySelector('#details-modal').addEventListener('click', (e) => {
    if (e.target.id === 'details-modal') {
      closeDetailsModal();
    }
  });
}

// LOAD AUDIT LOGS
async function loadAuditLogs() {
  const search = document.querySelector('#filter-search').value.trim();
  const action = document.querySelector('#filter-action').value;
  const entityType = document.querySelector('#filter-entity-type').value.trim();
  const dateFrom = document.querySelector('#filter-date-from').value;
  const dateTo = document.querySelector('#filter-date-to').value;

  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '20',
    });

    if (search) params.append('search', search);
    if (action) params.append('action', action);
    if (entityType) params.append('entityType', entityType);
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);

    showMessage('Loading audit logs...');
    const res = await api(`/api/v1/audit-logs?${params}`);
    showMessage('');

    if (!res) return;

    currentLogs = res.data;
    totalPages = res.pagination.totalPages || 1;

    // Render Table
    renderTable(currentLogs);

    // Update Pagination UI
    const start = (page - 1) * 20 + 1;
    const end = Math.min(page * 20, res.pagination.total);
    const total = res.pagination.total;

    document.querySelector('#pagination-info').textContent =
      total > 0 ? `Showing ${start} to ${end} of ${total} logs` : 'Showing 0 to 0 of 0 logs';

    document.querySelector('#prev-page-btn').disabled = page <= 1;
    document.querySelector('#next-page-btn').disabled = page >= totalPages;
  } catch (err) {
    showMessage(err.message, true);
    document.querySelector('#audit-logs-tbody').innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #dc2626; font-weight: bold;">
          ${err.message}
        </td>
      </tr>
    `;
  }
}

// RENDER TABLE
function renderTable(logs) {
  const tbody = document.querySelector('#audit-logs-tbody');

  if (logs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #64748b;">
          No audit logs found matching the filters.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = logs
    .map((log) => {
      const dateFormatted = new Date(log.createdAt).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      let actionBadgeClass = 'badge-other';
      if (log.action === 'CREATE') actionBadgeClass = 'badge-create';
      else if (log.action === 'UPDATE') actionBadgeClass = 'badge-update';
      else if (log.action === 'DELETE') actionBadgeClass = 'badge-delete';

      // Build a nice description/summary of what happened
      let summary = '';
      if (log.action === 'CREATE') {
        summary = `Created new ${log.entityType}`;
        if (
          log.newValue &&
          (log.newValue.name || log.newValue.sku || log.newValue.registration_number)
        ) {
          summary += `: "${log.newValue.name || log.newValue.sku || log.newValue.registration_number}"`;
        }
      } else if (log.action === 'UPDATE') {
        summary = `Updated ${log.entityType}`;
        if (
          log.oldValue &&
          (log.oldValue.name || log.oldValue.sku || log.oldValue.registration_number)
        ) {
          summary += `: "${log.oldValue.name || log.oldValue.sku || log.oldValue.registration_number}"`;
        }
      } else if (log.action === 'DELETE') {
        summary = `Deleted ${log.entityType}`;
        if (
          log.oldValue &&
          (log.oldValue.name || log.oldValue.sku || log.oldValue.registration_number)
        ) {
          summary += `: "${log.oldValue.name || log.oldValue.sku || log.oldValue.registration_number}"`;
        }
      } else {
        summary = `${log.action} performed on ${log.entityType}`;
      }

      return `
      <tr>
        <td><strong>${dateFormatted}</strong></td>
        <td>
          <span style="font-weight: 600;">${log.userName || 'System'}</span>
          <br>
          <span style="font-size: 11px; color: #64748b;">@${log.userUsername || 'system'}</span>
        </td>
        <td><span class="badge ${actionBadgeClass}">${log.action}</span></td>
        <td><span style="font-family: monospace; font-size: 13px;">${log.entityType}</span></td>
        <td><strong>${log.entityId || '-'}</strong></td>
        <td><span style="color: #334155; font-size: 13px;">${summary}</span></td>
        <td>
          <button type="button" class="view-details-btn" data-id="${log.id}" style="padding: 6px 10px; font-size: 12px;">
            Details
          </button>
        </td>
      </tr>
    `;
    })
    .join('');

  // Add click listeners to details buttons
  tbody.querySelectorAll('.view-details-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const logId = Number(btn.dataset.id);
      const log = currentLogs.find((l) => l.id === logId);
      if (log) {
        openDetailsModal(log);
      }
    });
  });
}

// DETAILS MODAL WORKFLOW
function openDetailsModal(log) {
  const modal = document.querySelector('#details-modal');

  const dateFormatted = new Date(log.createdAt).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  document.querySelector('#modal-timestamp').textContent = dateFormatted;
  document.querySelector('#modal-user').textContent =
    `${log.userName || 'System'} (@${log.userUsername || 'system'})`;
  document.querySelector('#modal-action').textContent = log.action;
  document.querySelector('#modal-entity').textContent =
    `${log.entityType} (ID: ${log.entityId || '-'})`;

  const oldBox = document.querySelector('#modal-old-value');
  const newBox = document.querySelector('#modal-new-value');

  if (log.oldValue) {
    oldBox.textContent = JSON.stringify(log.oldValue, null, 2);
  } else {
    oldBox.textContent = 'None';
  }

  if (log.newValue) {
    newBox.textContent = JSON.stringify(log.newValue, null, 2);
  } else {
    newBox.textContent = 'None';
  }

  modal.style.display = 'flex';
}

function closeDetailsModal() {
  document.querySelector('#details-modal').style.display = 'none';
}
