/**
 * Controller layer for the Vehicle Service History module.
 * Maps incoming HTTP requests to the business service layer.
 */
export class ServiceHistoryController {
  /**
   * @param {import('./serviceHistory.service.js').ServiceHistoryService} serviceHistoryService - The injected service.
   */
  constructor(serviceHistoryService) {
    this.serviceHistoryService = serviceHistoryService;
  }

  /**
   * Handles GET /api/v1/vehicles/:vehicleId/service-history
   */
  getVehicleServiceHistory = (req, res, next) => {
    try {
      const vehicleId = Number(req.params.vehicleId);
      const result = this.serviceHistoryService.getVehicleServiceHistory(vehicleId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Handles GET /api/v1/customers/:customerId/service-history
   */
  getCustomerServiceHistory = (req, res, next) => {
    try {
      const customerId = Number(req.params.customerId);
      const result = this.serviceHistoryService.getCustomerServiceHistory(customerId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
