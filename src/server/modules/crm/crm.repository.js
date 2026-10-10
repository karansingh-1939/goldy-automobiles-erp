export class CrmRepository {
  constructor(db) {
    this.db = db;
  }

  // 1. Loyalty Memberships
  createMembership({ customerId, tier, joinedAt, expiresAt }) {
    const stmt = this.db.prepare(`
      INSERT INTO loyalty_memberships (customer_id, tier, points_balance, joined_at, expires_at)
      VALUES (?, ?, 0, ?, ?)
    `);
    const info = stmt.run(customerId, tier || 'Standard', joinedAt, expiresAt || null);
    return this.getMembershipById(info.lastInsertRowid);
  }

  getMembershipById(id) {
    return this.db
      .prepare(
        `
      SELECT lm.*, c.name AS customer_name, c.phone AS customer_phone
      FROM loyalty_memberships lm
      JOIN customers c ON lm.customer_id = c.id
      WHERE lm.id = ?
    `,
      )
      .get(id);
  }

  getMembershipByCustomerId(customerId) {
    return this.db
      .prepare(
        `
      SELECT lm.*, c.name AS customer_name, c.phone AS customer_phone
      FROM loyalty_memberships lm
      JOIN customers c ON lm.customer_id = c.id
      WHERE lm.customer_id = ?
    `,
      )
      .get(customerId);
  }

  updateMembershipPoints(id, newBalance) {
    this.db
      .prepare(
        `
      UPDATE loyalty_memberships
      SET points_balance = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      )
      .run(newBalance, id);
  }

  updateMembershipTier(id, newTier) {
    this.db
      .prepare(
        `
      UPDATE loyalty_memberships
      SET tier = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      )
      .run(newTier, id);
  }

  listMemberships() {
    return this.db
      .prepare(
        `
      SELECT lm.*, c.name AS customer_name, c.phone AS customer_phone
      FROM loyalty_memberships lm
      JOIN customers c ON lm.customer_id = c.id
      ORDER BY lm.id DESC
    `,
      )
      .all();
  }

  // 2. Loyalty Ledger
  addLedgerEntry({ membershipId, transactionType, points, notes, createdBy }) {
    const stmt = this.db.prepare(`
      INSERT INTO loyalty_ledger (membership_id, transaction_type, points, notes, created_by)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(membershipId, transactionType, points, notes || null, createdBy || null);
  }

  getLedgerByMembershipId(membershipId) {
    return this.db
      .prepare(
        `
      SELECT ll.*, u.name AS creator_name
      FROM loyalty_ledger ll
      LEFT JOIN users u ON ll.created_by = u.id
      WHERE ll.membership_id = ?
      ORDER BY ll.id DESC
    `,
      )
      .all(membershipId);
  }

  // 3. Referrals
  createReferral({ referrerId, referredId, referralCode, rewardPoints }) {
    const stmt = this.db.prepare(`
      INSERT INTO customer_referrals (referrer_customer_id, referred_customer_id, referral_code, status, reward_points)
      VALUES (?, ?, ?, 'PENDING', ?)
    `);
    stmt.run(referrerId, referredId || null, referralCode, rewardPoints || 0);
  }

  getReferralByCode(code) {
    return this.db
      .prepare(
        `
      SELECT * FROM customer_referrals WHERE referral_code = ?
    `,
      )
      .get(code);
  }

  updateReferralStatus(id, status) {
    this.db
      .prepare(
        `
      UPDATE customer_referrals
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      )
      .run(status, id);
  }

  listReferrals() {
    return this.db
      .prepare(
        `
      SELECT cr.*, 
             c1.name AS referrer_name, c1.phone AS referrer_phone,
             c2.name AS referred_name, c2.phone AS referred_phone
      FROM customer_referrals cr
      JOIN customers c1 ON cr.referrer_customer_id = c1.id
      LEFT JOIN customers c2 ON cr.referred_customer_id = c2.id
      ORDER BY cr.id DESC
    `,
      )
      .all();
  }

  // 4. Promotions
  createPromotion({
    name,
    code,
    promoType,
    value,
    startDate,
    endDate,
    minPurchaseAmount,
    maxDiscountAmount,
    targetTier,
  }) {
    const stmt = this.db.prepare(`
      INSERT INTO promotions (name, code, promo_type, value, start_date, end_date, min_purchase_amount, max_discount_amount, target_tier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      name,
      code,
      promoType,
      value,
      startDate,
      endDate,
      minPurchaseAmount || 0,
      maxDiscountAmount || 0,
      targetTier || null,
    );
  }

  getPromotionByCode(code) {
    return this.db
      .prepare(
        `
      SELECT * FROM promotions WHERE code = ? AND is_active = 1
    `,
      )
      .get(code);
  }

  listPromotions() {
    return this.db
      .prepare(
        `
      SELECT * FROM promotions ORDER BY id DESC
    `,
      )
      .all();
  }

  // 5. Service Reminders
  createReminder({ customerId, vehicleId, reminderType, dueDate, notes }) {
    const stmt = this.db.prepare(`
      INSERT INTO service_reminders (customer_id, vehicle_id, reminder_type, due_date, status, notes)
      VALUES (?, ?, ?, ?, 'PENDING', ?)
    `);
    const result = stmt.run(customerId, vehicleId, reminderType, dueDate, notes || null);
    return this.getReminder(result.lastInsertRowid);
  }

  getReminder(id) {
    return this.db.prepare('SELECT * FROM service_reminders WHERE id = ?').get(id);
  }
  getVehicle(id) {
    return this.db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
  }

  getPendingReminders(asOfDate) {
    return this.db
      .prepare(
        `
      SELECT sr.*, 
             c.name AS customer_name, c.phone AS customer_phone,
             v.registration_number, v.make, v.model
      FROM service_reminders sr
      JOIN customers c ON sr.customer_id = c.id
      JOIN vehicles v ON sr.vehicle_id = v.id
      WHERE sr.status = 'PENDING' AND DATE(sr.due_date) <= DATE(?)
      ORDER BY sr.due_date ASC
    `,
      )
      .all(asOfDate);
  }

  updateReminderStatus(id, status) {
    this.db
      .prepare(
        `
      UPDATE service_reminders
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      )
      .run(status, id);
  }
}
