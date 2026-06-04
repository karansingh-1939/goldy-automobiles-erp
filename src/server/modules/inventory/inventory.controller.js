export class InventoryController {
  constructor(inventoryService) {
    this.inventoryService = inventoryService;
  }

  listItems = (req, res, next) => {
    try {
      res.status(200).json(this.inventoryService.listItems(req.query));
    } catch (error) {
      next(error);
    }
  };

  getItem = (req, res, next) => {
    try {
      res.status(200).json({ data: this.inventoryService.getItem(Number(req.params.id)) });
    } catch (error) {
      next(error);
    }
  };

  createItem = (req, res, next) => {
    try {
      const item = this.inventoryService.createItem(req.body || {}, req.user?.id);
      res.status(201).json({ data: item });
    } catch (error) {
      next(error);
    }
  };

  updateItem = (req, res, next) => {
    try {
      const item = this.inventoryService.updateItem(Number(req.params.id), req.body || {}, req.user?.id);
      res.status(200).json({ data: item });
    } catch (error) {
      next(error);
    }
  };

  createOpeningStock = (req, res, next) => {
    try {
      res.status(201).json({ data: this.inventoryService.createOpeningStock(req.body || {}, req.user?.id) });
    } catch (error) {
      next(error);
    }
  };

  createAdjustment = (req, res, next) => {
    try {
      res.status(201).json({ data: this.inventoryService.createAdjustment(req.body || {}, req.user?.id) });
    } catch (error) {
      next(error);
    }
  };

  transferStock = (req, res, next) => {
    try {
      res.status(201).json({ data: this.inventoryService.transferStock(req.body || {}, req.user?.id) });
    } catch (error) {
      next(error);
    }
  };

  stockSummary = (req, res, next) => {
    try {
      res.status(200).json(this.inventoryService.stockSummary());
    } catch (error) {
      next(error);
    }
  };

  stockValuation = (req, res, next) => {
    try {
      res.status(200).json(this.inventoryService.stockValuation());
    } catch (error) {
      next(error);
    }
  };

  movements = (req, res, next) => {
    try {
      res.status(200).json(this.inventoryService.movementReport(req.query));
    } catch (error) {
      next(error);
    }
  };

  lowStock = (req, res, next) => {
    try {
      res.status(200).json(this.inventoryService.lowStockReport());
    } catch (error) {
      next(error);
    }
  };

  expiringStock = (req, res, next) => {
    try {
      res.status(200).json(this.inventoryService.expiringStockReport(req.query));
    } catch (error) {
      next(error);
    }
  };
}
