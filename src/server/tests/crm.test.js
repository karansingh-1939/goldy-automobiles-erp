import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';

async function login(context) {
  const result = await context.request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: 'admin',
      password: 'Admin@12345',
    }),
  });
  assert.equal(result.response.status, 200);
  return result.body.token;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

test('CRM Loyalty, Referrals, Promotions and Reminders E2E Workflow', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const headers = authHeaders(token);

    // 1. Insert dummy customer (no is_active column)
    context.db.prepare(`
      INSERT INTO customers (name, phone)
      VALUES (?, ?)
    `).run('Test CRM Customer', '9999999999');

    const customer = context.db.prepare("SELECT id, name FROM customers WHERE name = ?").get('Test CRM Customer');
    assert.ok(customer);

    // 2. Register loyalty membership
    const loyaltyReg = await context.request('/api/v1/crm/loyalty', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: customer.id,
        tier: 'Standard'
      })
    });
    assert.equal(loyaltyReg.response.status, 201, JSON.stringify(loyaltyReg.body));
    const membership = loyaltyReg.body.data;
    assert.equal(membership.tier, 'Standard');
    assert.equal(membership.points_balance, 0);

    // 3. Adjust points manuals - Accumulate 1500 points (Silver Tier Upgrade threshold!)
    const pointsAdjust = await context.request(`/api/v1/crm/loyalty/${membership.id}/adjust`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        points: 1500,
        notes: 'Manual welcome bonus adjustment',
        transactionType: 'MANUAL_ADJUSTMENT'
      })
    });
    assert.equal(pointsAdjust.response.status, 200);
    assert.equal(pointsAdjust.body.data.pointsBalance, 1500);
    assert.equal(pointsAdjust.body.data.tier, 'Silver');

    // 4. Generate referral code
    const refResult = await context.request('/api/v1/crm/referrals', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: customer.id
      })
    });
    assert.equal(refResult.response.status, 201);
    assert.ok(refResult.body.data.referralCode);

    // 5. Create promotional code campaign
    const promoResult = await context.request('/api/v1/crm/promotions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Silver Special 10%',
        code: 'SILVER10',
        promoType: 'PERCENTAGE',
        value: 10,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        minPurchaseAmount: 1000,
        maxDiscountAmount: 500,
        targetTier: 'Silver'
      })
    });
    assert.equal(promoResult.response.status, 201);

    // 6. Evaluate promotional coupon code
    const promoEval = await context.request(`/api/v1/crm/promotions/evaluate?code=SILVER10&cartTotal=3000&customerId=${customer.id}`, {
      method: 'GET',
      headers
    });
    assert.equal(promoEval.response.status, 200, JSON.stringify(promoEval.body));
    assert.equal(promoEval.body.data.discountAmount, 300); // 10% of 3000

    // 7. Insert dummy vehicle (no is_active column)
    context.db.prepare(`
      INSERT INTO vehicles (customer_id, registration_number, make, model)
      VALUES (?, ?, ?, ?)
    `).run(customer.id, 'DL3CA1234', 'Hyundai', 'i20');

    const vehicle = context.db.prepare("SELECT id FROM vehicles WHERE registration_number = ?").get('DL3CA1234');
    assert.ok(vehicle);

    // Schedule reminder (due_date in the past relative to current local time so it is due!)
    context.db.prepare(`
      INSERT INTO service_reminders (customer_id, vehicle_id, reminder_type, due_date, status, notes)
      VALUES (?, ?, 'MAINTENANCE', '2026-07-01', 'PENDING', 'Scheduled 6 months inspection')
    `).run(customer.id, vehicle.id);

    // Fetch upcoming reminders
    const reminders = await context.request('/api/v1/crm/reminders', {
      method: 'GET',
      headers
    });
    assert.equal(reminders.response.status, 200);
    assert.ok(reminders.body.data.length >= 1);

    // Dismiss reminder check
    const dismissRes = await context.request(`/api/v1/crm/reminders/${reminders.body.data[0].id}/dismiss`, {
      method: 'POST',
      headers
    });
    assert.equal(dismissRes.response.status, 200);

  } finally {
    await context.close();
  }
});
