import { AppError } from '../../shared/errors/app-error.js';

/**
 * Helper to round financial values safely to 2 decimal places.
 * @param {number} val - Input float
 * @returns {number} Rounded float
 */
function roundMoney(val) {
  return Math.round(val * 100) / 100;
}

/**
 * Service to generate GAAP-compliant financial statements and ledger statements.
 * Executes balance aggregation directly from database journals.
 */
export class AccountingReportService {
  /**
   * @param {object} db - Database connection instance
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Generates a Trial Balance as of a specific date.
   *
   * @param {number} companyId - Active company ID
   * @param {string} asOfDate - Date in YYYY-MM-DD format
   * @returns {object} Trial Balance report including individual ledgers and debit/credit totals
   */
  getTrialBalance(companyId, asOfDate) {
    if (!asOfDate || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      throw new AppError(
        'As-of date in YYYY-MM-DD format is required.',
        400,
        'REPORT_INVALID_DATE',
      );
    }

    const query = `
      SELECT 
        l.id AS ledger_id,
        l.name AS ledger_name,
        l.nature AS ledger_nature,
        l.opening_balance,
        ag.name AS group_name,
        ag.nature AS group_nature,
        COALESCE(SUM(CASE WHEN v.id IS NOT NULL AND je.entry_type = 'DEBIT' THEN je.amount ELSE 0 END), 0) AS total_debit,
        COALESCE(SUM(CASE WHEN v.id IS NOT NULL AND je.entry_type = 'CREDIT' THEN je.amount ELSE 0 END), 0) AS total_credit
      FROM ledgers l
      JOIN account_groups ag ON l.group_id = ag.id
      LEFT JOIN journal_entries je ON je.ledger_id = l.id
      LEFT JOIN vouchers v ON je.voucher_id = v.id AND v.voucher_date <= ? AND v.company_id = ? AND v.status <> 'CANCELLED'
      WHERE l.company_id = ?
      GROUP BY l.id
      ORDER BY ag.nature, ag.name, l.name
    `;

    const rows = this.db.prepare(query).all(asOfDate, companyId, companyId);

    const ledgers = [];
    let grandDebitTotal = 0;
    let grandCreditTotal = 0;

    for (const row of rows) {
      const {
        ledger_id,
        ledger_name,
        ledger_nature,
        opening_balance,
        group_name,
        group_nature,
        total_debit,
        total_credit,
      } = row;

      let netBalance = 0;
      let balanceType = 'DEBIT';

      if (ledger_nature === 'Debit') {
        netBalance = opening_balance + total_debit - total_credit;
      } else {
        netBalance = opening_balance + total_credit - total_debit;
      }

      const absoluteBalance = roundMoney(Math.abs(netBalance));

      if (netBalance >= 0) {
        balanceType = ledger_nature === 'Debit' ? 'DEBIT' : 'CREDIT';
      } else {
        balanceType = ledger_nature === 'Debit' ? 'CREDIT' : 'DEBIT';
      }

      if (balanceType === 'DEBIT') {
        grandDebitTotal += absoluteBalance;
      } else {
        grandCreditTotal += absoluteBalance;
      }

      ledgers.push({
        ledgerId: ledger_id,
        ledgerName: ledger_name,
        groupName: group_name,
        groupNature: group_nature,
        openingBalance: roundMoney(opening_balance),
        debits: roundMoney(total_debit),
        credits: roundMoney(total_credit),
        balance: absoluteBalance,
        balanceType,
      });
    }

    return {
      asOfDate,
      ledgers,
      totals: {
        debits: roundMoney(grandDebitTotal),
        credits: roundMoney(grandCreditTotal),
        isBalanced: Math.abs(grandDebitTotal - grandCreditTotal) < 0.01,
      },
    };
  }

