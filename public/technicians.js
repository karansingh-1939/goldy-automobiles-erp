const token = sessionStorage.getItem('goldy_auth_token');
const message = document.querySelector('#message');
const techList = document.querySelector('#tech-list');
const detailsView = document.querySelector('#details-view');
const noSelectionView = document.querySelector('#no-selection-view');
const searchForm = document.querySelector('#search-form');
const searchQuery = document.querySelector('#search-query');

// Modal Elements
const techModal = document.querySelector('#tech-modal');
const modalTitle = document.querySelector('#modal-title');
const techForm = document.querySelector('#tech-form');
const modalId = document.querySelector('#modal-id');
const modalCode = document.querySelector('#modal-code');
const modalName = document.querySelector('#modal-name');
const modalPhone = document.querySelector('#modal-phone');
const modalSpec = document.querySelector('#modal-spec');
const modalNotes = document.querySelector('#modal-notes');
const modalActive = document.querySelector('#modal-active');
const modalActiveLabel = document.querySelector('#modal-active-label');

let selectedTechId = null;
let techPage = 1;
let historyPage = 1;

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
  loadTechnicians();
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

function setupListeners() {
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    techPage = 1;
    loadTechnicians();
  });

  document.querySelector('#prev-btn').addEventListener('click', () => {
    if (techPage > 1) {
      techPage--;
      loadTechnicians();
    }
  });

  document.querySelector('#next-btn').addEventListener('click', () => {
    techPage++;
    loadTechnicians();
  });

  // Modal open
  document.querySelector('#add-tech-btn').addEventListener('click', () => {
    openModalForCreate();
  });

  document.querySelector('#modal-cancel-btn').addEventListener('click', () => {
    closeModal();
  });

  // Form submit
  techForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveTechnician();
  });

  // Edit / Delete actions
  document.querySelector('#edit-action-btn').addEventListener('click', () => {
    if (selectedTechId) {
      openModalForEdit();
    }
  });

  document.querySelector('#toggle-active-btn').addEventListener('click', async () => {
    if (selectedTechId) {
      await toggleActiveState();
    }
  });

  // History pagination
  document.querySelector('#history-prev-btn').addEventListener('click', () => {
    if (historyPage > 1) {
      historyPage--;
      loadHistory();
    }
  });

  document.querySelector('#history-next-btn').addEventListener('click', () => {
    historyPage++;
    loadHistory();
  });
}

async function loadTechnicians() {
  const query = searchQuery.value.trim();
  const params = new URLSearchParams({
    page: String(techPage),
    pageSize: '10',
    search: query
  });

  try {
    const res = await api(`/api/v1/technicians?${params}`);
    document.querySelector('#tech-count-summary').textContent = `Total Technicians: ${res.pagination.total}`;
    const data = res.data;

    if (data.length === 0) {
      techList.innerHTML = '<li style="text-align:center; color:#64748b; cursor:default; background:none;">No mechanics found.</li>';
      return;
    }

    techList.innerHTML = '';
    data.forEach((tech, index) => {
      const li = document.createElement('li');
      li.dataset.id = tech.id;
      
      const badgeClass = tech.is_active ? 'badge-active' : 'badge-inactive';
      const badgeLabel = tech.is_active ? 'Active' : 'Inactive';
      
      const serialNumber = (techPage - 1) * 10 + index + 1;
      li.innerHTML = `
        <div>
          <span class="name">#${serialNumber}. ${tech.full_name}</span>
          <span class="code">Mobile: ${tech.phone_number}</span>
        </div>
        <span class="badge ${badgeClass}" style="font-size: 9px; padding: 1px 4px;">${badgeLabel}</span>
      `;
      
      if (selectedTechId === tech.id) {
        li.classList.add('selected');
      }

      li.addEventListener('click', () => {
        techList.querySelectorAll('li').forEach((item) => item.classList.remove('selected'));
        li.classList.add('selected');
        selectedTechId = tech.id;
        historyPage = 1;
        loadTechnicianDetails();
      });

      techList.appendChild(li);
    });

  } catch (err) {
    showMessage(err.message, true);
  }
}

async function loadTechnicianDetails() {
  if (!selectedTechId) return;
  showMessage('');

  try {
    const res = await api(`/api/v1/technicians/${selectedTechId}`);
    const tech = res.data;

    document.querySelector('#detail-code').textContent = tech.id;
    document.querySelector('#detail-name').textContent = tech.full_name;
    document.querySelector('#detail-phone').textContent = tech.phone_number;
    document.querySelector('#detail-spec').textContent = tech.specialization || 'General / Multi-Specialist';
    document.querySelector('#detail-notes').textContent = tech.notes || '-';

    const badge = document.querySelector('#detail-badge');
    const toggleBtn = document.querySelector('#toggle-active-btn');
    
    if (tech.is_active) {
      badge.textContent = 'Active';
      badge.className = 'badge badge-active';
      toggleBtn.textContent = 'Deactivate';
      toggleBtn.className = 'danger';
    } else {
      badge.textContent = 'Inactive';
      badge.className = 'badge badge-inactive';
      toggleBtn.textContent = 'Reactivate';
      toggleBtn.className = '';
    }

    // Load metrics and history
    await loadHistory();

    noSelectionView.style.display = 'none';
    detailsView.style.display = 'block';

  } catch (err) {
    showMessage(err.message, true);
  }
}

