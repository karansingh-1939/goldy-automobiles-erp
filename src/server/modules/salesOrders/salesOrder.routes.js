import { Router } from 'express';
import { SalesOrderController } from './salesOrder.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authMiddleware.js';

export function createSalesOrdersRouter(db, authService) {
  const router = Router();
  const controller = new SalesOrderController(db);

  // Authentication and JSON payload middlewares applied globally for this module
  router.use(authenticate(authService));

  // --- REPORT ENDPOINTS (register specific paths first to avoid param matching conflicts) ---
  router.get('/reports/open', requirePermission('sales_orders.read'), controller.reportOpenSalesOrders);
  router.get('/reports/pending-fulfillment', requirePermission('sales_orders.read'), controller.reportPendingFulfillments);
  router.get('/reports/conversion-rate', requirePermission('sales_orders.read'), controller.reportConversionRate);
  router.get('/reports/customer-history/:customerId', requirePermission('sales_orders.read'), controller.reportCustomerOrderHistory);
  router.get('/reports/reserved-stock', requirePermission('sales_orders.read'), controller.reportReservedStock);
  router.get('/reports/aging', requirePermission('sales_orders.read'), controller.reportOrderAging);
  router.get('/reports/pipeline', requirePermission('sales_orders.read'), controller.reportSalesPipeline);

  // --- QUOTATION ENDPOINTS ---
  router.get('/quotations', requirePermission('sales_orders.read'), controller.listQuotations);
  router.get('/quotations/:id', requirePermission('sales_orders.read'), controller.getQuotation);
  router.post('/quotations', requirePermission('sales_orders.write'), controller.createQuotation);
  router.post('/quotations/:id/revise', requirePermission('sales_orders.write'), controller.reviseQuotation);
  router.post('/quotations/:id/convert', requirePermission('sales_orders.write'), controller.convertQuotation);

  // --- SALES ORDER ENDPOINTS ---
  router.get('/', requirePermission('sales_orders.read'), controller.listSalesOrders);
  router.get('/:id', requirePermission('sales_orders.read'), controller.getSalesOrder);
  router.post('/', requirePermission('sales_orders.write'), controller.createSalesOrder);
  router.post('/:id/confirm', requirePermission('sales_orders.confirm'), controller.confirmSalesOrder);
  router.post('/:id/fulfill', requirePermission('sales_orders.fulfill'), controller.createShipment);
  router.post('/:id/cancel', requirePermission('sales_orders.write'), controller.cancelSalesOrder);

  // --- SHIPMENT / INVOICING ENDPOINTS ---
  router.post('/shipments/:id/invoice', requirePermission('sales_orders.fulfill'), controller.createInvoice);

  return router;
}