  /**
   * Generates a Profit & Loss statement for a date range.
   *
   * @param {number} companyId - Active company ID
   * @param {string} startDate - Date in YYYY-MM-DD
   * @param {string} endDate - Date in YYYY-MM-DD
   * @returns {object} P&L statement including revenues, expenses, gross profit, and net profit
   */
  getProfitLoss(companyId, startDate, endDate) {
    if (
      !startDate ||
      !endDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ) {
      throw new AppError(
        'Start and end dates in YYYY-MM-DD format are required.',
        400,
        'REPORT_INVALID_DATE',
      );
    }

    const query = `
      SELECT 
        l.id AS ledger_id,
        l.name AS ledger_name,
        ag.name AS group_name,
        ag.nature AS group_nature,
        COALESCE(SUM(CASE WHEN v.id IS NOT NULL AND je.entry_type = 'DEBIT' THEN je.amount ELSE 0 END), 0) AS period_debit,
        COALESCE(SUM(CASE WHEN v.id IS NOT NULL AND je.entry_type = 'CREDIT' THEN je.amount ELSE 0 END), 0) AS period_credit
      FROM ledgers l
      JOIN account_groups ag ON l.group_id = ag.id
      LEFT JOIN journal_entries je ON je.ledger_id = l.id
      LEFT JOIN vouchers v ON je.voucher_id = v.id AND v.voucher_date >= ? AND v.voucher_date <= ? AND v.company_id = ? AND v.status <> 'CANCELLED'
      WHERE l.company_id = ? AND ag.nature IN ('Revenue', 'Expense')
      GROUP BY l.id
      ORDER BY ag.nature, l.name
    `;

    const rows = this.db.prepare(query).all(startDate, endDate, companyId, companyId);

    const revenues = [];
    const expenses = [];
    let grossRevenue = 0;
    let cogs = 0;
    let totalIndirectExpenses = 0;

    for (const row of rows) {
      const { ledger_id, ledger_name, group_name, group_nature, period_debit, period_credit } = row;

      if (group_nature === 'Revenue') {
        const netRev = period_credit - period_debit; // Credits increase Revenue
        const amt = roundMoney(netRev);
        if (amt !== 0) {
          revenues.push({ ledgerId: ledger_id, ledgerName: ledger_name, amount: amt });
          grossRevenue += amt;
        }
      } else if (group_nature === 'Expense') {
        const netExp = period_debit - period_credit; // Debits increase Expense
        const amt = roundMoney(netExp);
        if (amt !== 0) {
          expenses.push({
            ledgerId: ledger_id,
            ledgerName: ledger_name,
            groupName: group_name,
            amount: amt,
          });
          if (ledger_name === 'Cost of Goods Sold' || group_name === 'Direct Expenses') {
            cogs += amt;
          } else {
            totalIndirectExpenses += amt;
          }
        }
      }
    }

    const grossProfit = roundMoney(grossRevenue - cogs);
    const netProfit = roundMoney(grossProfit - totalIndirectExpenses);

    return {
      period: { startDate, endDate },
      revenue: {
        items: revenues,
        total: roundMoney(grossRevenue),
      },
      costOfGoodsSold: roundMoney(cogs),
      grossProfit,
      expenses: {
        items: expenses,
        total: roundMoney(totalIndirectExpenses),
      },
      netProfit,
    };
  }

