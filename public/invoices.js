const token = sessionStorage.getItem('goldy_auth_token');
const message = document.querySelector('#message');
const tabsContainer = document.querySelector('#invoice-tabs');
const detailsTabBtn = document.querySelector('#details-tab-btn');
const invoiceSheet = document.querySelector('#invoice-bill-sheet');

let activeTab = 'list';
let editingInvoiceId = null;
let page = 1;

// Message helper
function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? '#dc2626' : '#15803d';
}

function numberToWords(num) {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const n = Math.floor(num);
  if (n === 0) return 'Zero Rupees Only';

  function formatThreeDigits(val) {
    let str = '';
    if (val > 99) {
      str += a[Math.floor(val / 100)] + 'Hundred ';
      val = val % 100;
    }
    if (val > 0) {
      if (str !== '') str += 'and ';
      if (val > 19) {
        str += b[Math.floor(val / 10)] + (val % 10 !== 0 ? '-' : '') + a[val % 10];
      } else {
        str += a[val];
      }
    }
    return str;
  }

  let words = '';
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const remaining = n % 1000;

  if (crore > 0) {
    words += formatThreeDigits(crore) + 'Crore ';
  }
  if (lakh > 0) {
    words += formatThreeDigits(lakh) + 'Lakh ';
  }
  if (thousand > 0) {
    words += formatThreeDigits(thousand) + 'Thousand ';
  }
  if (remaining > 0) {
    words += formatThreeDigits(remaining);
  }

  const paise = Math.round((num - n) * 100);
  let paiseWords = '';
  if (paise > 0) {
    paiseWords = ' and ' + formatThreeDigits(paise) + 'Paise';
  }

  return (words + 'Rupees' + paiseWords + ' Only').trim().replace(/\s+/g, ' ');
}

// API wrapper
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

// Session check
if (!token) {
  window.location.replace('/index.html');
} else {
  init();
}

function init() {
  setupTabs();
  setupListeners();
  setupLogout();

  // Check URL parameter for invoice ID redirect
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get('id');
  if (invoiceId) {
    viewInvoiceDetails(Number(invoiceId));
  } else {
    loadInvoices();
  }
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

// Tabs switching
function setupTabs() {
  tabsContainer.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });
}

function switchTab(tab) {
  activeTab = tab;
  tabsContainer.querySelectorAll('button').forEach((btn) => {
    btn.setAttribute('aria-selected', btn.dataset.tab === tab ? 'true' : 'false');
  });

  document.querySelector('#tab-list').style.display = tab === 'list' ? 'block' : 'none';
  document.querySelector('#tab-details').style.display = tab === 'details' ? 'block' : 'none';

  if (tab === 'list') {
    // Clear URL query parameters when going back to list
    window.history.pushState({}, document.title, window.location.pathname);
    loadInvoices();
  }
}

function setupListeners() {
  document.querySelector('#search-btn').addEventListener('click', () => {
    page = 1;
    loadInvoices();
  });

  document.querySelector('#prev-btn').addEventListener('click', () => {
    if (page > 1) {
      page--;
      loadInvoices();
    }
  });

  document.querySelector('#next-btn').addEventListener('click', () => {
    page++;
    loadInvoices();
  });

  document.querySelector('#print-action-btn').addEventListener('click', () => {
    window.print();
  });

  const cancelBtn = document.querySelector('#cancel-action-btn');
  const cancelModal = document.querySelector('#cancel-modal');
  const modalCloseBtn = document.querySelector('#cancel-modal-close-btn');
  const modalConfirmBtn = document.querySelector('#cancel-modal-confirm-btn');

  cancelBtn.addEventListener('click', () => {
    cancelModal.style.display = 'flex';
  });

  modalCloseBtn.addEventListener('click', () => {
    cancelModal.style.display = 'none';
  });

  modalConfirmBtn.addEventListener('click', async () => {
    if (!editingInvoiceId) return;
    modalConfirmBtn.disabled = true;
    try {
      await api(`/api/v1/invoices/${editingInvoiceId}/cancel`, {
        method: 'POST'
      });
      cancelModal.style.display = 'none';
      showMessage('Invoice cancelled successfully.');
      await viewInvoiceDetails(editingInvoiceId);
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      modalConfirmBtn.disabled = false;
    }
  });
}

// Load list
async function loadInvoices() {
  const searchQuery = document.querySelector('#search-query').value;
  const params = new URLSearchParams({
    page: String(page),
    pageSize: '10',
    search: searchQuery,
  });

  try {
    const res = await api(`/api/v1/invoices?${params}`);
    renderInvoicesTable(res.data);
    document.querySelector('#page-info').textContent = `Page ${page} of ${res.pagination.totalPages || 1} (Total: ${res.pagination.total})`;
  } catch (err) {
    showMessage(err.message, true);
  }
}

