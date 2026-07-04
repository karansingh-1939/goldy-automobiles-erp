const token = sessionStorage.getItem('goldy_auth_token');

// API call helper
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
    throw new Error(body.error?.message || 'Request failed.');
  }

  return body;
}

// Session check
if (!token) {
  window.location.replace('/index.html');
} else {
  init();
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const jcId = params.get('id');

  if (!jcId) {
    alert('No Job Card ID specified.');
    window.close();
    return;
  }

  setupListeners();

  try {
    // 1. Fetch Job Card details
    const jcRes = await api(`/api/v1/job-cards/${jcId}`);
    const jc = jcRes.data;

    // 2. Fetch Customer details
    let customer = { name: `Customer ID ${jc.customer_id}`, phone: '-', address: '-' };
    try {
      const custRes = await api(`/api/v1/customers/${jc.customer_id}`);
      customer = custRes.data;
    } catch (e) {
      console.warn('Could not load customer info for print preview', e);
    }

    // 3. Fetch Vehicle details
    let vehicle = { registration_number: `Vehicle ID ${jc.vehicle_id}`, make: '', model: '', variant: '' };
    try {
      const vehRes = await api(`/api/v1/vehicles/${jc.vehicle_id}`);
      vehicle = vehRes.data;
    } catch (e) {
      console.warn('Could not load vehicle info for print preview', e);
    }

    renderPrintLayout(jc, customer, vehicle);

    // 4. Fetch Company Details
    try {
      const companyRes = await api('/api/v1/settings/company');
      const company = companyRes.data;
      if (company.name) document.querySelector('#lbl-company-name').textContent = company.name;
      if (company.address) document.querySelector('#lbl-company-address').textContent = company.address;
      if (company.phone) document.querySelector('#lbl-company-contact').textContent = `Ph. : ${company.phone}`;
      if (company.jobCardTerms) document.querySelector('#lbl-terms').textContent = company.jobCardTerms;
    } catch (e) {
      console.warn('Could not load company settings, using defaults from HTML', e);
    }
  } catch (err) {
    alert(`Failed to load job card details: ${err.message}`);
    window.close();
  }
}

function setupListeners() {
  // Print button
  document.querySelector('#print-btn').addEventListener('click', () => {
    window.print();
  });

  // Download PDF button
  document.querySelector('#download-pdf-btn').addEventListener('click', () => {
    const tip = document.querySelector('#pdf-tip');
    tip.style.display = 'flex';
    setTimeout(() => {
      window.print();
    }, 100);
  });
}