  /**
   * Generates a Balance Sheet as of a specific date.
   *
   * @param {number} companyId - Active company ID
   * @param {string} asOfDate - Date in YYYY-MM-DD
   * @returns {object} Balance Sheet statement verifying Assets = Liabilities + Equity
   */
  getBalanceSheet(companyId, asOfDate) {
    if (!asOfDate || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      throw new AppError(
        'As-of date in YYYY-MM-DD format is required.',
        400,
        'REPORT_INVALID_DATE',
      );
    }

    // 1. Calculate dynamic Retained Earnings (cumulative P&L from inception up to target date)
    const retainedQuery = `
      SELECT 
        (
          SELECT COALESCE(SUM(CASE WHEN je.entry_type = 'CREDIT' THEN je.amount ELSE -je.amount END), 0)
          FROM journal_entries je
          JOIN vouchers v ON je.voucher_id = v.id AND v.voucher_date <= ? AND v.company_id = ? AND v.status <> 'CANCELLED'
          JOIN ledgers l ON je.ledger_id = l.id
          JOIN account_groups ag ON l.group_id = ag.id
          WHERE l.company_id = ? AND ag.nature = 'Revenue'
        ) - (
          SELECT COALESCE(SUM(CASE WHEN je.entry_type = 'DEBIT' THEN je.amount ELSE -je.amount END), 0)
          FROM journal_entries je
          JOIN vouchers v ON je.voucher_id = v.id AND v.voucher_date <= ? AND v.company_id = ? AND v.status <> 'CANCELLED'
          JOIN ledgers l ON je.ledger_id = l.id
          JOIN account_groups ag ON l.group_id = ag.id
          WHERE l.company_id = ? AND ag.nature = 'Expense'
        ) AS net_retained
    `;

    const retainedResult = this.db
      .prepare(retainedQuery)
      .get(asOfDate, companyId, companyId, asOfDate, companyId, companyId);
    const dynamicRetainedEarnings = roundMoney(retainedResult ? retainedResult.net_retained : 0);

    // 2. Fetch Assets, Liabilities, and Equity balances
    const balanceQuery = `
      SELECT 
        l.id AS ledger_id,
        l.name AS ledger_name,
        l.nature AS ledger_nature,
        l.opening_balance,
        ag.name AS group_name,
        ag.nature AS group_nature,
        COALESCE(SUM(CASE WHEN v.id IS NOT NULL AND je.entry_type = 'DEBIT' THEN je.amount ELSE 0 END), 0) AS total_debit,
        COALESCE(SUM(CASE WHEN v.id IS NOT NULL AND je.entry_type = 'CREDIT' THEN je.amount ELSE 0 END), 0) AS total_credit
      FROM ledgers l
      JOIN account_groups ag ON l.group_id = ag.id
      LEFT JOIN journal_entries je ON je.ledger_id = l.id
      LEFT JOIN vouchers v ON je.voucher_id = v.id AND v.voucher_date <= ? AND v.company_id = ? AND v.status <> 'CANCELLED'
      WHERE l.company_id = ? AND ag.nature IN ('Asset', 'Liability', 'Equity')
      GROUP BY l.id
      ORDER BY ag.nature, l.name
    `;

    const rows = this.db.prepare(balanceQuery).all(asOfDate, companyId, companyId);

    const assets = [];
    const liabilities = [];
    const equities = [];
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    for (const row of rows) {
      const {
        ledger_id,
        ledger_name,
        ledger_nature,
        opening_balance,
        group_name,
        group_nature,
        total_debit,
        total_credit,
      } = row;

      let netBalance = 0;
      if (ledger_nature === 'Debit') {
        netBalance = opening_balance + total_debit - total_credit;
      } else {
        netBalance = opening_balance + total_credit - total_debit;
      }

      const amt = roundMoney(netBalance);

      if (group_nature === 'Asset') {
        assets.push({
          ledgerId: ledger_id,
          ledgerName: ledger_name,
          groupName: group_name,
          amount: amt,
        });
        totalAssets += amt;
      } else if (group_nature === 'Liability') {
        liabilities.push({
          ledgerId: ledger_id,
          ledgerName: ledger_name,
          groupName: group_name,
          amount: amt,
        });
        totalLiabilities += amt;
      } else if (group_nature === 'Equity') {
        // Exclude seeded retained earnings placeholder from the query list, since we calculate it dynamically
        if (ledger_name !== 'Retained Earnings') {
          equities.push({ ledgerId: ledger_id, ledgerName: ledger_name, amount: amt });
          totalEquity += amt;
        }
      }
    }

    // Append dynamic retained earnings to equity
    equities.push({
      ledgerName: 'Retained Earnings (Dynamic P&L)',
      amount: dynamicRetainedEarnings,
    });
    totalEquity += dynamicRetainedEarnings;

    return {
      asOfDate,
      assets: {
        items: assets,
        total: roundMoney(totalAssets),
      },
      liabilities: {
        items: liabilities,
        total: roundMoney(totalLiabilities),
      },
      equity: {
        items: equities,
        total: roundMoney(totalEquity),
      },
      totals: {
        totalLiabilitiesAndEquity: roundMoney(totalLiabilities + totalEquity),
        isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      },
    };
  }

