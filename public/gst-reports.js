import { localDate } from './local-date.js';
const token = sessionStorage.getItem('goldy_auth_token');
const message = document.querySelector('#message');

let activeTab = 'summary';
let currentGstr1Data = [];

function escapeHtml(value) {
  const span = document.createElement('span');
  span.textContent = String(value ?? '');
  return span.innerHTML;
}

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
  setupTabs();
  setupFilterListeners();
  setupLogout();
  generateReport();
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

// TAB NAVIGATION
function setupTabs() {
  const tabsContainer = document.querySelector('#gst-tabs');
  tabsContainer.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  activeTab = tab;
  document
    .querySelector('#gst-tabs')
    .querySelectorAll('button')
    .forEach((btn) => {
      btn.setAttribute('aria-selected', btn.dataset.tab === tab ? 'true' : 'false');
    });

  document.querySelector('#tab-summary').style.display = tab === 'summary' ? 'block' : 'none';
  document.querySelector('#tab-gstr1').style.display = tab === 'gstr1' ? 'block' : 'none';
  document.querySelector('#tab-gstr3b').style.display = tab === 'gstr3b' ? 'block' : 'none';
  document.querySelector('#tab-hsn').style.display = tab === 'hsn' ? 'block' : 'none';

  // Show CSV export button only on GSTR-1 tab
  document.querySelector('#export-csv-btn').style.display =
    tab === 'gstr1' ? 'inline-block' : 'none';

  generateReport();
}

// FILTER CONTROLS
function setupFilterListeners() {
  const periodSelect = document.querySelector('#filter-period');
  periodSelect.addEventListener('change', () => {
    const period = periodSelect.value;
    document.querySelector('#month-selector-container').style.display =
      period === 'month' ? 'block' : 'none';
    document.querySelector('#fy-selector-container').style.display =
      period === 'fy' ? 'block' : 'none';
    document.querySelector('#custom-date-container').style.display =
      period === 'custom' ? 'flex' : 'none';
  });

  document.querySelector('#generate-btn').addEventListener('click', () => {
    generateReport();
  });

  document.querySelector('#export-csv-btn').addEventListener('click', () => {
    exportGstr1ToCsv();
  });
}

