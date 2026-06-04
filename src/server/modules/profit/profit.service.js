import { AppError } from '../../shared/errors/AppError.js';
import { ProfitRepository } from './profit.repository.js';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonth(dateText) {
  return `${dateText.slice(0, 7)}-01`;
}

function firstDayOfYear(dateText) {
  return `${dateText.slice(0, 4)}-01-01`;
}

function normalizePeriod(period) {
  if (!period) {
    return null;
  }

  return String(period).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeDate(value, label) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = String(value).trim();
  if (!isoDatePattern.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00.000Z`))) {
    throw new AppError(`${label} must be a valid YYYY-MM-DD date.`, 400, 'VALIDATION_ERROR');
  }

  return date;
}

function parseFilters(query = {}) {
  const period = normalizePeriod(query.period);
  const today = todayString();
  let dateFrom = normalizeDate(query.dateFrom ?? query.from, 'Date from');
  let dateTo = normalizeDate(query.dateTo ?? query.to, 'Date to');

  if (period === 'today') {
    dateFrom = today;
    dateTo = today;
  } else if (period === 'this_month') {
    dateFrom = firstDayOfMonth(today);
    dateTo = today;
  } else if (period === 'this_year') {
    dateFrom = firstDayOfYear(today);
    dateTo = today;
  } else if (period === 'custom') {
    if (!dateFrom || !dateTo) {
      throw new AppError('Custom range requires dateFrom and dateTo.', 400, 'VALIDATION_ERROR');
    }
  } else if (period) {
    throw new AppError('Profit report period is invalid.', 400, 'VALIDATION_ERROR');
  }

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new AppError('Date range is invalid.', 400, 'VALIDATION_ERROR');
  }

  return {
    period,
    dateFrom,
    dateTo,
  };
}

function totalsRow(row) {
  const revenue = money(row.revenue);
  const cost = money(row.cost);
  const grossProfit = money(row.gross_profit ?? row.profit ?? revenue - cost);
  const totalExpenses = money(row.total_expenses ?? row.expenses);

  return {
    totalRevenue: revenue,
    totalCost: cost,
    grossProfit,
    totalExpenses,
    netProfit: money(grossProfit - totalExpenses),
  };
}

export class ProfitService {
  constructor(db) {
    this.repository = new ProfitRepository(db);
  }

  summary(query = {}) {
    const filters = parseFilters(query);
    return {
      filters,
      data: totalsRow(this.repository.summary(filters)),
    };
  }

  byMonth(query = {}) {
    const filters = parseFilters(query);
    const profitRows = this.repository.profitByMonth(filters);
    const expenseRows = this.repository.expensesByMonth(filters);
    const months = new Map();

    for (const row of profitRows) {
      months.set(row.month, {
        month: row.month,
        revenue: money(row.revenue),
        cost: money(row.cost),
        grossProfit: money(row.gross_profit),
        expenses: 0,
      });
    }

    for (const row of expenseRows) {
      const existing = months.get(row.month) || {
        month: row.month,
        revenue: 0,
        cost: 0,
        grossProfit: 0,
        expenses: 0,
      };
      existing.expenses = money(row.expenses);
      months.set(row.month, existing);
    }

    const data = [...months.values()]
      .sort((left, right) => left.month.localeCompare(right.month))
      .map((row) => ({
        ...row,
        netProfit: money(row.grossProfit - row.expenses),
      }));

    return { filters, data };
  }

  byCustomer(query = {}) {
    const filters = parseFilters(query);
    return {
      filters,
      data: this.repository.profitByCustomer(filters).map((row) => ({
        customerId: row.customer_id,
        customer: row.customer,
        revenue: money(row.revenue),
        cost: money(row.cost),
        profit: money(row.profit),
      })),
    };
  }

  byVehicle(query = {}) {
    const filters = parseFilters(query);
    return {
      filters,
      data: this.repository.profitByVehicle(filters).map((row) => ({
        vehicleId: row.vehicle_id,
        vehicle: row.vehicle,
        customer: row.customer,
        revenue: money(row.revenue),
        cost: money(row.cost),
        profit: money(row.profit),
      })),
    };
  }

  byInventoryItem(query = {}) {
    const filters = parseFilters(query);
    return {
      filters,
      data: this.repository.profitByInventoryItem(filters).map((row) => ({
        itemId: row.item_id,
        sku: row.sku,
        item: row.item,
        revenue: money(row.revenue),
        cost: money(row.cost),
        profit: money(row.profit),
      })),
    };
  }

  byMechanic(query = {}) {
    const filters = parseFilters(query);
    return {
      filters,
      data: this.repository.profitByMechanic(filters).map((row) => ({
        mechanicId: row.mechanic_id,
        mechanic: row.mechanic,
        revenue: money(row.revenue),
        cost: money(row.cost),
        profit: money(row.profit),
      })),
    };
  }
}

export function createProfitService(db) {
  return new ProfitService(db);
}
