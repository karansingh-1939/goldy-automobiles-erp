const token = sessionStorage.getItem('goldy_auth_token');
const message = document.querySelector('#message');
const searchForm = document.querySelector('#search-form');
const searchQuery = document.querySelector('#search-query');
const searchResults = document.querySelector('#search-results');
const noSelectionView = document.querySelector('#no-selection-view');
const historyView = document.querySelector('#history-view');

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

  // Check if we have vehicle ID in URL to preload
  const params = new URLSearchParams(window.location.search);
  const vehicleId = params.get('vehicleId');
  if (vehicleId) {
    loadVehicleServiceHistory(Number(vehicleId));
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
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await searchVehicles();
  });
}

async function searchVehicles() {
  showMessage('');
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.innerHTML =
      '<li style="text-align:center; color:#64748b; cursor:default; background:none;">Enter query to search...</li>';
    return;
  }

  try {
    searchResults.innerHTML =
      '<li style="text-align:center; color:#64748b; cursor:default; background:none;">Searching...</li>';

    // Search vehicles via masters endpoint
    const res = await api(`/api/v1/vehicles?search=${encodeURIComponent(query)}&pageSize=50`);
    const vehicles = res.data;

    if (vehicles.length === 0) {
      searchResults.innerHTML =
        '<li style="text-align:center; color:#dc2626; cursor:default; background:none;">No vehicles found.</li>';
      return;
    }

    searchResults.innerHTML = '';

    // Query each vehicle's owner to show name
    for (const veh of vehicles) {
      let ownerName = 'Loading...';
      try {
        const cust = await api(`/api/v1/customers/${veh.customer_id}`);
        ownerName = cust.data.name;
      } catch (err) {
        ownerName = `Customer #${veh.customer_id}`;
      }

      const li = document.createElement('li');
      li.dataset.id = veh.id;
      li.innerHTML = `
        <span class="reg-no">${veh.registration_number}</span>
        <span class="sub">${veh.make || ''} ${veh.model || ''} - ${ownerName}</span>
      `;

      li.addEventListener('click', () => {
        searchResults.querySelectorAll('li').forEach((item) => item.classList.remove('selected'));
        li.classList.add('selected');
        loadVehicleServiceHistory(veh.id);
      });

      searchResults.appendChild(li);
    }
  } catch (err) {
    showMessage(err.message, true);
    searchResults.innerHTML = `<li style="text-align:center; color:#dc2626; cursor:default; background:none;">Error: ${err.message}</li>`;
  }
}

async function loadVehicleServiceHistory(vehicleId) {
  showMessage('');
  noSelectionView.style.display = 'none';
  historyView.style.display = 'block';

  try {
    const res = await api(`/api/v1/vehicles/${vehicleId}/service-history`);
    const data = res.data;

    // Render Vehicle Header details
    document.querySelector('#detail-reg').textContent = data.vehicle.registration_number;
    document.querySelector('#detail-owner-name').textContent = data.customer
      ? data.customer.name
      : 'N/A';
    document.querySelector('#detail-owner-phone').textContent = data.customer
      ? data.customer.phone
      : 'N/A';
    document.querySelector('#detail-model').textContent =
      `${data.vehicle.make || ''} ${data.vehicle.model || ''} ${data.vehicle.variant || ''}`.trim() ||
      'N/A';
    document.querySelector('#detail-engine-no').textContent = data.vehicle.engine_number || '-';
    document.querySelector('#detail-chassis-no').textContent = data.vehicle.chassis_number || '-';
    document.querySelector('#detail-fuel-year').textContent =
      `${data.vehicle.fuel_type || 'N/A'} / ${data.vehicle.year || 'N/A'}`;

    // Render Summary metrics
    document.querySelector('#sum-visits').textContent = data.summary.totalVisits;
    document.querySelector('#sum-revenue').textContent =
      `Rs. ${Number(data.summary.totalRevenue || 0).toFixed(2)}`;
    document.querySelector('#sum-last-date').textContent = data.summary.lastVisitDate
      ? data.summary.lastVisitDate
      : '-';

    // Render chronological Timeline
    renderTimeline(data.history);
  } catch (err) {
    showMessage(err.message, true);
    noSelectionView.innerHTML = `<h3 style="color:#dc2626;">Failed to load service history: ${err.message}</h3>`;
    noSelectionView.style.display = 'block';
    historyView.style.display = 'none';
  }
}

