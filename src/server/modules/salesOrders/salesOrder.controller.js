import { SalesOrderService } from './salesOrder.service.js';

export class SalesOrderController {
  constructor(db) {
    this.service = new SalesOrderService(db);
  }

  // --- QUOTATIONS ---

  createQuotation = (req, res, next) => {
    try {
      const quotation = this.service.createQuotation(req.body || {}, req.user?.id);
      res.status(201).json({ data: quotation });
    } catch (error) {
      next(error);
    }
  };

  reviseQuotation = (req, res, next) => {
    try {
      const quotation = this.service.reviseQuotation(Number(req.params.id), req.body || {}, req.user?.id);
      res.status(201).json({ data: quotation });
    } catch (error) {
      next(error);
    }
  };

  getQuotation = (req, res, next) => {
    try {
      const quotation = this.service.repository.getQuotationById(Number(req.params.id));
      if (!quotation) {
        return res.status(404).json({ error: { message: 'Quotation not found.', code: 'NOT_FOUND' } });
      }
      res.status(200).json({ data: quotation });
    } catch (error) {
      next(error);
    }
  };

  listQuotations = (req, res, next) => {
    try {
      const { status, search, limit, offset } = req.query;
      const list = this.service.repository.listQuotations({
        status,
        search,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0
      });
      res.status(200).json({ data: list });
    } catch (error) {
      next(error);
    }
  };

  // --- SALES ORDERS ---

  createSalesOrder = (req, res, next) => {
    try {
      const order = this.service.createSalesOrder(req.body || {}, req.user?.id);
      res.status(201).json({ data: order });
    } catch (error) {
      next(error);
    }
  };

  convertQuotation = (req, res, next) => {
    try {
      const order = this.service.convertQuotationToSalesOrder(Number(req.params.id), req.body || {}, req.user?.id);
      res.status(201).json({ data: order });
    } catch (error) {
      next(error);
    }
  };

  getSalesOrder = (req, res, next) => {
    try {
      const order = this.service.repository.getSalesOrderById(Number(req.params.id));
      if (!order) {
        return res.status(404).json({ error: { message: 'Sales Order not found.', code: 'NOT_FOUND' } });
      }
      res.status(200).json({ data: order });
    } catch (error) {
      next(error);
    }
  };

  listSalesOrders = (req, res, next) => {
    try {
      const { status, customerId, limit, offset } = req.query;
      const list = this.service.repository.listSalesOrders({
        status,
        customerId,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0
      });
      res.status(200).json({ data: list });
    } catch (error) {
      next(error);
    }
  };

  confirmSalesOrder = (req, res, next) => {
    try {
      const order = this.service.confirmSalesOrder(Number(req.params.id), req.user?.id);
      res.status(200).json({ data: order });
    } catch (error) {
      next(error);
    }
  };

  createShipment = (req, res, next) => {
    try {
      const shipment = this.service.createShipment(Number(req.params.id), req.body || {}, req.user?.id);
      res.status(201).json({ data: shipment });
    } catch (error) {
      next(error);
    }
  };

  createInvoice = (req, res, next) => {
    try {
      const invoice = this.service.createInvoiceForShipment(Number(req.params.id), req.user?.id);
      res.status(201).json({ data: invoice });
    } catch (error) {
      next(error);
    }
  };

  cancelSalesOrder = (req, res, next) => {
    try {
      const order = this.service.cancelSalesOrder(Number(req.params.id), req.user?.id);
      res.status(200).json({ data: order });
    } catch (error) {
      next(error);
    }
  };

  // --- REPORTS ---

  reportOpenSalesOrders = (req, res, next) => {
    try {
      const list = this.service.getOpenSalesOrders();
      res.status(200).json({ data: list });
    } catch (error) {
      next(error);
    }
  };

  reportPendingFulfillments = (req, res, next) => {
    try {
      const list = this.service.getPendingFulfillments();
      res.status(200).json({ data: list });
    } catch (error) {
      next(error);
    }
  };

  reportConversionRate = (req, res, next) => {
    try {
      const metrics = this.service.getQuotationConversionRate();
      res.status(200).json({ data: metrics });
    } catch (error) {
      next(error);
    }
  };

  reportCustomerOrderHistory = (req, res, next) => {
    try {
      const history = this.service.getCustomerOrderHistory(Number(req.params.customerId));
      res.status(200).json({ data: history });
    } catch (error) {
      next(error);
    }
  };

  reportReservedStock = (req, res, next) => {
    try {
      const list = this.service.getReservedStock();
      res.status(200).json({ data: list });
    } catch (error) {
      next(error);
    }
  };

  reportOrderAging = (req, res, next) => {
    try {
      const aging = this.service.getOrderAging();
      res.status(200).json({ data: aging });
    } catch (error) {
      next(error);
    }
  };

  reportSalesPipeline = (req, res, next) => {
    try {
      const pipeline = this.service.getSalesPipeline();
      res.status(200).json({ data: pipeline });
    } catch (error) {
      next(error);
    }
  };
}
