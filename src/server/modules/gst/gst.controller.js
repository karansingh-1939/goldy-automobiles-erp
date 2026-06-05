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
}