function renderTimeline(history) {
  const container = document.querySelector('#timeline-container');
  if (!history || history.length === 0) {
    container.innerHTML =
      '<p style="padding:20px; background:#f8fafc; text-align:center; color:#64748b; border-radius:6px;">No maintenance visits recorded for this vehicle.</p>';
    return;
  }

  let html = '';

  history.forEach((visit) => {
    // Services table rows
    let servicesRows = '';
    if (visit.services && visit.services.length > 0) {
      visit.services.forEach((s, idx) => {
        servicesRows += `
          <tr>
            <td>${idx + 1}</td>
            <td><strong>${s.description}</strong></td>
            <td>${s.quantity}</td>
            <td>Rs. ${Number(s.unitPrice).toFixed(2)}</td>
            <td><strong>Rs. ${Number(s.lineTotal).toFixed(2)}</strong></td>
          </tr>
        `;
      });
    }

    // Parts table rows
    let partsRows = '';
    if (visit.parts && visit.parts.length > 0) {
      visit.parts.forEach((p, idx) => {
        partsRows += `
          <tr>
            <td>${idx + 1}</td>
            <td><strong>${p.description}</strong></td>
            <td>${p.quantity}</td>
            <td>Rs. ${Number(p.unitPrice).toFixed(2)}</td>
            <td><strong>Rs. ${Number(p.lineTotal).toFixed(2)}</strong></td>
          </tr>
        `;
      });
    }

    html += `
      <div class="timeline-item">
        <div class="timeline-date">${visit.serviceDate ? visit.serviceDate : 'Draft Visit'}</div>
        <div class="timeline-details">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed #cbd5e1; padding-bottom:8px; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
            <div style="font-size:13px; line-height:1.4;">
              <strong>Job Card:</strong> ${visit.jobCardNumber} 
              <span class="badge badge-${(visit.jobCardStatus || '').toLowerCase()}">${visit.jobCardStatus}</span>
              ${visit.invoiceNumber ? `<br><strong>Invoice No:</strong> ${visit.invoiceNumber} <span class="badge badge-${(visit.invoiceStatus || '').toLowerCase()}">${visit.invoiceStatus}</span>` : ''}
            </div>
            <div style="text-align:right; font-size:13px;">
              <strong>Odometer:</strong> ${visit.odometerReading || '-'} km<br>
              <strong>Visit Total:</strong> <span style="color:#0f766e; font-weight:bold;">Rs. ${Number(visit.invoiceTotal || 0).toFixed(2)}</span>
            </div>
          </div>

          ${
            servicesRows
              ? `
            <div style="margin-bottom:12px;">
              <h5 style="margin:0 0 4px 0; color:#475569; font-size:12px; text-transform:uppercase;">Services & Labour Billed</h5>
              <table>
                <thead>
                  <tr>
                    <th style="width:5%">#</th>
                    <th>Service Description</th>
                    <th style="width:10%">Qty</th>
                    <th style="width:20%">Rate</th>
                    <th style="width:20%">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${servicesRows}
                </tbody>
              </table>
            </div>
          `
              : ''
          }

          ${
            partsRows
              ? `
            <div>
              <h5 style="margin:0 0 4px 0; color:#475569; font-size:12px; text-transform:uppercase;">Parts & Lubricants Replaced</h5>
              <table>
                <thead>
                  <tr>
                    <th style="width:5%">#</th>
                    <th>Item Description</th>
                    <th style="width:10%">Qty</th>
                    <th style="width:20%">Rate</th>
                    <th style="width:20%">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${partsRows}
                </tbody>
              </table>
            </div>
          `
              : ''
          }

          ${!servicesRows && !partsRows ? '<p style="margin:0; font-size:12px; color:#64748b; font-style:italic;">No services or parts billed in this visit.</p>' : ''}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}