function renderPrintLayout(jc, customer, vehicle) {
  // Set labels
  document.querySelector('#lbl-job-number').textContent = jc.job_card_number;
  document.querySelector('#lbl-job-date').textContent = new Date(jc.opened_at || jc.created_at).toLocaleDateString();
  document.querySelector('#lbl-job-status').textContent = jc.status;
  document.querySelector('#lbl-customer-name').textContent = customer.name;
  document.querySelector('#lbl-customer-phone').textContent = customer.phone;
  document.querySelector('#lbl-customer-address').textContent = [customer.address, customer.city, customer.state, customer.pincode]
    .filter(Boolean)
    .join(', ') || '-';

  document.querySelector('#lbl-vehicle-reg').textContent = vehicle.registration_number;
  document.querySelector('#lbl-vehicle-model').textContent = [vehicle.make, vehicle.model, vehicle.variant]
    .filter(Boolean)
    .join(' ') || '-';
  document.querySelector('#lbl-vehicle-odo').textContent = `${jc.odometer_reading} km`;
  document.querySelector('#lbl-vehicle-engine').textContent = vehicle.engine_number || '-';
  document.querySelector('#lbl-vehicle-chassis').textContent = vehicle.chassis_number || '-';
  document.querySelector('#lbl-fuel-level').textContent = jc.fuel_level || '-';
  document.querySelector('#lbl-promised-delivery').textContent = jc.promised_delivery_at 
    ? new Date(jc.promised_delivery_at).toLocaleString() 
    : '-';
  document.querySelector('#lbl-battery-brand').textContent = jc.battery_brand || '-';
  document.querySelector('#chk-toolkit').checked = !!jc.toolkit_present;
  document.querySelector('#chk-spare-wheel').checked = !!jc.spare_wheel_present;
  document.querySelector('#chk-jack').checked = !!jc.jack_present;
  document.querySelector('#chk-stereo').checked = !!jc.stereo_present;
  document.querySelector('#lbl-complaint').textContent = jc.complaint || 'No special complaint details provided.';
  document.querySelector('#lbl-diagnosis').textContent = jc.diagnosis || 'No workshop remarks recorded.';
  document.querySelector('#lbl-technician').textContent = jc.assigned_mechanic_name || 'Unassigned';

  // Filter Parts & Lubricants
  const partsList = jc.parts || [];
  const partsConsumption = partsList.filter((p) => p.item_type === 'PART');
  const lubricants = partsList.filter((p) => p.item_type === 'LUBRICANT');

  // Filter Labour & Outside Jobs
  const labourList = jc.labour || [];
  const standardLabour = labourList.filter((l) => !String(l.description).startsWith('[Outside Job]'));
  const outsideJobs = labourList.filter((l) => String(l.description).startsWith('[Outside Job]'));

  // Render lists
  renderPartsTable(partsConsumption, '#body-parts', '#print-parts-section');
  renderPartsTable(lubricants, '#body-lubricants', '#print-lubricants-section');
  renderLabourTable(standardLabour, '#body-labour', '#print-labour-section');
  renderLabourTable(outsideJobs, '#body-outside', '#print-outside-section');

  // Compute subtotals
  let partsTotal = 0;
  partsConsumption.forEach((p) => partsTotal += Number(p.line_total));

  let lubricantsTotal = 0;
  lubricants.forEach((p) => lubricantsTotal += Number(p.line_total));

  let labourTotal = 0;
  standardLabour.forEach((l) => {
    const charge = Number(l.labour_charge);
    const tax = charge * (Number(l.gst_rate) / 100);
    labourTotal += (charge + tax);
  });

  let outsideTotal = 0;
  outsideJobs.forEach((l) => {
    const charge = Number(l.labour_charge);
    const tax = charge * (Number(l.gst_rate) / 100);
    outsideTotal += (charge + tax);
  });

  const grandTotal = partsTotal + lubricantsTotal + labourTotal + outsideTotal;

  document.querySelector('#sum-parts').textContent = `Rs. ${partsTotal.toFixed(2)}`;
  document.querySelector('#sum-lubricants').textContent = `Rs. ${lubricantsTotal.toFixed(2)}`;
  document.querySelector('#sum-labour').textContent = `Rs. ${labourTotal.toFixed(2)}`;
  document.querySelector('#sum-outside').textContent = `Rs. ${outsideTotal.toFixed(2)}`;
  document.querySelector('#sum-grand').textContent = `Rs. ${grandTotal.toFixed(2)}`;
}

function renderPartsTable(items, tbodySelector, sectionSelector) {
  const tbody = document.querySelector(tbodySelector);
  const section = document.querySelector(sectionSelector);

  if (items.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  tbody.innerHTML = '';

  items.forEach((item, index) => {
    const tr = document.createElement('tr');
    const sellingPrice = Number(item.selling_price);
    const qty = Number(item.quantity);
    const gstRate = Number(item.gst_rate);
    const lineTotal = Number(item.line_total);
    const taxVal = sellingPrice * qty;
    const gstAmt = lineTotal - taxVal;

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${item.sku || '-'}</td>
      <td>${item.description}</td>
      <td class="number-col">${qty}</td>
      <td class="number-col">Rs. ${sellingPrice.toFixed(2)}</td>
      <td class="number-col">Rs. ${gstAmt.toFixed(2)} (${gstRate}%)</td>
      <td class="number-col"><strong>Rs. ${lineTotal.toFixed(2)}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderLabourTable(items, tbodySelector, sectionSelector) {
  const tbody = document.querySelector(tbodySelector);
  const section = document.querySelector(sectionSelector);

  if (items.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  tbody.innerHTML = '';

  items.forEach((item, index) => {
    const tr = document.createElement('tr');
    const charge = Number(item.labour_charge);
    const gstRate = Number(item.gst_rate);
    const taxAmt = charge * (gstRate / 100);
    const total = charge + taxAmt;
    const displayDesc = String(item.description).startsWith('[Outside Job]')
      ? String(item.description).replace(/^\[Outside Job\]\s*/, '')
      : item.description;

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${displayDesc}</td>
      <td class="number-col">Rs. ${charge.toFixed(2)}</td>
      <td class="number-col">Rs. ${taxAmt.toFixed(2)} (${gstRate}%)</td>
      <td class="number-col"><strong>Rs. ${total.toFixed(2)}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}