// CONVERT PERIOD SELECTOR TO DATE RANGE
function getPeriodDates() {
  const period = document.querySelector('#filter-period').value;
  const today = localDate();

  if (period === 'this_month') {
    return {
      period: 'this_month',
      dateFrom: `${today.slice(0, 7)}-01`,
      dateTo: today,
    };
  }

  if (period === 'this_year') {
    return {
      period: 'this_year',
      dateFrom: `${today.slice(0, 4)}-01-01`,
      dateTo: today,
    };
  }

  if (period === 'month') {
    const monthVal = document.querySelector('#filter-month').value; // YYYY-MM
    if (!monthVal) {
      throw new Error('Please select a target month.');
    }
    const year = Number(monthVal.slice(0, 4));
    const month = Number(monthVal.slice(5, 7));
    const lastDay = new Date(year, month, 0).getDate(); // last day of month
    const monthPadded = String(month).padStart(2, '0');
    return {
      period: 'custom',
      dateFrom: `${year}-${monthPadded}-01`,
      dateTo: `${year}-${monthPadded}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  if (period === 'fy') {
    const fyVal = document.querySelector('#filter-fy').value; // e.g. "2026"
    if (!fyVal) {
      throw new Error('Please select a financial year.');
    }
    const startYear = Number(fyVal);
    const endYear = startYear + 1;
    return {
      period: 'custom',
      dateFrom: `${startYear}-04-01`,
      dateTo: `${endYear}-03-31`,
    };
  }

  if (period === 'custom') {
    const fromVal = document.querySelector('#filter-date-from').value;
    const toVal = document.querySelector('#filter-date-to').value;
    if (!fromVal || !toVal) {
      throw new Error('Please enter both From and To dates.');
    }
    if (fromVal > toVal) {
      throw new Error('From date must be earlier or equal to To date.');
    }
    return {
      period: 'custom',
      dateFrom: fromVal,
      dateTo: toVal,
    };
  }

  return { period: 'this_month', dateFrom: `${today.slice(0, 7)}-01`, dateTo: today };
}

// CALCULATE INPUT TAX CREDIT (ITC) CLIENT-SIDE
async function loadInputTaxCredit(dateFrom, dateTo) {
  try {
    const res = await api('/api/v1/purchases/receipts?pageSize=1000');
    const postedReceipts = res.data.filter((r) => {
      if (r.status !== 'POSTED') return false;
      if (dateFrom && r.receipt_date < dateFrom) return false;
      if (dateTo && r.receipt_date > dateTo) return false;
      return true;
    });

    const taxableValue = postedReceipts.reduce((sum, r) => sum + Number(r.subtotal || 0), 0);
    const totalITC = postedReceipts.reduce((sum, r) => sum + Number(r.gst_total || 0), 0);

    // Split 50/50 for CGST and SGST (IGST is 0 for local operations)
    const cgstITC = Math.round((totalITC / 2) * 100) / 100;
    const sgstITC = Math.round((totalITC - cgstITC) * 100) / 100;

    return {
      taxableValue,
      cgstITC,
      sgstITC,
      igstITC: 0,
      totalITC,
    };
  } catch (err) {
    console.error('Failed to load Input Tax Credit from purchases', err);
    return { taxableValue: 0, cgstITC: 0, sgstITC: 0, igstITC: 0, totalITC: 0 };
  }
}

// GENERATE ACTIVE REPORT
async function generateReport() {
  showMessage('');
  let filters;

  try {
    filters = getPeriodDates();
  } catch (err) {
    showMessage(err.message, true);
    return;
  }

  const queryParams = new URLSearchParams({
    period: filters.period,
  });
  if (filters.dateFrom) queryParams.append('dateFrom', filters.dateFrom);
  if (filters.dateTo) queryParams.append('dateTo', filters.dateTo);

  try {
    if (activeTab === 'summary') {
      await renderSummaryTab(queryParams, filters);
    } else if (activeTab === 'gstr1') {
      await renderGstr1Tab(queryParams);
    } else if (activeTab === 'gstr3b') {
      await renderGstr3bTab(queryParams, filters);
    } else if (activeTab === 'hsn') {
      await renderHsnTab(queryParams);
    }
  } catch (err) {
    showMessage(err.message, true);
  }
}

// TAB 1: SUMMARY
async function renderSummaryTab(queryParams, filters) {
  const salesRes = await api(`/api/v1/gst/summary?${queryParams}`);
  const sales = salesRes.data;

  const itc = await loadInputTaxCredit(filters.dateFrom, filters.dateTo);

  // Update sales Outward GST values
  document.querySelector('#sales-taxable').textContent = `Rs. ${sales.taxableValue.toFixed(2)}`;
  document.querySelector('#sales-cgst').textContent = `Rs. ${sales.cgstAmount.toFixed(2)}`;
  document.querySelector('#sales-sgst').textContent = `Rs. ${sales.sgstAmount.toFixed(2)}`;
  document.querySelector('#sales-igst').textContent = `Rs. ${sales.igstAmount.toFixed(2)}`;
  document.querySelector('#sales-total').textContent = `Rs. ${sales.totalTax.toFixed(2)}`;

  // Update purchases Inward ITC values
  document.querySelector('#itc-taxable').textContent = `Rs. ${itc.taxableValue.toFixed(2)}`;
  document.querySelector('#itc-cgst').textContent = `Rs. ${itc.cgstITC.toFixed(2)}`;
  document.querySelector('#itc-sgst').textContent = `Rs. ${itc.sgstITC.toFixed(2)}`;
  document.querySelector('#itc-igst').textContent = `Rs. ${itc.igstITC.toFixed(2)}`;
  document.querySelector('#itc-total').textContent = `Rs. ${itc.totalITC.toFixed(2)}`;

  // Calculate Net Liabilities (Sales tax - Purchase ITC)
  const netCgst = Math.max(0, sales.cgstAmount - itc.cgstITC);
  const netSgst = Math.max(0, sales.sgstAmount - itc.sgstITC);
  const netIgst = Math.max(0, sales.igstAmount - itc.igstITC);
  const netTotal = netCgst + netSgst + netIgst;

  document.querySelector('#liability-cgst').textContent = `Rs. ${netCgst.toFixed(2)}`;
  document.querySelector('#liability-sgst').textContent = `Rs. ${netSgst.toFixed(2)}`;
  document.querySelector('#liability-igst').textContent = `Rs. ${netIgst.toFixed(2)}`;
  document.querySelector('#liability-total').textContent = `Rs. ${netTotal.toFixed(2)}`;
}

// TAB 2: GSTR-1 (Sales Ledger)
async function renderGstr1Tab(queryParams) {
  const container = document.querySelector('#gstr1-container');
  const res = await api(`/api/v1/gst/gstr1?${queryParams}`);
  currentGstr1Data = res.data;

  if (currentGstr1Data.length === 0) {
    container.innerHTML =
      '<p style="padding:10px; background:#f3f4f6; text-align:center;">No sales records found for this period.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Invoice No</th>
          <th>Document Type</th>
          <th>Original Invoice</th>
          <th>Invoice Date</th>
          <th>Customer Name</th>
          <th>Customer GSTIN</th>
          <th>Place of Supply</th>
          <th>HSN/SAC</th>
          <th>Taxable Value</th>
          <th>CGST</th>
          <th>SGST</th>
          <th>IGST</th>
          <th>Total Tax</th>
          <th>Total Value</th>
        </tr>
      </thead>
      <tbody>
  `;

  currentGstr1Data.forEach((row) => {
    html += `
      <tr>
        <td><strong>${escapeHtml(row.invoiceNumber)}</strong></td>
        <td>${row.documentType === 'CREDIT_NOTE' ? 'Credit note' : 'Invoice'}</td>
        <td>${escapeHtml(row.originalInvoiceNumber || '-')}</td>
        <td>${escapeHtml(row.invoiceDate)}</td>
        <td>${escapeHtml(row.customerName)}</td>
        <td>${escapeHtml(row.customerGstin || '-')}</td>
        <td>${escapeHtml(row.placeOfSupply || '-')}</td>
        <td><span style="font-family:monospace; font-weight:700;">${escapeHtml(row.hsnSac || 'UNSPECIFIED')}</span></td>
        <td>Rs. ${row.taxableValue.toFixed(2)}</td>
        <td>Rs. ${row.cgstAmount.toFixed(2)}</td>
        <td>Rs. ${row.sgstAmount.toFixed(2)}</td>
        <td>Rs. ${row.igstAmount.toFixed(2)}</td>
        <td><strong>Rs. ${row.totalTax.toFixed(2)}</strong></td>
        <td><strong>Rs. ${row.lineTotal.toFixed(2)}</strong></td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// TAB 3: GSTR-3B (Returns Summary)
async function renderGstr3bTab(queryParams, filters) {
  const salesRes = await api(`/api/v1/gst/gstr3b?${queryParams}`);
  const sales = salesRes.data.outwardSupplies;
  const rateBreakdown = salesRes.data.rateBreakdown;

  const itc = await loadInputTaxCredit(filters.dateFrom, filters.dateTo);

  // Update Outward supplies
  document.querySelector('#gstr3b-sales-count').textContent = sales.invoiceCount;
  document.querySelector('#gstr3b-sales-taxable').textContent =
    `Rs. ${sales.taxableValue.toFixed(2)}`;
  document.querySelector('#gstr3b-sales-igst').textContent =
    `Rs. ${sales.integratedTax.toFixed(2)}`;
  document.querySelector('#gstr3b-sales-cgst').textContent = `Rs. ${sales.centralTax.toFixed(2)}`;
  document.querySelector('#gstr3b-sales-sgst').textContent = `Rs. ${sales.stateUtTax.toFixed(2)}`;
  document.querySelector('#gstr3b-sales-total').textContent = `Rs. ${sales.totalTax.toFixed(2)}`;

  // Update Inward supplies (ITC)
  document.querySelector('#gstr3b-itc-taxable').textContent = `Rs. ${itc.taxableValue.toFixed(2)}`;
  document.querySelector('#gstr3b-itc-igst').textContent = `Rs. ${itc.igstITC.toFixed(2)}`;
  document.querySelector('#gstr3b-itc-cgst').textContent = `Rs. ${itc.cgstITC.toFixed(2)}`;
  document.querySelector('#gstr3b-itc-sgst').textContent = `Rs. ${itc.sgstITC.toFixed(2)}`;
  document.querySelector('#gstr3b-itc-total').textContent = `Rs. ${itc.totalITC.toFixed(2)}`;

  // Render Rate Breakdown Table
  const rateContainer = document.querySelector('#gstr3b-rate-container');
  if (rateBreakdown.length === 0) {
    rateContainer.innerHTML =
      '<p style="padding:10px; background:#f3f4f6; text-align:center;">No rate breakdown available.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>GST Rate (%)</th>
          <th>Taxable Value</th>
          <th>Central Tax (CGST)</th>
          <th>State/UT Tax (SGST)</th>
          <th>Integrated Tax (IGST)</th>
          <th>Total Tax Amount</th>
        </tr>
      </thead>
      <tbody>
  `;

  rateBreakdown.forEach((row) => {
    html += `
      <tr>
        <td><strong>${row.gstRate}%</strong></td>
        <td>Rs. ${row.taxableValue.toFixed(2)}</td>
        <td>Rs. ${row.cgstAmount.toFixed(2)}</td>
        <td>Rs. ${row.sgstAmount.toFixed(2)}</td>
        <td>Rs. ${row.igstAmount.toFixed(2)}</td>
        <td><strong>Rs. ${row.totalTax.toFixed(2)}</strong></td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  rateContainer.innerHTML = html;
}

// TAB 4: HSN SUMMARY
async function renderHsnTab(queryParams) {
  const container = document.querySelector('#hsn-container');
  const res = await api(`/api/v1/gst/hsn-summary?${queryParams}`);
  const data = res.data;

  if (data.length === 0) {
    container.innerHTML =
      '<p style="padding:10px; background:#f3f4f6; text-align:center;">No HSN summary data found for this period.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>HSN/SAC Code</th>
          <th>Total Quantity</th>
          <th>Taxable Value</th>
          <th>Central Tax (CGST)</th>
          <th>State Tax (SGST)</th>
          <th>Integrated Tax (IGST)</th>
          <th>Total GST Amount</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.forEach((row) => {
    html += `
      <tr>
        <td><span style="font-family:monospace; font-weight:700;">${escapeHtml(row.hsnSac)}</span></td>
        <td>${row.quantity}</td>
        <td>Rs. ${row.taxableValue.toFixed(2)}</td>
        <td>Rs. ${row.cgstAmount.toFixed(2)}</td>
        <td>Rs. ${row.sgstAmount.toFixed(2)}</td>
        <td>Rs. ${row.igstAmount.toFixed(2)}</td>
        <td><strong>Rs. ${row.totalTax.toFixed(2)}</strong></td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// EXPORT TO CSV (GSTR-1)
function exportGstr1ToCsv() {
  if (currentGstr1Data.length === 0) {
    showMessage('No GSTR-1 records loaded to export.', true);
    return;
  }

  const headers = [
    'Document Type',
    'Original Invoice Number',
    'Invoice Number',
    'Invoice Date',
    'Customer Name',
    'Customer GSTIN',
    'Place of Supply',
    'Item Type',
    'HSN/SAC',
    'Description',
    'Quantity',
    'Unit Price',
    'Taxable Value',
    'GST Rate %',
    'CGST Amount',
    'SGST Amount',
    'IGST Amount',
    'Total Tax',
    'Line Total',
  ];

  const csvRows = [headers.join(',')];

  currentGstr1Data.forEach((row) => {
    const csvRow = [
      row.documentType || 'INVOICE',
      row.originalInvoiceNumber || '',
      row.invoiceNumber,
      row.invoiceDate,
      row.customerName,
      row.customerGstin || '',
      row.placeOfSupply || '',
      row.itemType,
      row.hsnSac || 'UNSPECIFIED',
      row.description || '',
      row.quantity,
      row.unitPrice,
      row.taxableValue,
      row.gstRate,
      row.cgstAmount,
      row.sgstAmount,
      row.igstAmount,
      row.totalTax,
      row.lineTotal,
    ];
    csvRows.push(
      csvRow
        .map((value) => {
          const text = String(value ?? '');
          const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
          return `"${safe.replace(/"/g, '""')}"`;
        })
        .join(','),
    );
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);

  const dateStr = localDate();
  link.setAttribute('download', `GSTR1_Export_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showMessage('CSV exported successfully!');
}
