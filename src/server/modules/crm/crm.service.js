import { AppError } from '../../shared/errors/AppError.js';
import { CrmRepository } from './crm.repository.js';

export class CrmService {
  constructor(db) {
    this.repository = new CrmRepository(db);
  }

  // 1. Loyalty Program
  registerMembership({ customerId, tier }) {
    const existing = this.repository.getMembershipByCustomerId(customerId);
    if (existing) {
      throw new AppError('Customer already registered in loyalty program.', 400, 'LOYALTY_MEMBER_EXISTS');
    }

    const joinedAt = new Date().toISOString().slice(0, 10);
    return this.repository.createMembership({
      customerId,
      tier: tier || 'Standard',
      joinedAt
    });
  }

  getMembership(customerId) {
    return this.repository.getMembershipByCustomerId(customerId);
  }

  adjustPoints(membershipId, points, transactionType, notes, userId) {
    const membership = this.repository.getMembershipById(membershipId);
    if (!membership) {
      throw new AppError('Loyalty membership not found.', 404, 'LOYALTY_MEMBER_NOT_FOUND');
    }

    const currentBalance = membership.points_balance || 0;
    const newBalance = currentBalance + points;

    if (newBalance < 0) {
      throw new AppError('Insufficient loyalty points balance.', 400, 'INSUFFICIENT_POINTS');
    }

    // SQLite Transaction encapsulation
    this.repository.updateMembershipPoints(membershipId, newBalance);
    this.repository.addLedgerEntry({
      membershipId,
      transactionType,
      points,
      notes,
      createdBy: userId
    });

    // Auto tier upgrades based on lifetime points accruals
    let nextTier = 'Standard';
    if (newBalance >= 10000) {
      nextTier = 'Platinum';
    } else if (newBalance >= 5000) {
      nextTier = 'Gold';
    } else if (newBalance >= 1000) {
      nextTier = 'Silver';
    }

    if (nextTier !== membership.tier) {
      this.repository.updateMembershipTier(membershipId, nextTier);
    }

    return { id: membershipId, pointsBalance: newBalance, tier: nextTier };
  }

  listMemberships() {
    return this.repository.listMemberships();
  }

  listHistory(membershipId) {
    return this.repository.getLedgerByMembershipId(membershipId);
  }

  // 2. Referrals
  generateReferralCode(customerId) {
    const code = `REF-${customerId}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    this.repository.createReferral({
      referrerId: customerId,
      referredId: null,
      referralCode: code,
      rewardPoints: 500 // 500 bonus points on referral
    });
    return code;
  }

  completeReferral(referralCode, referredCustomerId) {
    const referral = this.repository.getReferralByCode(referralCode);
    if (!referral) {
      throw new AppError('Invalid referral code.', 400, 'INVALID_REFERRAL_CODE');
    }

    if (referral.status !== 'PENDING') {
      throw new AppError('Referral code already claimed.', 400, 'REFERRAL_ALREADY_CLAIMED');
    }

    this.repository.updateReferralStatus(referral.id, 'COMPLETED');
    this.repository.db.prepare(`
      UPDATE customer_referrals
      SET referred_customer_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(referredCustomerId, referral.id);

    // Reward the referrer
    const referrerMembership = this.repository.getMembershipByCustomerId(referral.referrer_customer_id);
    if (referrerMembership) {
      this.adjustPoints(
        referrerMembership.id, 
        referral.reward_points, 
        'EARNED', 
        `Referral reward for code ${referralCode}`, 
        null
      );
    }
  }

  listReferrals() {
    return this.repository.listReferrals();
  }

  // 3. Promotions
  createPromotion(promoData) {
    const existing = this.repository.getPromotionByCode(promoData.code);
    if (existing) {
      throw new AppError('Promotion code already exists.', 400, 'PROMO_CODE_EXISTS');
    }

    this.repository.createPromotion(promoData);
  }

  evaluatePromotion(code, cartTotal, customerId) {
    const promo = this.repository.getPromotionByCode(code);
    if (!promo) {
      throw new AppError('Promotion code is invalid or expired.', 404, 'PROMO_INVALID');
    }

    const today = new Date().toISOString().slice(0, 10);
    if (today < promo.start_date || today > promo.end_date) {
      throw new AppError('Promotion has expired or is not yet active.', 400, 'PROMO_EXPIRED');
    }

    if (cartTotal < promo.min_purchase_amount) {
      throw new AppError(`Minimum purchase of ₹${promo.min_purchase_amount} is required to apply this code.`, 400, 'PROMO_MIN_PURCHASE');
    }

    // Check membership tier discount validation
    if (promo.target_tier) {
      const membership = this.repository.getMembershipByCustomerId(customerId);
      if (!membership || membership.tier !== promo.target_tier) {
        throw new AppError(`This promotion is exclusive to ${promo.target_tier} members.`, 403, 'PROMO_TIER_EXCLUSIVE');
      }
    }

    let discount = 0;
    if (promo.promo_type === 'PERCENTAGE') {
      discount = (cartTotal * promo.value) / 100;
      if (promo.max_discount_amount > 0 && discount > promo.max_discount_amount) {
        discount = promo.max_discount_amount;
      }
    } else {
      discount = promo.value;
    }

    return {
      code: promo.code,
      name: promo.name,
      promoType: promo.promo_type,
      discountAmount: Math.round(discount)
    };
  }

  listPromotions() {
    return this.repository.listPromotions();
  }

  // 4. Service Reminders
  scheduleReminder({ customerId, vehicleId, reminderType, dueDate, notes }) {
    this.repository.createReminder({
      customerId,
      vehicleId,
      reminderType,
      dueDate,
      notes
    });
  }

  listReminders() {
    const today = new Date().toISOString().slice(0, 10);
    return this.repository.getPendingReminders(today);
  }

  dismissReminder(id) {
    this.repository.updateReminderStatus(id, 'DISMISSED');
  }
}
export function createCrmService(db) {
  return new CrmService(db);
}