async function loadHistory() {
  const params = new URLSearchParams({
    page: String(historyPage),
    pageSize: '5'
  });

  try {
    const res = await api(`/api/v1/technicians/${selectedTechId}/history?${params}`);
    
    // Set KPI cards
    document.querySelector('#stat-assigned').textContent = res.metrics.totalAssignedJobs;
    document.querySelector('#stat-completed').textContent = res.metrics.completedJobs;
    document.querySelector('#stat-active').textContent = res.metrics.activeJobs;

    // Render history table
    const container = document.querySelector('#history-container');
    const history = res.history;

    if (!history || history.length === 0) {
      container.innerHTML = '<p style="padding:15px; background:#f8fafc; text-align:center; color:#64748b; font-size:13px;">No job assignments logged.</p>';
      document.querySelector('#history-page-info').textContent = '';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Job Card</th>
            <th>Vehicle</th>
            <th>Customer</th>
            <th>Job Status</th>
            <th>Invoice Total</th>
          </tr>
        </thead>
        <tbody>
    `;

    history.forEach((row) => {
      const invTotal = row.invoice ? `Rs. ${Number(row.invoice.grandTotal).toFixed(2)}` : '-';
      const invNum = row.invoice ? ` / Inv ${row.invoice.invoiceNumber}` : '';
      
      html += `
        <tr>
          <td>${row.openedAt ? row.openedAt.slice(0, 10) : '-'}</td>
          <td><strong>${row.jobCardNumber}</strong>${invNum}</td>
          <td>${row.vehicle.registrationNumber} (${row.vehicle.make || ''} ${row.vehicle.model || ''})</td>
          <td>${row.customer.name}</td>
          <td><span class="badge badge-${row.jobCardStatus.toLowerCase()}">${row.jobCardStatus}</span></td>
          <td><strong>${invTotal}</strong></td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    document.querySelector('#history-page-info').textContent = `Page ${historyPage}`;

  } catch (err) {
    console.error('Failed to load history', err);
  }
}

function openModalForCreate() {
  modalTitle.textContent = 'Add New Technician';
  modalId.value = '';
  modalCode.value = '';
  modalCode.disabled = false;
  modalCode.required = false;
  document.querySelector('#modal-code-container').style.display = 'none';
  modalName.value = '';
  modalPhone.value = '';
  modalSpec.value = '';
  modalNotes.value = '';
  modalActive.checked = true;
  modalActiveLabel.style.display = 'none'; // hide status control for new
  techModal.style.display = 'flex';
}

async function openModalForEdit() {
  try {
    const res = await api(`/api/v1/technicians/${selectedTechId}`);
    const tech = res.data;

    modalTitle.textContent = 'Edit Technician Profile';
    modalId.value = tech.id;
    modalCode.value = tech.technician_code;
    modalCode.disabled = true; // Business code is immutable
    modalCode.required = false;
    document.querySelector('#modal-code-container').style.display = 'none';
    modalName.value = tech.full_name;
    modalPhone.value = tech.phone_number;
    modalSpec.value = tech.specialization || '';
    modalNotes.value = tech.notes || '';
    modalActive.checked = Boolean(tech.is_active);
    modalActiveLabel.style.display = 'flex';
    techModal.style.display = 'flex';

  } catch (err) {
    showMessage(err.message, true);
  }
}

function closeModal() {
  techModal.style.display = 'none';
}

async function saveTechnician() {
  const id = modalId.value;
  const payload = {
    full_name: modalName.value.trim(),
    phone_number: modalPhone.value.trim(),
    specialization: modalSpec.value.trim() || null,
    notes: modalNotes.value.trim() || null,
  };

  if (!id) {
    const codeVal = modalCode.value.trim();
    if (codeVal) {
      payload.technician_code = codeVal;
    }
  } else {
    payload.is_active = modalActive.checked;
  }

  const endpoint = id ? `/api/v1/technicians/${id}` : '/api/v1/technicians';
  const method = id ? 'PATCH' : 'POST';

  try {
    const res = await api(endpoint, {
      method,
      body: JSON.stringify(payload)
    });

    closeModal();
    showMessage(id ? 'Technician updated successfully.' : 'Technician created successfully.');
    
    if (!id) {
      selectedTechId = res.data.id;
    }
    
    await loadTechnicians();
    await loadTechnicianDetails();

  } catch (err) {
    showMessage(err.message, true);
  }
}

async function toggleActiveState() {
  try {
    const res = await api(`/api/v1/technicians/${selectedTechId}`);
    const tech = res.data;

    if (tech.is_active) {
      // Deactivate via DELETE route
      if (confirm(`Are you sure you want to deactivate ${tech.full_name}? They will no longer be assignable to new Job Cards.`)) {
        await api(`/api/v1/technicians/${selectedTechId}`, { method: 'DELETE' });
        showMessage('Technician deactivated.');
      }
    } else {
      // Reactivate via PATCH route
      await api(`/api/v1/technicians/${selectedTechId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: true })
      });
      showMessage('Technician reactivated.');
    }

    await loadTechnicians();
    await loadTechnicianDetails();

  } catch (err) {
    showMessage(err.message, true);
  }
}
