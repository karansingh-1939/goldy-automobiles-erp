import { localDate } from './local-date.js';
const token = sessionStorage.getItem('goldy_auth_token');
const message = document.querySelector('#message');

let page = 1;
let totalPages = 1;
let editingExpenseId = null;
let deletingExpenseId = null;

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

function init() {
  setupListeners();
  setupLogout();
  loadSummaryCards();
  loadExpensesList();
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

// DESCRIPTION TAG ENCODING / DECODING
function encodeDescription(desc, payment, notes) {
  let raw = desc.trim();
  if (payment) {
    raw += ` [Payment: ${payment.trim()}]`;
  }
  if (notes && notes.trim()) {
    raw += ` [Notes: ${notes.trim()}]`;
  }
  return raw;
}

function decodeDescription(raw) {
  if (!raw) return { description: '', paymentMethod: 'Cash', notes: '' };

  const paymentMatch = raw.match(/\[Payment:\s*([^\]]+)\]/);
  const notesMatch = raw.match(/\[Notes:\s*([^\]]+)\]/);

  const paymentMethod = paymentMatch ? paymentMatch[1].trim() : 'Cash';
  const notes = notesMatch ? notesMatch[1].trim() : '';

  let cleanDesc = raw
    .replace(/\[Payment:\s*[^\]]+\]/g, '')
    .replace(/\[Notes:\s*[^\]]+\]/g, '')
    .trim();

  return { description: cleanDesc, paymentMethod, notes };
}

// SETUP LISTENERS
function setupListeners() {
  // Add Expense button
  document.querySelector('#add-expense-btn').addEventListener('click', () => {
    openExpenseModal();
  });

  // Modal Cancel button
  document.querySelector('#modal-cancel-btn').addEventListener('click', () => {
    closeExpenseModal();
  });

  // Form Submit
  document.querySelector('#expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveExpense();
  });

  // Delete Modal Cancel button
  document.querySelector('#delete-cancel-btn').addEventListener('click', () => {
    closeDeleteModal();
  });

  // Delete Confirm button
  document.querySelector('#delete-confirm-btn').addEventListener('click', async () => {
    await deleteExpense();
  });

  // Search and Filters
  document.querySelector('#search-btn').addEventListener('click', () => {
    page = 1;
    loadExpensesList();
  });

  document.querySelector('#reset-filters-btn').addEventListener('click', () => {
    document.querySelector('#search-query').value = '';
    document.querySelector('#filter-category').value = '';
    document.querySelector('#filter-date-from').value = '';
    document.querySelector('#filter-date-to').value = '';
    page = 1;
    loadExpensesList();
  });

  // Pagination
  document.querySelector('#prev-btn').addEventListener('click', () => {
    if (page > 1) {
      page--;
      loadExpensesList();
    }
  });

  document.querySelector('#next-btn').addEventListener('click', () => {
    if (page < totalPages) {
      page++;
      loadExpensesList();
    }
  });
}

