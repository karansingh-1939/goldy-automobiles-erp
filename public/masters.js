const resources = {
  customers: {
    label: 'Customers',
    endpoint: '/api/v1/customers',
    fields: [
      ['name', 'Name', 'text', { required: true, minlength: 2, maxlength: 120 }],
      ['phone', 'Phone', 'text', { minlength: 10, maxlength: 10, pattern: '^[0-9]{10}$' }],
      ['address', 'Address', 'text', { maxlength: 500 }],
      ['city', 'City', 'text', { maxlength: 80 }],
      ['state', 'State', 'text', { maxlength: 80 }],
      ['notes', 'Notes', 'text', { maxlength: 1000 }],
    ],
    columns: ['id', 'name', 'phone', 'city', 'state'],
  },
  vehicles: {
    label: 'Vehicles',
    endpoint: '/api/v1/vehicles',
    fields: [
      [
        'registration_number',
        'Registration Number',
        'text',
        { required: true, minlength: 4, maxlength: 15, pattern: '^[A-Za-z0-9-\\s]+$' },
      ],
      ['make', 'Make', 'text', { maxlength: 80 }],
      ['model', 'Model', 'text', { maxlength: 80 }],
      ['fuel_type', 'Fuel Type', 'text', { maxlength: 40 }],
      ['year', 'Year', 'number', { min: 1900, max: 2027 }],
      ['engine_number', 'Engine Number', 'text', { maxlength: 80 }],
      ['chassis_number', 'Chassis Number', 'text', { maxlength: 80 }],
      ['odometer_reading', 'Odometer', 'number', { min: 0 }],
    ],
    columns: [
      'id',
      'registration_number',
      'make',
      'model',
      'fuel_type',
      'engine_number',
      'chassis_number',
    ],
  },
  suppliers: {
    label: 'Suppliers',
    endpoint: '/api/v1/suppliers',
    fields: [
      ['name', 'Name', 'text', { required: true, minlength: 2, maxlength: 160 }],
      ['phone', 'Phone', 'text', { minlength: 10, maxlength: 15, pattern: '^[0-9]{10,15}$' }],
      ['email', 'Email', 'email', { maxlength: 160 }],
      [
        'gstin',
        'GSTIN',
        'text',
        {
          minlength: 15,
          maxlength: 15,
          pattern: '^\\d{2}[A-Z]{5}\\d{4}[A-Z]{1}[A-Z\\d]{1}[Z]{1}[A-Z\\d]{1}$',
        },
      ],
      ['address', 'Address', 'text', { maxlength: 500 }],
      ['city', 'City', 'text', { maxlength: 80 }],
      ['state', 'State', 'text', { maxlength: 80 }],
      ['pincode', 'Pincode', 'text', { minlength: 6, maxlength: 6, pattern: '^[1-9][0-9]{5}$' }],
      ['is_active', 'Active', 'checkbox'],
    ],
    columns: ['id', 'name', 'phone', 'email', 'city', 'is_active'],
  },
  warehouses: {
    label: 'Warehouses',
    endpoint: '/api/v1/warehouses',
    fields: [
      ['name', 'Name', 'text', { required: true, minlength: 2, maxlength: 120 }],
      [
        'code',
        'Code',
        'text',
        { required: true, minlength: 2, maxlength: 10, pattern: '^[A-Za-z0-9]{2,10}$' },
      ],
      ['address', 'Address', 'text', { maxlength: 500 }],
      ['is_active', 'Active', 'checkbox'],
    ],
    columns: ['id', 'name', 'code', 'address', 'is_active'],
  },
  inventoryCategories: {
    label: 'Inventory Categories',
    endpoint: '/api/v1/inventory-categories',
    fields: [
      ['name', 'Name', 'text', { required: true, minlength: 2, maxlength: 120 }],
      ['description', 'Description', 'text', { maxlength: 500 }],
      ['is_active', 'Active', 'checkbox'],
    ],
    columns: ['id', 'name', 'description', 'is_active'],
  },
  inventorySettings: {
    label: 'Inventory Settings',
    endpoint: '/api/v1/inventory/seed-starter',
    fields: [],
    columns: [],
  },
};

const urlParams = new URLSearchParams(window.location.search);
const showAll = urlParams.get('show_all') === 'true' || urlParams.get('admin') === 'true';
const initialResource = urlParams.get('resource');
let currentKey = initialResource && resources[initialResource] ? initialResource : 'customers';

