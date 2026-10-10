import { localDate } from './local-date.js';
const token = sessionStorage.getItem('goldy_auth_token');
const message = document.querySelector('#message');
const dateInput = document.querySelector('#dashboard-date');

let financialData = null;
let currentFinancialPeriod = 'today'; // 'today' or 'month'

// Initialize date input to today's local date
const todayLocal = localDate();
dateInput.value = todayLocal;

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
  loadAllDashboardData();
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
  document.querySelector('#refresh-btn').addEventListener('click', () => {
    loadAllDashboardData();
  });

  dateInput.addEventListener('change', () => {
    loadAllDashboardData();
  });

  const finTabs = document.querySelector('#financial-tabs');
  finTabs.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      finTabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', 'false'));
      btn.setAttribute('aria-selected', 'true');
      currentFinancialPeriod = btn.dataset.period;
      renderFinancialSection();
    });
  });
}

async function loadAllDashboardData() {
  showMessage('');
  const targetDate = dateInput.value || todayLocal;

  try {
    // 1. Fetch Operations Metrics
    const opRes = await api(`/api/v1/dashboard/operations?todayDate=${targetDate}`);
    renderOperations(opRes);

    // 2. Fetch Financial Metrics
    const finRes = await api(`/api/v1/dashboard/financial?todayDate=${targetDate}`);
    financialData = finRes;
    renderFinancialSection();

    // 3. Fetch Sales Metrics
    const salesRes = await api(`/api/v1/dashboard/sales?todayDate=${targetDate}`);
    renderSales(salesRes);

    // 4. Fetch Inventory Metrics
    const invRes = await api(`/api/v1/dashboard/inventory`);
    renderInventory(invRes);
  } catch (err) {
    showMessage(err.message, true);
  }
}

function renderOperations(data) {
  document.querySelector('#op-today-jc').textContent = data.todayJobCardsCount || 0;
  document.querySelector('#op-active-jc').textContent = data.openJobCards || 0;
  document.querySelector('#op-pending-deliveries').textContent = data.pendingDeliveriesCount || 0;
}

function renderFinancialSection() {
  if (!financialData) return;

  // Render workshop-wide sticky KPIs
  const todayRevenueVal = financialData.today?.revenue || 0;
  const outstandingVal = financialData.outstandingAmount || 0;
  document.querySelector('#fin-today-revenue').textContent =
    `Rs. ${Number(todayRevenueVal).toFixed(2)}`;
  document.querySelector('#fin-outstanding').textContent =
    `Rs. ${Number(outstandingVal).toFixed(2)}`;

  const revEl = document.querySelector('#fin-revenue');
  const gpEl = document.querySelector('#fin-gross-profit');
  const npEl = document.querySelector('#fin-net-profit');
  const expCard = document.querySelector('#fin-expenses-card');
  const expVal = document.querySelector('#fin-expenses');
  const revLbl = document.querySelector('#fin-revenue-lbl');

  if (currentFinancialPeriod === 'today') {
    const today = financialData.today;
    revEl.textContent = `Rs. ${Number(today.revenue || 0).toFixed(2)}`;
    gpEl.textContent = `Rs. ${Number(today.grossProfit || 0).toFixed(2)}`;
    npEl.textContent = `Rs. ${Number(today.netProfit || 0).toFixed(2)}`;
    expCard.style.display = 'none';
    revLbl.textContent = 'Selected Day Revenue';
  } else {
    const m = financialData.thisMonth;
    revEl.textContent = `Rs. ${Number(m.revenue || 0).toFixed(2)}`;
    gpEl.textContent = `Rs. ${Number(m.grossProfit || 0).toFixed(2)}`;
    npEl.textContent = `Rs. ${Number(m.netProfit || 0).toFixed(2)}`;
    expVal.textContent = `Rs. ${Number(m.expenses || 0).toFixed(2)}`;
    expCard.style.display = 'flex';
    revLbl.textContent = 'Month Revenue';
  }
}