  /**
   * Generates a detailed running statement for a ledger.
   *
   * @param {number} companyId - Active company ID
   * @param {number} ledgerId - Target ledger ID
   * @param {string} startDate - Date in YYYY-MM-DD
   * @param {string} endDate - Date in YYYY-MM-DD
   * @returns {object} Ledger statement with opening balance, transactions list, and ending balance
   */
  getLedgerStatement(companyId, ledgerId, startDate, endDate) {
    if (!ledgerId) {
      throw new AppError('Ledger ID is required.', 400, 'REPORT_INVALID_LEDGER');
    }
    ledgerId = Number(ledgerId);
    if (
      !startDate ||
      !endDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ) {
      throw new AppError(
        'Start and end dates in YYYY-MM-DD format are required.',
        400,
        'REPORT_INVALID_DATE',
      );
    }

    // Verify ledger exists and matches company
    const ledger = this.db
      .prepare('SELECT name, nature, opening_balance FROM ledgers WHERE id = ? AND company_id = ?')
      .get(ledgerId, companyId);
    if (!ledger) {
      throw new AppError('Ledger not found under this company context.', 404, 'LEDGER_NOT_FOUND');
    }

    // 1. Calculate Opening Balance before startDate
    const preQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN je.entry_type = 'DEBIT' THEN je.amount ELSE 0 END), 0) AS pre_debits,
        COALESCE(SUM(CASE WHEN je.entry_type = 'CREDIT' THEN je.amount ELSE 0 END), 0) AS pre_credits
      FROM journal_entries je
      JOIN vouchers v ON je.voucher_id = v.id AND v.voucher_date < ? AND v.company_id = ? AND v.status <> 'CANCELLED'
      WHERE je.ledger_id = ?
    `;
    const pre = this.db.prepare(preQuery).get(startDate, companyId, ledgerId);

    let openingBalance = ledger.opening_balance;
    if (ledger.nature === 'Debit') {
      openingBalance += pre.pre_debits - pre.pre_credits;
    } else {
      openingBalance += pre.pre_credits - pre.pre_debits;
    }
    openingBalance = roundMoney(openingBalance);

    // 2. Fetch Period Transactions
    const txQuery = `
      SELECT 
        je.id AS entry_id,
        je.entry_type,
        je.amount,
        je.narration AS entry_narration,
        v.id AS voucher_id,
        v.voucher_number,
        v.voucher_type,
        v.voucher_date,
        v.narration AS voucher_narration
      FROM journal_entries je
      JOIN vouchers v ON je.voucher_id = v.id
      WHERE je.ledger_id = ? AND v.company_id = ? AND v.voucher_date >= ? AND v.voucher_date <= ? AND v.status <> 'CANCELLED'
      ORDER BY v.voucher_date ASC, v.id ASC, je.id ASC
    `;
    const rows = this.db.prepare(txQuery).all(ledgerId, companyId, startDate, endDate);

    const transactions = [];
    let runningBalance = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    for (const row of rows) {
      const {
        entry_id,
        entry_type,
        amount,
        entry_narration,
        voucher_id,
        voucher_number,
        voucher_type,
        voucher_date,
        voucher_narration,
      } = row;

      if (entry_type === 'DEBIT') {
        totalDebit += amount;
        runningBalance += ledger.nature === 'Debit' ? amount : -amount;
      } else {
        totalCredit += amount;
        runningBalance += ledger.nature === 'Credit' ? amount : -amount;
      }

      transactions.push({
        entryId: entry_id,
        entryType: entry_type,
        amount: roundMoney(amount),
        entryNarration: entry_narration,
        voucherId: voucher_id,
        voucherNumber: voucher_number,
        voucherType: voucher_type,
        voucherDate: voucher_date,
        voucherNarration: voucher_narration,
        runningBalance: roundMoney(runningBalance),
      });
    }

    return {
      ledgerId,
      ledgerName: ledger.name,
      ledgerNature: ledger.nature,
      period: { startDate, endDate },
      openingBalance,
      transactions,
      totals: {
        debits: roundMoney(totalDebit),
        credits: roundMoney(totalCredit),
        closingBalance: roundMoney(runningBalance),
      },
    };
  }
}