// LOAD LEDGER LIST
async function loadExpensesList() {
  const searchQuery = document.querySelector('#search-query').value.trim();
  const category = document.querySelector('#filter-category').value;
  const dateFrom = document.querySelector('#filter-date-from').value;
  const dateTo = document.querySelector('#filter-date-to').value;

  try {
    // If a keyword search query is specified, retrieve all records to do client-side description/notes search matching
    const isSearchKeyword = searchQuery.length > 0;
    const size = isSearchKeyword ? 1000 : 10;

    const params = new URLSearchParams({
      page: isSearchKeyword ? '1' : String(page),
      pageSize: String(size),
    });

    if (category) params.append('category', category);
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);

    const res = await api(`/api/v1/expenses?${params}`);
    let data = res.data;

    // Apply client-side description keyword search matching
    if (isSearchKeyword) {
      const queryLower = searchQuery.toLowerCase();
      data = data.filter((item) => {
        const descMatch = (item.description || '').toLowerCase().includes(queryLower);
        return descMatch;
      });

      // Recalculate pagination boundaries locally
      totalPages = Math.ceil(data.length / 10) || 1;
      const offset = (page - 1) * 10;
      data = data.slice(offset, offset + 10);

      document.querySelector('#page-info').textContent =
        `Page ${page} of ${totalPages} (Filtered total: ${data.length})`;
      document.querySelector('#prev-btn').style.display = totalPages > 1 ? 'inline-block' : 'none';
      document.querySelector('#next-btn').style.display = totalPages > 1 ? 'inline-block' : 'none';
      document.querySelector('#prev-btn').disabled = page <= 1;
      document.querySelector('#next-btn').disabled = page >= totalPages;
    } else {
      totalPages = res.pagination.totalPages || 1;
      document.querySelector('#page-info').textContent =
        `Page ${page} of ${totalPages} (Total: ${res.pagination.total})`;
      document.querySelector('#prev-btn').style.display = 'inline-block';
      document.querySelector('#next-btn').style.display = 'inline-block';
      document.querySelector('#prev-btn').disabled = page <= 1;
      document.querySelector('#next-btn').disabled = page >= totalPages;
    }

    renderTable(data);
  } catch (err) {
    showMessage(err.message, true);
  }
}

