/* global document, HTMLSelectElement, HTMLInputElement, location */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function assertSmokeIsolation(env) {
  const root = process.env.GOLDY_SMOKE_ROOT;
  const nonce = process.env.GOLDY_SMOKE_NONCE;
  if (
    !root ||
    !nonce ||
    path.dirname(fs.realpathSync(root)) !== fs.realpathSync(os.tmpdir()) ||
    !path.basename(root).startsWith('gsm-') ||
    fs.readFileSync(path.join(root, '.goldy-smoke'), 'utf8') !== nonce ||
    path.resolve(env.dbFile) !== path.join(root, 'data', 'a.db') ||
    fs.realpathSync(path.dirname(env.dbFile)) !== path.join(root, 'data') ||
    fs.realpathSync(env.appDataPath) !== path.join(root, 'app') ||
    fs.existsSync(env.dbFile)
  )
    throw new Error('Smoke mode requires a new, owned temporary database and AppData folder.');
}

export function observeSmokeErrors(window) {
  const failures = [];
  window.webContents.session.webRequest.onCompleted((details) => {
    if (new URL(details.url).pathname.startsWith('/api/v1/') && details.statusCode >= 400)
      failures.push('api');
  });
  window.webContents.on('console-message', (_event, level) => {
    if (level === 3) failures.push('console');
  });
  window.webContents.on('did-fail-load', () => failures.push('load'));
  window.webContents.on('render-process-gone', () => failures.push('renderer'));
  return failures;
}

