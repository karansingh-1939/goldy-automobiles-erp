import { AppError } from '../../shared/errors/app-error.js';
import { calculateLinePricing } from './line-pricing.js';
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

export class QuotationService {
  constructor(repository) {
    this.repository = repository;
  }
  // --- QUOTATIONS ---

  createQuotation(payload, userId) {
    const {
      companyId = 1,
      customerId,
      quotationDate,
      validUntil,
      items,
      termsConditions,
      status = 'DRAFT',
      taxType = 'EXCLUSIVE',
    } = payload;

    if (
      !customerId ||
      !quotationDate ||
      !validUntil ||
      !items ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      throw new AppError('Customer, dates, and items are required.', 400, 'VALIDATION_ERROR');
    }

    const customer = this.repository.findCustomer(customerId);
    if (!customer) {
      throw new AppError('Customer not found.', 404, 'CUSTOMER_NOT_FOUND');
    }

    const quotationNumber = this.repository.generateDocNumber('QT');

    return this.repository.transaction(() => {
      let subtotal = 0;
      let gstTotal = 0;
      let discountAmount = 0;
      const processedItems = [];

      for (const item of items) {
        const itemDetails = this.repository.findPricedItem(item.itemId);
        if (!itemDetails) {
          throw new AppError(`Item ID ${item.itemId} not found.`, 404, 'INVENTORY_ITEM_NOT_FOUND');
        }

        const qty = Number(item.quantity);
        const unitPrice =
          item.unitPrice !== undefined ? Number(item.unitPrice) : Number(itemDetails.selling_price);
        const itemDiscount = Number(item.discountAmount || 0);
        const gstRate =
          item.gstRate !== undefined ? Number(item.gstRate) : Number(itemDetails.gst_rate);

        const pricing = calculateLinePricing(qty, unitPrice, itemDiscount, gstRate, taxType);

        subtotal += pricing.subtotal;
        gstTotal += pricing.gst;
        discountAmount += itemDiscount;

        processedItems.push({
          item_id: item.itemId,
          description: item.description || null,
          quantity: qty,
          unit_price: unitPrice,
          discount_amount: itemDiscount,
          gst_rate: gstRate,
          gst_amount: pricing.gst,
          line_total: pricing.total,
        });
      }

      const grandTotal = Math.round(subtotal + gstTotal);

      const quotation = {
        quotation_number: quotationNumber,
        revision_number: 0,
        company_id: companyId,
        customer_id: customerId,
        quotation_date: quotationDate,
        valid_until: validUntil,
        status,
        subtotal: roundMoney(subtotal),
        discount_amount: roundMoney(discountAmount),
        gst_total: roundMoney(gstTotal),
        grand_total: grandTotal,
        terms_conditions: termsConditions || null,
        created_by: userId,
        tax_type: taxType,
      };

      const quotationId = this.repository.createQuotation(quotation, processedItems);
      return this.repository.getQuotationById(quotationId);
    });
  }

  reviseQuotation(quotationId, payload, userId) {
    const existing = this.repository.getQuotationById(quotationId);
    if (!existing) {
      throw new AppError('Quotation not found.', 404, 'QUOTATION_NOT_FOUND');
    }

    const {
      quotationDate = existing.quotation_date,
      validUntil = existing.valid_until,
      items = existing.items,
      termsConditions = existing.terms_conditions,
      status = 'DRAFT',
      taxType = existing.tax_type,
    } = payload;

    return this.repository.transaction(() => {
      let subtotal = 0;
      let gstTotal = 0;
      let discountAmount = 0;
      const processedItems = [];

      for (const item of items) {
        const itemDetails = this.repository.findPricedItem(item.itemId || item.item_id);
        if (!itemDetails) {
          throw new AppError(
            `Item ID ${item.itemId || item.item_id} not found.`,
            404,
            'INVENTORY_ITEM_NOT_FOUND',
          );
        }

        const qty = Number(item.quantity);
        const unitPrice =
          item.unitPrice !== undefined
            ? Number(item.unitPrice)
            : item.unit_price !== undefined
              ? Number(item.unit_price)
              : Number(itemDetails.selling_price);
        const itemDiscount = Number(item.discountAmount || item.discount_amount || 0);
        const gstRate =
          item.gstRate !== undefined
            ? Number(item.gstRate)
            : item.gst_rate !== undefined
              ? Number(item.gst_rate)
              : Number(itemDetails.gst_rate);

        const pricing = calculateLinePricing(qty, unitPrice, itemDiscount, gstRate, taxType);

        subtotal += pricing.subtotal;
        gstTotal += pricing.gst;
        discountAmount += itemDiscount;

        processedItems.push({
          item_id: itemDetails.id,
          description: item.description || null,
          quantity: qty,
          unit_price: unitPrice,
          discount_amount: itemDiscount,
          gst_rate: gstRate,
          gst_amount: pricing.gst,
          line_total: pricing.total,
        });
      }

      const grandTotal = Math.round(subtotal + gstTotal);

      // Create new revision record, keeping quotation_number the same
      const revision = {
        quotation_number: existing.quotation_number,
        revision_number: existing.revision_number + 1,
        company_id: existing.company_id,
        customer_id: existing.customer_id,
        quotation_date: quotationDate,
        valid_until: validUntil,
        status,
        subtotal: roundMoney(subtotal),
        discount_amount: roundMoney(discountAmount),
        gst_total: roundMoney(gstTotal),
        grand_total: grandTotal,
        terms_conditions: termsConditions || null,
        created_by: userId,
        tax_type: taxType,
      };

      const newId = this.repository.createQuotation(revision, processedItems);

      // Update status of old revision to REJECTED (revised out)
      this.repository.updateQuotationStatus(existing.id, 'REJECTED');

      return this.repository.getQuotationById(newId);
    });
  }
}