function renderTable(rows) {
  const container = document.querySelector('#table-container');
  if (rows.length === 0) {
    container.innerHTML =
      '<p style="padding:10px; background:#f3f4f6; text-align:center;">No expenses found.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Category</th>
          <th>Description</th>
          <th>Amount</th>
          <th>Payment Method</th>
          <th>Created By</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach((row) => {
    const parsed = decodeDescription(row.description);
    const dateFormatted = new Date(row.expense_date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    html += `
      <tr>
        <td><strong>${dateFormatted}</strong></td>
        <td><span style="font-weight:700; color:#0f766e;">${row.category}</span></td>
        <td>
          <div>${parsed.description || '-'}</div>
          ${parsed.notes ? `<div style="font-size:11px; color:#64748b; margin-top:2px;">Notes: ${parsed.notes}</div>` : ''}
        </td>
        <td><strong>Rs. ${Number(row.amount).toFixed(2)}</strong></td>
        <td><span style="background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:700;">${parsed.paymentMethod}</span></td>
        <td><span style="font-size:12px; color:#4b5563;">${row.created_by_name || 'System'}</span></td>
        <td style="text-align:right;">
          <button type="button" class="edit-btn" data-id="${row.id}" style="padding:6px 10px; font-size:12px; margin-right:4px;">Edit</button>
          <button type="button" class="delete-btn danger" data-id="${row.id}" style="padding:6px 10px; font-size:12px;">Delete</button>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;

  // Edit / Delete Action listeners
  container.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openExpenseModal(Number(btn.dataset.id));
    });
  });

  container.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openDeleteModal(Number(btn.dataset.id));
    });
  });
}

// LOAD METRIC CARDS
async function loadSummaryCards() {
  try {
    // Fetch last 1000 items to calculate current metrics
    const res = await api('/api/v1/expenses?pageSize=1000');
    const expenses = res.data;

    const todayStr = localDate();
    const currentMonthStr = todayStr.slice(0, 7); // YYYY-MM

    let todayTotal = 0;
    let monthTotal = 0;
    const categoryTotalsMap = {};

    expenses.forEach((row) => {
      const amount = Number(row.amount || 0);
      const date = row.expense_date;

      // Today sum
      if (date === todayStr) {
        todayTotal += amount;
      }

      // This month sum
      if (date && date.startsWith(currentMonthStr)) {
        monthTotal += amount;
      }

      // Category breakdown
      categoryTotalsMap[row.category] = (categoryTotalsMap[row.category] || 0) + amount;
    });

    // Update values in UI
    document.querySelector('#summary-today').textContent = `Rs. ${todayTotal.toFixed(2)}`;
    document.querySelector('#summary-month').textContent = `Rs. ${monthTotal.toFixed(2)}`;

    // Render Category Breakdown list
    const breakdownList = document.querySelector('#summary-categories');
    breakdownList.innerHTML = '';

    const categories = [
      'Rent',
      'Salary',
      'Electricity',
      'Internet',
      'Fuel',
      'Maintenance',
      'Miscellaneous',
    ];
    categories.forEach((cat) => {
      const catTotal = categoryTotalsMap[cat] || 0;
      if (catTotal > 0) {
        const li = document.createElement('li');
        li.innerHTML = `<span>${cat}</span> <strong>Rs. ${catTotal.toFixed(2)}</strong>`;
        breakdownList.appendChild(li);
      }
    });

    if (breakdownList.children.length === 0) {
      breakdownList.innerHTML =
        '<li style="color:#64748b; font-style:italic;">No expenses logged this month</li>';
    }
  } catch (err) {
    console.error('Failed to load summary analytics', err);
  }
}

// MODAL - ADD / EDIT WORKFLOW
async function openExpenseModal(id = null) {
  const modal = document.querySelector('#expense-modal');
  const form = document.querySelector('#expense-form');
  const title = document.querySelector('#modal-title');
  const dateInput = document.querySelector('#modal-date');

  form.reset();
  editingExpenseId = id;

  // Set default date as today
  const todayStr = localDate();
  dateInput.value = todayStr;

  if (id) {
    title.textContent = 'Edit Expense';
    try {
      const res = await api(`/api/v1/expenses/${id}`);
      const exp = res.data;
      const parsed = decodeDescription(exp.description);

      document.querySelector('#modal-expense-id').value = exp.id;
      document.querySelector('#modal-date').value = exp.expense_date;
      document.querySelector('#modal-category').value = exp.category;
      document.querySelector('#modal-amount').value = exp.amount;
      document.querySelector('#modal-payment').value = parsed.paymentMethod;
      document.querySelector('#modal-description').value = parsed.description;
      document.querySelector('#modal-notes').value = parsed.notes;
    } catch (err) {
      showMessage(err.message, true);
      return;
    }
  } else {
    title.textContent = 'Add New Expense';
    document.querySelector('#modal-expense-id').value = '';
    document.querySelector('#modal-payment').value = 'Cash';
  }

  modal.style.display = 'flex';
}

function closeExpenseModal() {
  document.querySelector('#expense-modal').style.display = 'none';
  editingExpenseId = null;
}

async function saveExpense() {
  const dateVal = document.querySelector('#modal-date').value;
  const categoryVal = document.querySelector('#modal-category').value;
  const amountVal = Number(document.querySelector('#modal-amount').value);
  const paymentVal = document.querySelector('#modal-payment').value;
  const descriptionVal = document.querySelector('#modal-description').value;
  const notesVal = document.querySelector('#modal-notes').value;

  const rawDescription = encodeDescription(descriptionVal, paymentVal, notesVal);

  const payload = {
    expense_date: dateVal,
    category: categoryVal,
    amount: amountVal,
    description: rawDescription,
  };

  const method = editingExpenseId ? 'PATCH' : 'POST';
  const url = editingExpenseId ? `/api/v1/expenses/${editingExpenseId}` : '/api/v1/expenses';

  try {
    await api(url, {
      method,
      body: JSON.stringify(payload),
    });

    showMessage(
      editingExpenseId ? 'Expense updated successfully.' : 'Expense created successfully.',
    );
    closeExpenseModal();
    loadSummaryCards();
    loadExpensesList();
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

// MODAL - DELETE WORKFLOW
function openDeleteModal(id) {
  deletingExpenseId = id;
  document.querySelector('#delete-modal').style.display = 'flex';
}

function closeDeleteModal() {
  deletingExpenseId = null;
  document.querySelector('#delete-modal').style.display = 'none';
}

async function deleteExpense() {
  if (!deletingExpenseId) return;

  try {
    await api(`/api/v1/expenses/${deletingExpenseId}`, {
      method: 'DELETE',
    });

    showMessage('Expense deleted successfully.');
    closeDeleteModal();
    loadSummaryCards();
    loadExpensesList();
  } catch (err) {
    showMessage(err.message, true);
    closeDeleteModal();
  }
}