export async function runDesktopSmoke(window, backend, failures) {
  const execute = (fn, ...args) =>
    window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
  async function until(label, predicate, ...args) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (failures.length) throw new Error('Renderer runtime errors');
      if (await execute(predicate, ...args)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out at ${label}`);
  }
  function fill(id, value) {
    const input = document.getElementById(id);
    if (!input) throw new Error(`Missing form input ${id}`);
    const prototype =
      input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, String(value));
    input.dispatchEvent(
      new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
    );
  }
  function click(text) {
    const button = [...document.querySelectorAll('button')].find(
      (item) => item.textContent.trim() === text,
    );
    if (!button || button.disabled) throw new Error('Missing enabled action');
    button.click();
  }
  const hasText = (text) => document.body.textContent.includes(text);
  const username = 'smoke-owner';
  const password = `Smoke${randomUUID()}A1`;
  await until('administrator setup', hasText, 'Create your administrator account');
  await execute(fill, 'username-input', username);
  await execute(fill, 'password-input', password);
  await execute(click, 'Create administrator');
  await until('setup recovery code', () =>
    /GOLDY-(?:[A-Z0-9]{4}-){3}[A-Z0-9]{4}/.test(document.body.textContent),
  );
  const firstCode = await execute(
    () => document.body.textContent.match(/GOLDY-(?:[A-Z0-9]{4}-){3}[A-Z0-9]{4}/)[0],
  );
  await execute(click, 'Forgot password?');
  await execute(fill, 'recoveryCode-input', firstCode);
  await execute(fill, 'password-input', password);
  await execute(click, 'Reset password');
  await until(
    'rotated recovery code',
    (previous) => {
      const code = document.body.textContent.match(/GOLDY-(?:[A-Z0-9]{4}-){3}[A-Z0-9]{4}/)?.[0];
      return code && code !== previous;
    },
    firstCode,
  );
  await execute(fill, 'password-input', password);
  await execute(click, 'Sign In');
  await until('authenticated dashboard', hasText, 'Start something');
  console.log('SMOKE PASS: administrator setup, recovery and login');

  const { getDatabase } = await import('../server/database/connection.js');
  const { AuthService } = await import('../server/modules/auth/auth.service.js');
  const { AuthRepository } = await import('../server/modules/auth/auth.repository.js');
  const db = getDatabase();
  const auth = await new AuthService(new AuthRepository(db)).login({ username, password });
  async function request(route, body) {
    const response = await fetch(`${backend.url}/api/v1${route}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      throw new Error(`Synthetic API seed ${route} failed with status ${response.status}`);
    return response.json();
  }
  const customer = (
    await request('/customers', { name: 'Synthetic Smoke Customer', state: 'Haryana' })
  ).data;
  const item = (
    await request('/inventory/items', {
      sku: 'SMOKE-PART',
      item_name: 'Synthetic Spark Plug',
      purchase_cost: 100,
      selling_price: 150,
      gst_rate: 18,
    })
  ).data;
  const warehouse = (await request('/warehouses')).data[0];
  await request('/inventory/opening-stock', {
    item_id: item.id,
    warehouse_id: warehouse.id,
    quantity: 10,
    unit_cost: 100,
    batch_number: 'SMOKE-BATCH',
  });
  console.log('SMOKE PASS: synthetic customer and stock fixtures');
  await execute(() => {
    location.hash = '/sales-orders';
  });
  await until('sales order screen', hasText, 'Sales Orders & Bookings');
  await execute(click, 'Draft Order');
  await until('draft form', () =>
    Boolean(document.querySelector('input[aria-label="Search stock items"]')),
  );
  await execute(() => {
    const input = document.querySelector('input[aria-label="Search stock items"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      input,
      'SMOKE-PART',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (const [id, value] of [
    ['modal-order-customer', customer.id],
    ['modal-order-item', item.id],
    ['modal-order-warehouse', warehouse.id],
  ]) {
    await until(
      'record selector',
      (elementId, recordId) => {
        const select = document.getElementById(elementId);
        return (
          select &&
          !select.disabled &&
          [...select.options].some((option) => option.value === String(recordId))
        );
      },
      id,
      value,
    );
    await execute(fill, id, value);
  }
  await execute(fill, 'modal-order-qty', '2');
  await execute(click, 'Create Order');
  await until('draft order', hasText, 'DRAFT');
  await execute(() => {
    const row = [...document.querySelectorAll('tbody tr')].find((item) =>
      item.textContent.includes('Synthetic Smoke Customer'),
    );
    if (!row) throw new Error('Missing drafted order');
    row.click();
  });
  await until('order confirmation action', () =>
    [...document.querySelectorAll('button')].some(
      (button) => button.textContent.trim() === 'Confirm & Reserve Stock' && !button.disabled,
    ),
  );
  await execute(click, 'Confirm & Reserve Stock');
  await until('confirmed order', hasText, 'CONFIRMED');
  const order = db
    .prepare('SELECT id, status FROM sales_orders WHERE customer_id = ?')
    .get(customer.id);
  if (order?.status !== 'CONFIRMED') throw new Error('Sales order did not persist');
  const reserved = db
    .prepare(
      "SELECT COALESCE(SUM(quantity),0) AS quantity FROM inventory_reservations WHERE reference_id = ? AND reference_table = ? AND status = 'ACTIVE'",
    )
    .get(order.id, 'sales_orders');
  if (reserved.quantity !== 2) throw new Error('Confirmed order did not reserve stock');
  const inventoryMetrics = await request('/dashboard/inventory');
  if (inventoryMetrics.totalValuation !== 1000)
    throw new Error('Synthetic inventory valuation mismatch');
  console.log('SMOKE PASS: sales draft, confirmation and stock reservation');

  const screenshotDirectory = process.env.GOLDY_SMOKE_SCREENSHOTS;
  if (screenshotDirectory) {
    if (path.resolve(screenshotDirectory) !== path.resolve(process.cwd(), 'docs', 'images'))
      throw new Error('Unexpected smoke screenshot destination');
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await execute(() => {
      for (const button of document.querySelectorAll('.fixed.top-4.right-4 button')) button.click();
    });
    // DOM readiness precedes Chromium's compositor frame in a hidden window.
    await new Promise((resolve) => setTimeout(resolve, 500));
    fs.writeFileSync(
      path.join(screenshotDirectory, 'sales-orders.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
    await execute(() => {
      location.hash = '/';
    });
    await until('dashboard screenshot', hasText, 'Start something');
    await until(
      'loaded dashboard',
      () => !document.querySelector('div.animate-pulse[aria-hidden="true"]'),
    );
    await execute(() => document.querySelector('button[aria-label="Refresh data"]').click());
    await until('refreshed inventory value', () => {
      const label = [...document.querySelectorAll('span')].find(
        (element) => element.textContent === 'Stock value',
      );
      return label?.parentElement.textContent.includes('1,000');
    });
    await window.webContents.capturePage();
    await new Promise((resolve) => setTimeout(resolve, 500));
    fs.writeFileSync(
      path.join(screenshotDirectory, 'dashboard.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
    console.log('SMOKE PASS: synthetic dashboard and sales screenshots');
  }
  // Post through the actual React form, then check persisted totals and a previously cached dashboard.
  const supplier = (
    await request('/suppliers', { name: 'Synthetic Smoke Supplier', state: 'Haryana' })
  ).data;
  await execute(() => {
    location.hash = '/purchasing';
  });
  await until('purchasing receipt action', hasText, 'Record supplier invoice');
  await execute(click, 'Record supplier invoice');
  for (const [id, value] of [
    ['receipt-supplier', supplier.id],
    ['receipt-item-0', item.id],
    ['receipt-warehouse-0', warehouse.id],
  ]) {
    await until(
      'receipt selector',
      (id, value) => {
        const select = document.getElementById(id);
        return (
          select &&
          !select.disabled &&
          [...select.options].some((option) => option.value === String(value))
        );
      },
      id,
      value,
    );
    await execute(fill, id, value);
  }
  for (const [label, value] of [
    ['Supplier invoice number', 'SMOKE-RECEIPT'],
    ['Batch number (optional) 1', 'SMOKE-RECEIVED'],
    ['Quantity 1', '2'],
    ['Purchase cost 1', '100'],
    ['Selling price 1', '150'],
    ['GST rate (%) 1', '18'],
  ]) {
    await execute(
      (label, value) => {
        const field = [...document.querySelectorAll('label')]
          .find((node) => node.textContent.trim() === label)
          ?.querySelector('input');
        if (!field) throw new Error('Missing form input');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      },
      label,
      value,
    );
  }
  await execute(click, 'Save & update stock');
  await until('posted receipt', hasText, 'Receipt details SMOKE-RECEIPT');
  await until('receipt totals', hasText, '236.00');
  const receipt = db
    .prepare('SELECT * FROM purchase_receipts WHERE receipt_number = ?')
    .get('SMOKE-RECEIPT');
  if (
    receipt?.status !== 'POSTED' ||
    receipt.subtotal !== 200 ||
    receipt.gst_total !== 36 ||
    receipt.grand_total !== 236
  )
    throw new Error('Receipt persistence or tax totals mismatch');
  const quantity = db
    .prepare('SELECT SUM(quantity) AS quantity FROM inventory_batches WHERE item_id = ?')
    .get(item.id).quantity;
  if (quantity !== 12) throw new Error('Received stock quantity mismatch');
  await execute(() => {
    location.hash = '/';
  });
  await until('automatic dashboard inventory refresh', () => {
    const label = [...document.querySelectorAll('span')].find(
      (node) => node.textContent === 'Stock value',
    );
    return label?.parentElement.textContent.includes('1,200');
  });
  console.log(
    'SMOKE PASS: receipt posted with stock twelve, subtotal two hundred and tax thirty six',
  );
  console.log('SMOKE PASS: cached dashboard refreshed automatically after receipt');
  if (screenshotDirectory) {
    await execute(() => {
      location.hash = '/purchasing';
    });
    await until('receipt screenshot route', hasText, 'Purchase Receipts');
    await execute(click, 'Purchase Receipts');
    await until('receipt screenshot row', hasText, 'SMOKE-RECEIPT');
    await execute(click, 'SMOKE-RECEIPT');
    await until('receipt screenshot details', hasText, 'Receipt details SMOKE-RECEIPT');
    await until('receipt screenshot total', hasText, '236.00');
    await window.webContents.capturePage();
    await new Promise((resolve) => setTimeout(resolve, 500));
    fs.writeFileSync(
      path.join(screenshotDirectory, 'purchase-receipt.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
  }
  for (const [route, title] of [
    ['/inventory', 'Inventory'],
    ['/stock-verification', 'Stock verification'],
    ['/assets', 'Fixed assets'],
    ['/masters', 'Reference masters'],
    ['/purchasing', 'Procurement & Purchasing'],
    ['/invoices', 'Bills'],
    ['/supplier-ledger', 'Supplier ledger'],
    ['/service-history', 'Vehicle Service History'],
    ['/expenses', 'Workshop expenses'],
    ['/technicians', 'Technicians'],
    ['/settings', 'Settings & Utilities'],
    ['/reports', 'Reporting & Compliance Hub'],
  ]) {
    await execute((path) => {
      location.hash = path;
    }, route);
    await until(
      'migrated workshop screen',
      (heading) =>
        [...document.querySelectorAll('h1')].some((node) => node.textContent.trim() === heading),
      title,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (failures.length) throw new Error('Renderer runtime errors');
    console.log(`SMOKE PASS: migrated ${route}`);
  }
  await execute(() => {
    location.hash = '/inventory';
  });
  await until('inventory tools', hasText, 'Stock operations');
  for (const name of [
    'Stock operations',
    'Stock audit & reconciliation',
    'Reports',
    'Fixed assets',
  ]) {
    await execute(click, name);
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (failures.length) throw new Error('Renderer runtime errors');
  }
  await execute(() => {
    location.hash = '/reports';
  });
  await until('GST reports', hasText, 'GSTR-3B / Input tax credit');
  await execute(click, 'GSTR-3B / Input tax credit');
  await until('posted input tax report', hasText, 'Eligible input tax credit');
  await execute(click, 'HSN/SAC summary');
  await new Promise((resolve) => setTimeout(resolve, 350));
  console.log('SMOKE PASS: migrated workshop routes and API contracts');
  if (failures.length) throw new Error('Renderer runtime errors');
  console.log('SMOKE PASS: renderer runtime checks');
}