if (!showAll && ['warehouses', 'inventoryCategories', 'inventorySettings'].includes(currentKey)) {
  currentKey = 'customers';
}

let editingId = null;
let page = 1;

const token = sessionStorage.getItem('goldy_auth_token');
const tabs = document.querySelector('#resource-tabs');
const editor = document.querySelector('#editor');
const table = document.querySelector('#table');
const message = document.querySelector('#message');
const search = document.querySelector('#search');
const saveButton = document.querySelector('#save-button');

function showMessage(text) {
  message.textContent = text;
}

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

function renderTabs() {
  tabs.innerHTML = '';

  for (const [key, resource] of Object.entries(resources)) {
    if (!showAll && ['warehouses', 'inventoryCategories', 'inventorySettings'].includes(key)) {
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = resource.label;
    button.setAttribute('aria-selected', key === currentKey ? 'true' : 'false');
    button.addEventListener('click', () => {
      currentKey = key;
      editingId = null;
      page = 1;
      search.value = '';
      render();
    });
    tabs.append(button);
  }
}

function renderForm(data = {}) {
  const resource = resources[currentKey];
  editor.innerHTML = '';

  for (const field of resource.fields) {
    const name = field[0];
    const label = field[1];
    const type = field[2] || 'text';
    const options = field[3] || {};

    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const input = document.createElement('input');
    input.name = name;
    input.type = type;

    if (type === 'checkbox') {
      input.checked = data[name] === undefined ? true : Boolean(data[name]);
    } else {
      input.value = data[name] ?? '';
    }

    if (options.required) input.required = true;
    if (options.min !== undefined) input.min = options.min;
    if (options.max !== undefined) input.max = options.max;
    if (options.minlength !== undefined) input.minLength = options.minlength;
    if (options.maxlength !== undefined) input.maxLength = options.maxlength;
    if (options.pattern !== undefined) input.pattern = options.pattern;

    wrapper.append(input);
    editor.append(wrapper);
  }

  saveButton.textContent = editingId ? 'Update' : 'Create';
}

function readForm() {
  const resource = resources[currentKey];
  const data = {};

  for (const field of resource.fields) {
    const name = field[0];
    const type = field[2] || 'text';
    const input = editor.elements[name];

    if (type === 'checkbox') {
      data[name] = input.checked;
    } else if (input.value !== '') {
      data[name] = type === 'number' ? Number(input.value) : input.value;
    }
  }

  return data;
}

function renderTable(rows) {
  const resource = resources[currentKey];
  const html = `
    <table>
      <thead>
        <tr>
          ${resource.columns.map((column) => `<th>${column}</th>`).join('')}
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            ${resource.columns.map((column) => `<td>${row[column] ?? ''}</td>`).join('')}
            <td>
              <button type="button" data-edit="${row.id}">Edit</button>
              <button type="button" data-delete="${row.id}">Delete</button>
              ${currentKey === 'suppliers' ? `<a href="/supplier-ledger.html?id=${row.id}" class="button" style="padding:6px 10px; font-size:12px; margin-left: 6px; text-decoration: none; display: inline-block; background: #0f766e; color: white; border-radius: 4px; font-weight: bold;">Ledger</a>` : ''}
            </td>
          </tr>
        `,
          )
          .join('')}
      </tbody>
    </table>
  `;
  table.innerHTML = html;

  table.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', async () => {
      const body = await api(`${resource.endpoint}/${button.dataset.edit}`);
      editingId = body.data.id;
      renderForm(body.data);
    });
  });

  table.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Are you sure you want to delete this record?')) {
        return;
      }
      try {
        await api(`${resource.endpoint}/${button.dataset.delete}`, { method: 'DELETE' });
        showMessage('Deleted.');
        loadRows();
      } catch (error) {
        showMessage(error.message);
      }
    });
  });
}

async function loadRows() {
  const resource = resources[currentKey];
  const params = new URLSearchParams({
    page: String(page),
    pageSize: '10',
    search: search.value,
  });
  const body = await api(`${resource.endpoint}?${params}`);
  renderTable(body.data);
  showMessage(
    `Page ${body.pagination.page} of ${body.pagination.totalPages || 1}. Total: ${body.pagination.total}.`,
  );
}

async function checkSeedStatus() {
  const statusBox = document.querySelector('#settings-status-box');
  const btn = document.querySelector('#load-starter-btn');
  if (!statusBox || !btn) return;

  statusBox.style.display = 'none';
  btn.disabled = true;

  try {
    const res = await api('/api/v1/inventory/seed-status');
    if (res.loaded) {
      statusBox.style.display = 'block';
      statusBox.style.background = '#fef2f2';
      statusBox.style.border = '1px solid #fee2e2';
      statusBox.style.color = '#991b1b';
      statusBox.textContent = 'Starter inventory already loaded.';
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = 'pointer';
    }
  } catch (error) {
    statusBox.style.display = 'block';
    statusBox.style.background = '#fef2f2';
    statusBox.style.border = '1px solid #fee2e2';
    statusBox.style.color = '#991b1b';
    statusBox.textContent = 'Failed to verify inventory status: ' + error.message;
  }
}

function render() {
  renderTabs();

  const settingsContainer = document.querySelector('#settings-container');
  const toolbar = document.querySelector('.toolbar');
  const editorForm = document.querySelector('#editor');
  const actionsDiv = document.querySelector('.actions');
  const tableDiv = document.querySelector('#table');

  if (currentKey === 'inventorySettings') {
    if (toolbar) toolbar.style.display = 'none';
    if (editorForm) editorForm.style.display = 'none';
    if (actionsDiv) actionsDiv.style.display = 'none';
    if (tableDiv) tableDiv.style.display = 'none';
    if (settingsContainer) {
      settingsContainer.style.display = 'block';
      checkSeedStatus();
    }
  } else {
    if (toolbar) toolbar.style.display = '';
    if (editorForm) editorForm.style.display = '';
    if (actionsDiv) actionsDiv.style.display = '';
    if (tableDiv) tableDiv.style.display = '';
    if (settingsContainer) settingsContainer.style.display = 'none';

    renderForm();
    loadRows().catch((error) => showMessage(error.message));
  }
}

document.querySelector('#search-button').addEventListener('click', () => {
  page = 1;
  loadRows().catch((error) => showMessage(error.message));
});

document.querySelector('#reset-button').addEventListener('click', () => {
  editingId = null;
  renderForm();
});

document.querySelector('#prev-button').addEventListener('click', () => {
  page = Math.max(1, page - 1);
  loadRows().catch((error) => showMessage(error.message));
});

document.querySelector('#next-button').addEventListener('click', () => {
  page += 1;
  loadRows().catch((error) => showMessage(error.message));
});

saveButton.addEventListener('click', async () => {
  if (!editor.checkValidity()) {
    editor.reportValidity();
    return;
  }
  const resource = resources[currentKey];
  const data = readForm();
  const endpoint = editingId ? `${resource.endpoint}/${editingId}` : resource.endpoint;
  const method = editingId ? 'PATCH' : 'POST';

  try {
    await api(endpoint, {
      method,
      body: JSON.stringify(data),
    });
    showMessage(editingId ? 'Updated.' : 'Created.');
    editingId = null;
    renderForm();
    loadRows();
  } catch (error) {
    if (error.details) {
      const detailsStr = Object.entries(error.details)
        .map(([field, msg]) => `${field}: ${msg}`)
        .join(', ');
      showMessage(`Validation failed: ${detailsStr}`);
    } else {
      showMessage(error.message);
    }
  }
});

if (!token) {
  window.location.replace('/index.html');
} else {
  render();
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

document.querySelector('#load-starter-btn')?.addEventListener('click', async () => {
  const btn = document.querySelector('#load-starter-btn');
  const statusBox = document.querySelector('#settings-status-box');
  if (!btn || !statusBox) return;

  btn.disabled = true;
  btn.innerHTML = `<svg style="animation: spin 1s linear infinite;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> Loading...`;

  if (!document.getElementById('spin-keyframes')) {
    const style = document.createElement('style');
    style.id = 'spin-keyframes';
    style.innerHTML =
      '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }

  try {
    const res = await api('/api/v1/inventory/seed-starter', { method: 'POST' });
    statusBox.style.display = 'block';
    statusBox.style.background = '#f0fdf4';
    statusBox.style.border = '1px solid #bbf7d0';
    statusBox.style.color = '#166534';
    statusBox.textContent = `Success! ${res.itemsSeeded} starter inventory items loaded successfully.`;

    btn.innerHTML = `<span>Starter inventory loaded</span>`;
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  } catch (error) {
    statusBox.style.display = 'block';
    statusBox.style.background = '#fef2f2';
    statusBox.style.border = '1px solid #fee2e2';
    statusBox.style.color = '#991b1b';
    statusBox.textContent = error.message;

    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> <span>Retry Loading Starter Inventory</span>`;
    btn.disabled = false;
  }
});
