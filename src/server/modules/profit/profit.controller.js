export class ProfitController {
  constructor(profitService) {
    this.profitService = profitService;
  }

  summary = (req, res, next) => {
    try {
      res.status(200).json(this.profitService.summary(req.query));
    } catch (error) {
      next(error);
    }
  };

  byMonth = (req, res, next) => {
    try {
      res.status(200).json(this.profitService.byMonth(req.query));
    } catch (error) {
      next(error);
    }
  };

  byCustomer = (req, res, next) => {
    try {
      res.status(200).json(this.profitService.byCustomer(req.query));
    } catch (error) {
      next(error);
    }
  };

  byVehicle = (req, res, next) => {
    try {
      res.status(200).json(this.profitService.byVehicle(req.query));
    } catch (error) {
      next(error);
    }
  };

  byInventoryItem = (req, res, next) => {
    try {
      res.status(200).json(this.profitService.byInventoryItem(req.query));
    } catch (error) {
      next(error);
    }
  };

  byMechanic = (req, res, next) => {
    try {
      res.status(200).json(this.profitService.byMechanic(req.query));
    } catch (error) {
      next(error);
    }
  };
}
