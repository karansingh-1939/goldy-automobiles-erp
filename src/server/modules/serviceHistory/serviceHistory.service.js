import { AppError } from '../../shared/errors/AppError.js';
import { ServiceHistoryRepository } from './serviceHistory.repository.js';

/**
 * Service layer for the Vehicle Service History module.
 * Aggregates visits data, filters parts vs. labor lines, and calculates revenue summaries.
 */
export class ServiceHistoryService {
  /**
   * @param {import('better-sqlite3').Database} db - The SQLite database instance.
   */
  constructor(db) {
    this.repository = new ServiceHistoryRepository(db);
  }

  /**
   * Generates the complete maintenance history timeline for a single vehicle.
   * 
   * @param {number} vehicleId - Target vehicle ID
   * @returns {object} The vehicle service history DTO
   */
  getVehicleServiceHistory(vehicleId) {
    const vehicle = this.repository.getVehicleById(vehicleId);
    if (!vehicle) {
      throw new AppError('Vehicle not found.', 404, 'ITEM_NOT_FOUND');
    }

    const customer = this.repository.getCustomerById(vehicle.customerId);

    // 1. Fetch all basic visits logs (Job Card + optional Invoice)
    const visits = this.repository.getServiceVisitsByVehicleId(vehicleId);

    // Extract unique IDs for bulk loading (eliminates N+1 query loops)
    const invoiceIds = [];
    const jobCardIds = [];

    for (const v of visits) {
      if (v.invoiceId) {
        invoiceIds.push(v.invoiceId);
      }
      jobCardIds.push(v.jobCardId);
    }

    // 2. Bulk load billing and work items
    const bulkInvoiceItems = this.repository.getBulkInvoiceItems(invoiceIds);
    const bulkJobCardItems = this.repository.getBulkJobCardItems(jobCardIds);

    // Index items in-memory by ID
    const invoiceItemsMap = new Map();
    for (const item of bulkInvoiceItems) {
      if (!invoiceItemsMap.has(item.invoiceId)) {
        invoiceItemsMap.set(item.invoiceId, []);
      }
      invoiceItemsMap.get(item.invoiceId).push(item);
    }

    const jobCardItemsMap = new Map();
    for (const item of bulkJobCardItems) {
      if (!jobCardItemsMap.has(item.jobCardId)) {
        jobCardItemsMap.set(item.jobCardId, []);
      }
      jobCardItemsMap.get(item.jobCardId).push(item);
    }

    // 3. Assemble chronological history DTO
    let totalRevenue = 0;
    const history = [];

    for (const v of visits) {
      // If invoice exists and is finalized or cancelled, load items from invoice lines.
      // Otherwise (draft invoice or uninvoiced), fallback to job card items.
      const useInvoice = v.invoiceId && (v.invoiceStatus === 'FINALIZED' || v.invoiceStatus === 'CANCELLED');
      const itemsList = useInvoice
        ? (invoiceItemsMap.get(v.invoiceId) || [])
        : (jobCardItemsMap.get(v.jobCardId) || []);

      const services = [];
      const parts = [];

      for (const item of itemsList) {
        const itemDto = {
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal
        };

        if (item.itemType === 'PART' || item.itemType === 'LUBRICANT') {
          parts.push(itemDto);
        } else {
          // 'LABOR', 'SERVICE', and 'OUTSIDE_JOB' items belong to services list
          services.push(itemDto);
        }
      }

      // Calculate date reference (defaults to job card creation date if invoice date is missing)
      const serviceDate = v.invoiceDate || (v.openedAt ? v.openedAt.slice(0, 10) : null);

      // Financial calculations: Cancelled or draft invoices do not contribute to revenue
      const isFinalized = v.invoiceStatus === 'FINALIZED';
      if (isFinalized) {
        totalRevenue += v.invoiceTotal;
      }

      history.push({
        serviceDate,
        jobCardNumber: v.jobCardNumber,
        invoiceNumber: v.invoiceNumber,
        jobCardStatus: v.jobCardStatus,
        invoiceStatus: v.invoiceStatus,
        odometerReading: v.odometerReading,
        services,
        parts,
        invoiceTotal: v.invoiceTotal
      });
    }

    const totalVisits = visits.length;
    const lastVisitDate = history[0]?.serviceDate || null;

    return {
      vehicle,
      customer,
      summary: {
        totalVisits,
        totalRevenue,
        lastVisitDate
      },
      history
    };
  }

  /**
   * Generates service history for all vehicles owned by a customer.
   * 
   * @param {number} customerId - Target customer ID
   * @returns {object} The customer service history DTO
   */
  getCustomerServiceHistory(customerId) {
    const customer = this.repository.getCustomerById(customerId);
    if (!customer) {
      throw new AppError('Customer not found.', 404, 'ITEM_NOT_FOUND');
    }

    const vehicles = this.repository.getVehiclesByCustomerId(customerId);
    const vehicleHistories = [];

    for (const vehicle of vehicles) {
      const historyData = this.getVehicleServiceHistory(vehicle.id);
      vehicleHistories.push({
        vehicle: historyData.vehicle,
        summary: historyData.summary,
        history: historyData.history
      });
    }

    return {
      customer,
      vehicles: vehicleHistories
    };
  }
}

/**
 * Service instantiation helper
 * @param {import('better-sqlite3').Database} db 
 * @returns {ServiceHistoryService}
 */
export function createServiceHistoryService(db) {
  return new ServiceHistoryService(db);
}
