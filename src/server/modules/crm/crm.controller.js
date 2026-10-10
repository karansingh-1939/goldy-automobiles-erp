export class CrmController {
  constructor(crmService) {
    this.crmService = crmService;
  }

  registerLoyalty = (req, res, next) => {
    try {
      const result = this.crmService.registerMembership(req.body);
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };

  getLoyalty = (req, res, next) => {
    try {
      const result = this.crmService.getMembership(Number(req.params.customerId));
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };

  adjustLoyaltyPoints = (req, res, next) => {
    try {
      const { points, notes, transactionType } = req.body;
      const result = this.crmService.adjustPoints(
        Number(req.params.id),
        Number(points),
        transactionType || 'MANUAL_ADJUSTMENT',
        notes,
        req.user?.id,
      );
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };

  listLoyalties = (req, res, next) => {
    try {
      const result = this.crmService.listMemberships();
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };

  getLoyaltyHistory = (req, res, next) => {
    try {
      const result = this.crmService.listHistory(Number(req.params.id));
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };

  generateReferral = (req, res, next) => {
    try {
      const result = this.crmService.generateReferralCode(Number(req.body.customerId));
      res.status(201).json({ status: 'success', data: { referralCode: result } });
    } catch (error) {
      next(error);
    }
  };

  completeReferral = (req, res, next) => {
    try {
      this.crmService.completeReferral(req.body.referralCode, Number(req.body.referredCustomerId));
      res.status(200).json({ status: 'success', message: 'Referral processed successfully.' });
    } catch (error) {
      next(error);
    }
  };

  listReferrals = (req, res, next) => {
    try {
      const result = this.crmService.listReferrals();
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };

  createPromotion = (req, res, next) => {
    try {
      this.crmService.createPromotion(req.body);
      res.status(201).json({ status: 'success', message: 'Promotion created.' });
    } catch (error) {
      next(error);
    }
  };

  evaluatePromotion = (req, res, next) => {
    try {
      const { code, cartTotal, customerId } = req.query;
      const result = this.crmService.evaluatePromotion(code, Number(cartTotal), Number(customerId));
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };

  listPromotions = (req, res, next) => {
    try {
      const result = this.crmService.listPromotions();
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };

  listReminders = (req, res, next) => {
    try {
      const result = this.crmService.listReminders();
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };

  dismissReminder = (req, res, next) => {
    try {
      this.crmService.dismissReminder(Number(req.params.id));
      res.status(200).json({ status: 'success', message: 'Reminder dismissed.' });
    } catch (error) {
      next(error);
    }
  };
}
