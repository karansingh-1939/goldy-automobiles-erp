export class GstController {
  constructor(gstService) {
    this.gstService = gstService;
  }

  summary = async (req, res, next) => {
    try {
      res.status(200).json(this.gstService.summary(req.query));
    } catch (error) {
      next(error);
    }
  };

  gstr1 = async (req, res, next) => {
    try {
      res.status(200).json(this.gstService.gstr1(req.query));
    } catch (error) {
      next(error);
    }
  };

  gstr3b = async (req, res, next) => {
    try {
      res.status(200).json(this.gstService.gstr3b(req.query));
    } catch (error) {
      next(error);
    }
  };

  hsnSummary = async (req, res, next) => {
    try {
      res.status(200).json(this.gstService.hsnSummary(req.query));
    } catch (error) {
      next(error);
    }
  };

  getPeriodLocks = async (req, res, next) => {
    try {
      const companyId = 1; // default company
      const locks = this.gstService.getPeriodLocks(companyId);
      res.status(200).json({ status: 'success', data: locks });
    } catch (error) {
      next(error);
    }
  };

  updatePeriodLock = async (req, res, next) => {
    try {
      const companyId = 1; // default company
      const { taxPeriod, isLocked } = req.body;
      const userId = req.user.id;
      const lock = this.gstService.updatePeriodLock(companyId, taxPeriod, isLocked, userId);
      res.status(200).json({ status: 'success', data: lock });
    } catch (error) {
      next(error);
    }
  };
}
