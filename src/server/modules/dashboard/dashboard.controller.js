export class DashboardController {
  constructor(dashboardService) {
    this.dashboardService = dashboardService;
  }

  getOperationsMetrics = (req, res, next) => {
    try {
      const result = this.dashboardService.getOperationsMetrics(req.query.date);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getFinancialMetrics = (req, res, next) => {
    try {
      const result = this.dashboardService.getFinancialMetrics(req.query.date);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getInventoryMetrics = (req, res, next) => {
    try {
      const result = this.dashboardService.getInventoryMetrics();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getSalesMetrics = (req, res, next) => {
    try {
      const result = this.dashboardService.getSalesMetrics(req.query.date);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
