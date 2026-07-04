export class InventoryController {
  constructor(inventoryService) {
    this.inventoryService = inventoryService;
  }

  listItems = (req, res, next) => {
    try {
      const result = this.inventoryService.listItems(req.query);
      res.status(200).json(result);
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

  getItemBatches = (req, res, next) => {
    try {
      res.status(200).json({ data: this.inventoryService.getItemBatches(Number(req.params.id)) });
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
      res.status(200).json(this.inventoryService.stockValuation(req.query));
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

  seedStarter = (req, res, next) => {
    try {
      const result = this.inventoryService.seedStarter(req.user?.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getSeedStatus = (req, res, next) => {
    try {
      const result = this.inventoryService.getSeedStatus();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  listFixedAssets = (req, res, next) => {
    try {
      res.status(200).json(this.inventoryService.listFixedAssets(req.query));
    } catch (error) {
      next(error);
    }
  };

  createFixedAsset = (req, res, next) => {
    try {
      const asset = this.inventoryService.createFixedAsset(req.body || {}, req.user?.id);
      res.status(201).json({ data: asset });
    } catch (error) {
      next(error);
    }
  };

  listStockVerifications = (req, res, next) => {
    try {
      res.status(200).json(this.inventoryService.listStockVerifications(req.query));
    } catch (error) {
      next(error);
    }
  };

  verifyStock = (req, res, next) => {
    try {
      const result = this.inventoryService.verifyStock(req.body || {}, req.user?.id);
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  dashboardStats = (req, res, next) => {
    try {
      res.status(200).json(this.inventoryService.dashboardStats());
    } catch (error) {
      next(error);
    }
  };

  bulkSave = (req, res, next) => {
    try {
      const result = this.inventoryService.bulkSave(req.body || {}, req.user?.id);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  receiveTransfer = (req, res, next) => {
    try {
      const result = this.inventoryService.receiveTransfer(Number(req.params.id), req.body || {}, req.user?.id);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  cancelTransfer = (req, res, next) => {
    try {
      const result = this.inventoryService.cancelTransfer(Number(req.params.id), req.user?.id);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  getWarehousePermissions = (req, res, next) => {
    try {
      const result = this.inventoryService.getWarehousePermissions(Number(req.params.id));
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  saveWarehousePermissions = (req, res, next) => {
    try {
      const result = this.inventoryService.saveWarehousePermissions(Number(req.params.id), req.body || {});
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  approveVerification = (req, res, next) => {
    try {
      const result = this.inventoryService.approveVerification(Number(req.params.id), req.user?.id);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  rejectVerification = (req, res, next) => {
    try {
      const result = this.inventoryService.rejectVerification(Number(req.params.id), req.user?.id);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  reserveStock = (req, res, next) => {
    try {
      const result = this.inventoryService.reserveStock(req.body || {}, req.user?.id);
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  cancelReservation = (req, res, next) => {
    try {
      const result = this.inventoryService.cancelReservation(Number(req.params.id), req.user?.id);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  reconcileInventory = (req, res, next) => {
    try {
      const companyId = 1;
      const result = this.inventoryService.reconcileInventory(companyId);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };
}
