import { localDate } from '../../shared/utils/local-date.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ProfitRepository } from './profit.repository.js';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function todayString() {
  return localDate();
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

  return String(period)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
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

  tallyExport(query = {}) {
    const filters = parseFilters(query);
    const exportType = query.type || 'sales';
    if (!['sales', 'all'].includes(exportType)) {
      throw new AppError('Tally export type must be sales or all.', 400, 'VALIDATION_ERROR');
    }

    const escapeXml = (unsafe) => {
      if (unsafe === undefined || unsafe === null) return '';
      return String(unsafe).replace(/[<>&'"]/g, (c) => {
        switch (c) {
          case '<':
            return '&lt;';
          case '>':
            return '&gt;';
          case '&':
            return '&amp;';
          case "'":
            return '&apos;';
          case '"':
            return '&quot;';
          default:
            return c;
        }
      });
    };

    let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
    xml += `<ENVELOPE>\n`;
    xml += `  <HEADER>\n`;
    xml += `    <TALLYREQUEST>Import Data</TALLYREQUEST>\n`;
    xml += `  </HEADER>\n`;
    xml += `  <BODY>\n`;
    xml += `    <IMPORTDATA>\n`;
    xml += `      <REQUESTDESC>\n`;
    xml += `        <REPORTNAME>Vouchers</REPORTNAME>\n`;
    xml += `        <STATICVARIABLES>\n`;
    xml += `          <SVCURRENTCOMPANY>GOLDY AUTOMOBILE</SVCURRENTCOMPANY>\n`;
    xml += `        </STATICVARIABLES>\n`;
    xml += `      </REQUESTDESC>\n`;
    xml += `      <REQUESTDATA>\n`;

    if (exportType === 'all') {
      const vouchers = this.repository.tallyExportAllVouchers(filters);
      vouchers.forEach((v) => {
        const dateFormatted = v.voucher_date ? v.voucher_date.replace(/-/g, '') : '';
        const partyName = escapeXml(
          v.entries.find((e) => e.entry_type === 'DEBIT')?.ledger_name ||
            v.entries[0]?.ledger_name ||
            'Suspense Ledger',
        );

        xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
        xml += `          <VOUCHER VCHTYPE="${escapeXml(v.voucher_type)}" ACTION="Create" OBJVIEW="AccountingVoucherView">\n`;
        xml += `            <DATE>${dateFormatted}</DATE>\n`;
        xml += `            <VOUCHERNUMBER>${escapeXml(v.voucher_number)}</VOUCHERNUMBER>\n`;
        xml += `            <PARTYLEDGERNAME>${partyName}</PARTYLEDGERNAME>\n`;
        xml += `            <EFFECTIVEDATE>${dateFormatted}</EFFECTIVEDATE>\n`;
        if (v.narration) {
          xml += `            <NARRATION>${escapeXml(v.narration)}</NARRATION>\n`;
        }

        v.entries.forEach((entry) => {
          const isDeemedPositive = entry.entry_type === 'DEBIT' ? 'Yes' : 'No';
          const amount =
            entry.entry_type === 'DEBIT'
              ? `-${Number(entry.amount).toFixed(2)}`
              : `${Number(entry.amount).toFixed(2)}`;

          xml += `            <ALLLEDGERENTRIES.LIST>\n`;
          xml += `              <LEDGERNAME>${escapeXml(entry.ledger_name)}</LEDGERNAME>\n`;
          xml += `              <ISDEEMEDPOSITIVE>${isDeemedPositive}</ISDEEMEDPOSITIVE>\n`;
          xml += `              <AMOUNT>${amount}</AMOUNT>\n`;
          if (entry.narration) {
            xml += `              <NARRATION>${escapeXml(entry.narration)}</NARRATION>\n`;
          }
          xml += `            </ALLLEDGERENTRIES.LIST>\n`;
        });

        xml += `          </VOUCHER>\n`;
        xml += `        </TALLYMESSAGE>\n`;
      });
    } else {
      const invoices = this.repository.tallyExport(filters);
      invoices.forEach((inv) => {
        const dateFormatted = inv.invoice_date ? inv.invoice_date.replace(/-/g, '') : '';
        const grandTotal = Number(inv.grand_total || 0).toFixed(2);
        const taxableAmount = Number(inv.taxable_amount || 0).toFixed(2);
        const cgstTotal = Number(inv.cgst_total || 0).toFixed(2);
        const sgstTotal = Number(inv.sgst_total || 0).toFixed(2);
        const igstTotal = Number(inv.igst_total || 0).toFixed(2);
        const partyName = escapeXml(inv.customer_name || 'Cash Customer');

        xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
        xml += `          <VOUCHER VCHTYPE="${inv.document_type === 'CREDIT_NOTE' ? 'Credit Note' : 'Sales'}" ACTION="Create" OBJVIEW="AccountingVoucherView">\n`;
        xml += `            <DATE>${dateFormatted}</DATE>\n`;
        xml += `            <VOUCHERNUMBER>${escapeXml(inv.invoice_number)}</VOUCHERNUMBER>\n`;
        xml += `            <PARTYLEDGERNAME>${partyName}</PARTYLEDGERNAME>\n`;
        xml += `            <EFFECTIVEDATE>${dateFormatted}</EFFECTIVEDATE>\n`;

        // Ledger entry 1: Party (Debit)
        xml += `            <ALLLEDGERENTRIES.LIST>\n`;
        xml += `              <LEDGERNAME>${partyName}</LEDGERNAME>\n`;
        xml += `              <ISDEEMEDPOSITIVE>${Number(grandTotal) >= 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n`;
        xml += `              <AMOUNT>${(-Number(grandTotal)).toFixed(2)}</AMOUNT>\n`;
        xml += `            </ALLLEDGERENTRIES.LIST>\n`;

        // Ledger entry 2: Sales (Credit)
        xml += `            <ALLLEDGERENTRIES.LIST>\n`;
        xml += `              <LEDGERNAME>Sales Account</LEDGERNAME>\n`;
        xml += `              <ISDEEMEDPOSITIVE>${Number(taxableAmount) >= 0 ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>\n`;
        xml += `              <AMOUNT>${taxableAmount}</AMOUNT>\n`;
        xml += `            </ALLLEDGERENTRIES.LIST>\n`;

        // Ledger entry 3: CGST (Credit)
        if (Number(cgstTotal) !== 0) {
          xml += `            <ALLLEDGERENTRIES.LIST>\n`;
          xml += `              <LEDGERNAME>CGST Ledger</LEDGERNAME>\n`;
          xml += `              <ISDEEMEDPOSITIVE>${Number(cgstTotal) >= 0 ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>\n`;
          xml += `              <AMOUNT>${cgstTotal}</AMOUNT>\n`;
          xml += `            </ALLLEDGERENTRIES.LIST>\n`;
        }

        // Ledger entry 4: SGST (Credit)
        if (Number(sgstTotal) !== 0) {
          xml += `            <ALLLEDGERENTRIES.LIST>\n`;
          xml += `              <LEDGERNAME>SGST Ledger</LEDGERNAME>\n`;
          xml += `              <ISDEEMEDPOSITIVE>${Number(sgstTotal) >= 0 ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>\n`;
          xml += `              <AMOUNT>${sgstTotal}</AMOUNT>\n`;
          xml += `            </ALLLEDGERENTRIES.LIST>\n`;
        }

        // Ledger entry 5: IGST (Credit)
        if (Number(igstTotal) !== 0) {
          xml += `            <ALLLEDGERENTRIES.LIST>\n`;
          xml += `              <LEDGERNAME>IGST Ledger</LEDGERNAME>\n`;
          xml += `              <ISDEEMEDPOSITIVE>${Number(igstTotal) >= 0 ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>\n`;
          xml += `              <AMOUNT>${igstTotal}</AMOUNT>\n`;
          xml += `            </ALLLEDGERENTRIES.LIST>\n`;
        }

        const roundOff = money(
          Number(grandTotal) -
            Number(taxableAmount) -
            Number(cgstTotal) -
            Number(sgstTotal) -
            Number(igstTotal),
        );
        if (roundOff !== 0) {
          xml += `            <ALLLEDGERENTRIES.LIST><LEDGERNAME>Round Off</LEDGERNAME><ISDEEMEDPOSITIVE>${roundOff > 0 ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE><AMOUNT>${roundOff.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>\n`;
        }
        xml += `          </VOUCHER>\n`;
        xml += `        </TALLYMESSAGE>\n`;
      });
    }

    xml += `      </REQUESTDATA>\n`;
    xml += `    </IMPORTDATA>\n`;
    xml += `  </BODY>\n`;
    xml += `</ENVELOPE>\n`;

    return xml;
  }
}

export function createProfitService(db) {
  return new ProfitService(db);
}