function renderSales(data) {
  // Render Recent Invoices
  const recentContainer = document.querySelector('#recent-sales-container');
  if (!data.recentSales || data.recentSales.length === 0) {
    recentContainer.innerHTML =
      '<p style="padding:10px; background:#f8fafc; text-align:center;">No recent finalized invoices.</p>';
  } else {
    let html = `
      <table>
        <thead>
          <tr>
            <th>Invoice No</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Grand Total</th>
          </tr>
        </thead>
        <tbody>
    `;
    data.recentSales.forEach((row) => {
      html += `
        <tr>
          <td><strong>${row.invoiceNumber}</strong></td>
          <td>${row.customerName}</td>
          <td>${row.invoiceDate}</td>
          <td><strong>Rs. ${Number(row.grandTotal).toFixed(2)}</strong></td>
        </tr>
      `;
    });
    html += '</tbody></table>';
    recentContainer.innerHTML = html;
  }

  // Render Top Services
  const topServicesContainer = document.querySelector('#top-services-container');
  if (!data.topServices || data.topServices.length === 0) {
    topServicesContainer.innerHTML =
      '<p style="padding:10px; background:#f8fafc; text-align:center;">No service history available.</p>';
  } else {
    let html = `
      <table>
        <thead>
          <tr>
            <th>Service Description</th>
            <th>Times Billed</th>
            <th>Qty</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
    `;
    data.topServices.forEach((row) => {
      html += `
        <tr>
          <td><strong>${row.description}</strong></td>
          <td>${row.count}</td>
          <td>${row.totalQuantity}</td>
          <td><strong>Rs. ${Number(row.totalRevenue).toFixed(2)}</strong></td>
        </tr>
      `;
    });
    html += '</tbody></table>';
    topServicesContainer.innerHTML = html;
  }
}

function renderInventory(data) {
  document.querySelector('#inv-total-items').textContent = data.totalItems;
  document.querySelector('#inv-total-qty').textContent = data.totalQuantity;
  document.querySelector('#inv-total-valuation').textContent =
    `Rs. ${Number(data.totalValuation).toFixed(2)}`;

  const lowCountEl = document.querySelector('#inv-low-stock-count');
  lowCountEl.textContent = data.lowStockCount;

  const lowCard = document.querySelector('#inv-low-stock-card');
  if (data.lowStockCount > 0) {
    lowCard.classList.add('alert');
  } else {
    lowCard.classList.remove('alert');
  }

  // Warehouse summaries
  const warehouseContainer = document.querySelector('#warehouse-container');
  if (!data.warehouseSummary || data.warehouseSummary.length === 0) {
    warehouseContainer.innerHTML =
      '<p style="padding:10px; background:#f8fafc; text-align:center;">No warehouse stock info.</p>';
  } else {
    let html = `
      <table>
        <thead>
          <tr>
            <th>Warehouse Code</th>
            <th>Warehouse Name</th>
            <th>Total Stock Qty</th>
            <th>Stock Valuation</th>
          </tr>
        </thead>
        <tbody>
    `;
    data.warehouseSummary.forEach((w) => {
      html += `
        <tr>
          <td><strong>${w.warehouseCode}</strong></td>
          <td>${w.warehouseName}</td>
          <td>${w.totalQuantity}</td>
          <td><strong>Rs. ${Number(w.totalValue).toFixed(2)}</strong></td>
        </tr>
      `;
    });
    html += '</tbody></table>';
    warehouseContainer.innerHTML = html;
  }

  // Low stock items detail
  const lowStockContainer = document.querySelector('#low-stock-container');
  if (!data.lowStockItems || data.lowStockItems.length === 0) {
    lowStockContainer.innerHTML =
      '<p style="padding:10px; background:#f0fdf4; color:#15803d; text-align:center; font-weight:bold;">All inventory stock levels are good!</p>';
  } else {
    let html = `
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Item Name</th>
            <th>Current Qty</th>
            <th>Reorder Level</th>
          </tr>
        </thead>
        <tbody>
    `;
    data.lowStockItems.slice(0, 5).forEach((item) => {
      html += `
        <tr>
          <td><span style="font-family:monospace; font-weight:700;">${item.sku}</span></td>
          <td>${item.itemName}</td>
          <td style="color:#dc2626; font-weight:bold;">${item.currentQuantity} ${item.unitOfMeasure}</td>
          <td>${item.reorderLevel} ${item.unitOfMeasure}</td>
        </tr>
      `;
    });
    html += '</tbody></table>';
    lowStockContainer.innerHTML = html;
  }
}
