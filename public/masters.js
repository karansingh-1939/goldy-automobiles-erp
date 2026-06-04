const resources = {
  customers: {
    label: 'Customers',
    endpoint: '/api/v1/customers',
    fields: [
      ['name', 'Name'],
      ['phone', 'Phone'],
      ['alternate_phone', 'Alternate Phone'],
      ['email', 'Email'],
      ['gstin', 'GSTIN'],
      ['address', 'Address'],
      ['city', 'City'],
      ['state', 'State'],
      ['pincode', 'Pincode'],
      ['notes', 'Notes'],
    ],
    columns: ['id', 'name', 'phone', 'email', 'city', 'state'],
  },
  vehicles: {
    label: 'Vehicles',
    endpoint: '/api/v1/vehicles',
    fields: [
      ['customer_id', 'Customer ID', 'number'],
      ['registration_number', 'Registration Number'],
      ['make', 'Make'],
      ['model', 'Model'],
      ['variant', 'Variant'],
      ['fuel_type', 'Fuel Type'],
      ['year', 'Year', 'number'],
      ['vin', 'VIN'],
      ['engine_number', 'Engine Number'],
      ['odometer_reading', 'Odometer', 'number'],
    ],
    columns: ['id', 'customer_id', 'registration_number', 'make', 'model', 'fuel_type'],
  },
  suppliers: {
    label: 'Suppliers',
    endpoint: '/api/v1/suppliers',
    fields: [
      ['name', 'Name'],
      ['phone', 'Phone'],
      ['email', 'Email'],
      ['gstin', 'GSTIN'],
      ['address', 'Address'],
      ['city', 'City'],
      ['state', 'State'],
      ['pincode', 'Pincode'],
      ['is_active', 'Active', 'checkbox'],
    ],
    columns: ['id', 'name', 'phone', 'email', 'city', 'is_active'],
  },
  warehouses: {
    label: 'Warehouses',
    endpoint: '/api/v1/warehouses',
    fields: [
      ['name', 'Name'],
      ['code', 'Code'],
      ['address', 'Address'],
      ['is_active', 'Active', 'checkbox'],
    ],
    columns: ['id', 'name', 'code', 'address', 'is_active'],
  },
  inventoryCategories: {
    label: 'Inventory Categories',
    endpoint: '/api/v1/inventory-categories',
    fields: [
      ['name', 'Name'],
      ['description', 'Description'],
      ['is_active', 'Active', 'checkbox'],
    ],
    columns: ['id', 'name', 'description', 'is_active'],
  },
};

let currentKey = 'customers';
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
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error?.message || 'Request failed.');
  }

  return body;
}

function renderTabs() {
  tabs.innerHTML = '';

  for (const [key, resource] of Object.entries(resources)) {
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

  for (const [name, label, type = 'text'] of resource.fields) {
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

    wrapper.append(input);
    editor.append(wrapper);
  }

  saveButton.textContent = editingId ? 'Update' : 'Create';
}

function readForm() {
  const resource = resources[currentKey];
  const data = {};

  for (const [name, , type = 'text'] of resource.fields) {
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
        ${rows.map((row) => `
          <tr>
            ${resource.columns.map((column) => `<td>${row[column] ?? ''}</td>`).join('')}
            <td>
              <button type="button" data-edit="${row.id}">Edit</button>
              <button type="button" data-delete="${row.id}">Delete</button>
            </td>
          </tr>
        `).join('')}
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
      await api(`${resource.endpoint}/${button.dataset.delete}`, { method: 'DELETE' });
      showMessage('Deleted.');
      loadRows();
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
  showMessage(`Page ${body.pagination.page} of ${body.pagination.totalPages || 1}. Total: ${body.pagination.total}.`);
}

function render() {
  renderTabs();
  renderForm();
  loadRows().catch((error) => showMessage(error.message));
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
    showMessage(error.message);
  }
});

if (!token) {
  showMessage('Login first, then return to this page.');
} else {
  render();
}