function renderInvoicesTable(rows) {
  const container = document.querySelector('#table-container');
  if (rows.length === 0) {
    container.innerHTML = '<p style="padding:10px; background:#f3f4f6; text-align:center;">No Invoices found.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Invoice No</th>
          <th>Date</th>
          <th>Customer ID</th>
          <th>Vehicle ID</th>
          <th>Grand Total</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach((row) => {
    html += `
      <tr>
        <td><strong>${row.invoice_number}</strong></td>
        <td>${row.invoice_date}</td>
        <td>Customer #${row.customer_id}</td>
        <td>Vehicle #${row.vehicle_id}</td>
        <td>Rs. ${Number(row.grand_total).toFixed(2)}</td>
        <td>
          <span class="badge badge-${row.status.toLowerCase()}">${row.status}</span>
        </td>
        <td>
          <button type="button" class="primary view-invoice-btn" data-id="${row.id}">View Invoice</button>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;

  container.querySelectorAll('.view-invoice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      viewInvoiceDetails(Number(btn.dataset.id));
    });
  });
}

// View Details
async function viewInvoiceDetails(id) {
  editingInvoiceId = id;
  detailsTabBtn.style.display = 'block';
  switchTab('details');

  try {
    // 1. Fetch invoice data (including items)
    const res = await api(`/api/v1/invoices/${id}`);
    const inv = res.data;

    // 2. Fetch Customer and Vehicle details to render complete headers
    let customerName = `Customer #${inv.customer_id}`;
    let customerPhone = '-';
    let customerAddress = '-';
    try {
      const custRes = await api(`/api/v1/customers/${inv.customer_id}`);
      customerName = custRes.data.name;
      customerPhone = custRes.data.phone;
      customerAddress = `${custRes.data.address || ''}, ${custRes.data.city || ''}`.trim().replace(/^,\s*/, '');
    } catch (e) {
      console.warn("Could not load customer header information");
    }

    let vehicleReg = `Vehicle #${inv.vehicle_id}`;
    let vehicleModel = '-';
    let vehicleEngine = '-';
    let vehicleChassis = '-';
    try {
      const vehRes = await api(`/api/v1/vehicles/${inv.vehicle_id}`);
      vehicleReg = vehRes.data.registration_number;
      vehicleModel = `${vehRes.data.make || ''} ${vehRes.data.model || ''}`.trim();
      vehicleEngine = vehRes.data.engine_number || '-';
      vehicleChassis = vehRes.data.chassis_number || '-';
    } catch (e) {
      console.warn("Could not load vehicle header information");
    }

    let company = {
      name: 'GOLDY AUTOMOBILE',
      address: 'Opp. Randhir Cinema, Kunjpura Road, KARNAL-132001',
      phone: '0184-2206673, 94160-30673',
      email: '',
      gstin: ''
    };
    try {
      const companyRes = await api('/api/v1/settings/company');
      company = companyRes.data;
    } catch (e) {
      console.warn("Could not load company settings details");
    }

    renderInvoiceSheet(inv, customerName, customerPhone, customerAddress, vehicleReg, vehicleModel, vehicleEngine, vehicleChassis, company);
    
    const cancelBtn = document.querySelector('#cancel-action-btn');
    if (inv.status === 'CANCELLED') {
      cancelBtn.style.display = 'none';
    } else {
      cancelBtn.style.display = 'inline-block';
    }
  } catch (err) {
    showMessage(err.message, true);
  }
}

function renderInvoiceSectionTable(items, sectionTitle) {
  if (items.length === 0) return '';

  let rowsHtml = '';
  let subtotal = 0;
  items.forEach((item, idx) => {
    const lineTotal = Number(item.line_total);
    subtotal += lineTotal;
    const unitPrice = Number(item.unit_price);
    const qty = Number(item.quantity);
    const taxableValue = unitPrice * qty;
    const gstRate = Number(item.gst_rate);
    const totalGst = lineTotal - taxableValue;
    
    const hsn = item.item_type === 'PART' 
      ? (item.hsn_code || '8708')
      : '9987';

    const displayDesc = String(item.description).startsWith('[Outside Job]')
      ? String(item.description).replace(/^\[Outside Job\]\s*/, '')
      : item.description;

    rowsHtml += `
      <tr>
        <td>${idx + 1}</td>
        <td>${displayDesc}</td>
        <td>${hsn}</td>
        <td>Rs. ${unitPrice.toFixed(2)}</td>
        <td>${qty}</td>
        <td>Rs. ${taxableValue.toFixed(2)}</td>
        <td>${gstRate}%</td>
        <td>Rs. ${totalGst.toFixed(2)}</td>
        <td><strong>Rs. ${lineTotal.toFixed(2)}</strong></td>
      </tr>
    `;
  });

  return `
    <h3 style="color:#0f766e; margin-top: 18px; margin-bottom: 8px; font-size:15px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">${sectionTitle}</h3>
    <table>
      <thead>
        <tr>
          <th style="width: 5%">#</th>
          <th>Description</th>
          <th style="width: 12%">HSN/SAC</th>
          <th style="width: 12%">Rate</th>
          <th style="width: 8%">Qty</th>
          <th style="width: 15%">Taxable Value</th>
          <th style="width: 10%">GST %</th>
          <th style="width: 12%">GST Amt</th>
          <th style="width: 15%">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr style="background: #f8fafc; font-weight: bold;">
          <td colspan="8" style="text-align: right; padding: 6px 9px;">${sectionTitle} Total:</td>
          <td style="padding: 6px 9px;">Rs. ${subtotal.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function renderInvoiceSheet(inv, custName, custPhone, custAddress, vehReg, vehModel, vehEngine, vehChassis, company) {
  // Split items
  const partsConsumption = [];
  const lubricants = [];
  const standardLabour = [];
  const outsideJobs = [];

  inv.items.forEach((item) => {
    if (item.item_type === 'PART') {
      partsConsumption.push(item);
    } else if (item.item_type === 'LUBRICANT') {
      lubricants.push(item);
    } else if (item.item_type === 'LABOR') {
      standardLabour.push(item);
    } else if (item.item_type === 'OUTSIDE_JOB') {
      outsideJobs.push(item);
    } else if (item.item_type === 'SERVICE') {
      standardLabour.push(item);
    }
  });

  const partsHtml = renderInvoiceSectionTable(partsConsumption, 'Parts Consumption');
  const lubricantsHtml = renderInvoiceSectionTable(lubricants, 'Lubricants');
  const outsideJobsHtml = renderInvoiceSectionTable(outsideJobs, 'Outside Jobs');
  const labourHtml = renderInvoiceSectionTable(standardLabour, 'Labour (In-House)');

  const sectionsHtml = partsHtml + lubricantsHtml + outsideJobsHtml + labourHtml;

  // Subtotals
  const partsTotal = partsConsumption.reduce((sum, item) => sum + Number(item.line_total), 0);
  const lubricantsTotal = lubricants.reduce((sum, item) => sum + Number(item.line_total), 0);
  const labourTotal = standardLabour.reduce((sum, item) => sum + Number(item.line_total), 0);
  const outsideJobTotal = outsideJobs.reduce((sum, item) => sum + Number(item.line_total), 0);

  // GST rates summary breakdown
  let gstBreakdownRows = '';
  const taxSummaries = {};
  inv.items.forEach((item) => {
    const rate = Number(item.gst_rate);
    const lineTotal = Number(item.line_total);
    const unitPrice = Number(item.unit_price);
    const qty = Number(item.quantity);
    const taxable = unitPrice * qty;
    const totalGst = lineTotal - taxable;

    if (!taxSummaries[rate]) {
      taxSummaries[rate] = { taxable: 0, gst: 0 };
    }
    taxSummaries[rate].taxable += taxable;
    taxSummaries[rate].gst += totalGst;
  });

  Object.entries(taxSummaries).forEach(([rate, data]) => {
    const halfGst = data.gst / 2;
    gstBreakdownRows += `
      <tr>
        <td>GST ${rate}%</td>
        <td>Rs. ${data.taxable.toFixed(2)}</td>
        <td>Rs. ${halfGst.toFixed(2)}</td>
        <td>Rs. ${halfGst.toFixed(2)}</td>
        <td>Rs. ${data.gst.toFixed(2)}</td>
      </tr>
    `;
  });

  // Check role to conditionally display P&L information (Admin role check)
  let profitSection = '';
  // Show profit metrics if present in the response
  if (inv.revenue !== undefined && inv.cost_total !== undefined) {
    profitSection = `
      <div class="profit-card">
        <h4>Profit & P&L Analysis (Internal Audit Only)</h4>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align: center;">
          <div>
            <div style="color:#64748b; font-size:12px;">Total Revenue</div>
            <strong>Rs. ${Number(inv.revenue).toFixed(2)}</strong>
          </div>
          <div>
            <div style="color:#64748b; font-size:12px;">Total Cost</div>
            <strong>Rs. ${Number(inv.cost_total).toFixed(2)}</strong>
          </div>
          <div>
            <div style="color:#16a34a; font-size:12px;">Gross Profit</div>
            <strong style="color:#16a34a;">Rs. ${Number(inv.gross_profit).toFixed(2)}</strong>
          </div>
          <div>
            <div style="color:#16a34a; font-size:12px;">Net Profit</div>
            <strong style="color:#16a34a;">Rs. ${Number(inv.net_profit).toFixed(2)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  const html = `
    <div class="invoice-header">
      <div class="invoice-company">
        <h2>${company.name || 'GOLDY AUTOMOBILE'}</h2>
        <div style="font-size: 13px; color:#475569; line-height: 1.4;">
          ${company.address || 'Opp. Randhir Cinema, Kunjpura Road, KARNAL-132001'}<br>
          ${company.gstin ? `GSTIN: ${company.gstin}<br>` : ''}
          Phone: ${company.phone || '0184-2206673, 94160-30673'}
        </div>
      </div>
      <div class="invoice-meta">
        <h3>TAX INVOICE</h3>
        <div style="font-size: 13px; color:#475569; line-height: 1.4;">
          <strong>Invoice No:</strong> ${inv.invoice_number}<br>
          <strong>Date:</strong> ${inv.invoice_date}<br>
          <strong>Status:</strong> <span style="font-weight:bold; color:${inv.status === 'COMPLETED' ? '#16a34a' : '#b91c1c'}">${inv.status}</span>
        </div>
      </div>
    </div>

    <div class="invoice-details-grid">
      <div>
        <strong>BILL TO:</strong><br>
        <strong>Name:</strong> ${custName}<br>
        <strong>Phone:</strong> ${custPhone}<br>
        <strong>Address:</strong> ${custAddress || 'N/A'}
      </div>
      <div>
        <strong>VEHICLE DETAILS:</strong><br>
        <strong>Registration No:</strong> ${vehReg}<br>
        <strong>Model:</strong> ${vehModel || 'N/A'}<br>
        <strong>Engine No:</strong> ${vehEngine || '-'}<br>
        <strong>Chassis No:</strong> ${vehChassis || '-'}<br>
        <strong>Odometer:</strong> ${inv.odometer_reading || '-'} km
      </div>
    </div>

    ${sectionsHtml}

    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 20px; page-break-inside: avoid;">
      <!-- Tax Summary Table -->
      <div style="flex: 1; margin-right: 20px;">
        <h4 style="margin: 0 0 6px; font-size:13px; color:#475569;">Tax Breakdown Summary</h4>
        <table style="font-size: 11px; margin-top:0;">
          <thead>
            <tr>
              <th>GST Rate</th>
              <th>Taxable Value</th>
              <th>CGST</th>
              <th>SGST</th>
              <th>Total Tax</th>
            </tr>
          </thead>
          <tbody>
            ${gstBreakdownRows}
          </tbody>
        </table>
      </div>

      <!-- Financial Totals -->
      <div class="invoice-totals">
        <table>
          <tbody>
            <tr>
              <td>Parts Total (inc. Tax):</td>
              <td style="text-align: right;">Rs. ${partsTotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Lubricants Total (inc. Tax):</td>
              <td style="text-align: right;">Rs. ${lubricantsTotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Labour Total (inc. Tax):</td>
              <td style="text-align: right;">Rs. ${labourTotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Outside Job Total (inc. Tax):</td>
              <td style="text-align: right;">Rs. ${outsideJobTotal.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 1px solid #cbd5e1;">
              <td>Taxable Amount Subtotal:</td>
              <td style="text-align: right;">Rs. ${Number(inv.subtotal).toFixed(2)}</td>
            </tr>
            <tr>
              <td>GST Total:</td>
              <td style="text-align: right;">Rs. ${Number(inv.gst_total).toFixed(2)}</td>
            </tr>
            <tr class="grand-total">
              <td>Grand Total (Net):</td>
              <td style="text-align: right;">Rs. ${Number(inv.grand_total).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Amount in Words -->
    <div style="margin-top: 12px; padding: 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; font-size: 13px; page-break-inside: avoid;">
      <strong>Total Amount in Words:</strong> <span style="text-transform: capitalize; color: #0f766e; font-weight: bold;">${numberToWords(inv.grand_total)}</span>
    </div>

    ${profitSection}

    <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 10px;">
      Thank you for your business! Drive safely.
    </div>
  `;

  invoiceSheet.innerHTML = html;
}
