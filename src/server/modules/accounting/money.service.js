import { AppError } from '../../shared/errors/app-error.js';
import { localDate } from '../../shared/utils/local-date.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { AccountingPostingEngine } from './posting-engine.service.js';

/**
 * Plain-language money screens for a non-accountant owner. Every entry is
 * posted through the double-entry posting engine (balanced, period-locked,
 * numbered); this service only chooses the right accounts.
 */

const CURRENT_ASSETS_GROUP = 2;
const NON_CURRENT_LIABILITIES_GROUP = 6;
const INDIRECT_INCOME_GROUP = 10;

// Where "other" money comes from or goes to, in owner's words.
const OTHER_PARTIES = {
  IN: {
    owner: { label: 'Owner put money in', systemKey: 'capital_account' },
    loan: { label: 'Loan received', systemKey: 'loans_payable' },
    income: { label: 'Other income', systemKey: 'other_income' },
  },
  OUT: {
    owner: { label: 'Owner took money out', systemKey: 'capital_account' },
    loan: { label: 'Loan repaid', systemKey: 'loans_payable' },
    expense: { label: 'Other expense', systemKey: 'misc_expense' },
  },
};
const LAZY_LEDGERS = {
  loans_payable: { name: 'Loans', group: NON_CURRENT_LIABILITIES_GROUP, nature: 'Credit' },
  other_income: { name: 'Other Income', group: INDIRECT_INCOME_GROUP, nature: 'Credit' },
};

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;
const fail = (message, code = 'VALIDATION_ERROR', status = 400) => {
  throw new AppError(message, status, code);
};

export class MoneyService {
  constructor(db, { postingEngine, auditRepository } = {}) {
    this.db = db;
    this.companyId = 1;
    this.postingEngine = postingEngine || new AccountingPostingEngine(db);
    this.auditRepository = auditRepository || new AuditRepository(db);
  }

  /** Cash in hand and every bank account, with current balances. */
  listAccounts() {
    return this.db
      .prepare(
        `SELECT l.id, l.name, l.system_key AS systemKey,
           CASE WHEN l.system_key = 'cash_in_hand' THEN 'CASH' ELSE 'BANK' END AS kind,
           ROUND(l.opening_balance + COALESCE(SUM(CASE WHEN ve.entry_type = 'DEBIT' THEN ve.amount ELSE -ve.amount END), 0), 2) AS balance
         FROM ledgers l
         LEFT JOIN journal_entries ve ON ve.ledger_id = l.id
           AND ve.voucher_id IN (SELECT id FROM vouchers WHERE status != 'CANCELLED')
         WHERE l.company_id = ? AND (l.system_key IN ('cash_in_hand', 'hdfc_bank') OR l.system_key LIKE 'bank_%')
         GROUP BY l.id
         ORDER BY kind DESC, l.id`,
      )
      .all(this.companyId);
  }

  accountById(id) {
    const account = this.listAccounts().find((row) => row.id === Number(id));
    if (!account) fail('Choose cash or one of your bank accounts.', 'MONEY_ACCOUNT_NOT_FOUND');
    return account;
  }

  /** Adds the owner's own bank account (e.g. "SBI Current Account"). */
  addBankAccount({ name } = {}, userId = null) {
    const clean = String(name || '')
      .trim()
      .slice(0, 80);
    if (!clean) fail('Give the bank account a name, for example "SBI Current Account".');
    return this.db.transaction(() => {
      if (
        this.db
          .prepare('SELECT 1 FROM ledgers WHERE company_id = ? AND name = ?')
          .get(this.companyId, clean)
      )
        fail('An account with this name already exists.', 'DUPLICATE_ACCOUNT', 409);
      const next =
        this.db
          .prepare(
            "SELECT COUNT(*) AS n FROM ledgers WHERE company_id = ? AND system_key LIKE 'bank_%'",
          )
          .get(this.companyId).n + 1;
      const id = this.insertLedger(clean, CURRENT_ASSETS_GROUP, 'Debit', `bank_${next}`);
      this.auditRepository.create({
        userId,
        action: 'CREATE',
        entityType: 'bank_accounts',
        entityId: id,
        newValue: { name: clean },
      });
      return this.accountById(id);
    })();
  }

  renameBankAccount(id, { name } = {}, userId = null) {
    const account = this.accountById(id);
    if (account.kind !== 'BANK') fail('Only bank accounts can be renamed.');
    const clean = String(name || '')
      .trim()
      .slice(0, 80);
    if (!clean) fail('Give the bank account a name.');
    this.db
      .prepare('UPDATE ledgers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(clean, account.id);
    this.auditRepository.create({
      userId,
      action: 'UPDATE',
      entityType: 'bank_accounts',
      entityId: account.id,
      oldValue: { name: account.name },
      newValue: { name: clean },
    });
    return this.accountById(account.id);
  }

  /** Money received or paid that is not a bill, supplier payment or expense. */
  recordOther({ direction, accountId, party, amount, date, note } = {}, userId = null) {
    const options = OTHER_PARTIES[direction];
    if (!options) fail('Choose Money In or Money Out.');
    const choice = options[party];
    if (!choice) fail('Choose who the money is from or for.');
    const value = roundMoney(amount);
    if (!(value > 0)) fail('Enter an amount greater than zero.');
    const account = this.accountById(accountId);
    const postingDate = date || localDate();
    const counterLedger = this.ledgerForKey(choice.systemKey);
    const result = this.postingEngine.post({
      companyId: this.companyId,
      voucherType: direction === 'IN' ? 'Receipt' : 'Payment',
      voucherDate: postingDate,
      narration: `${choice.label}${note ? `: ${String(note).trim().slice(0, 200)}` : ''}`,
      created_by: userId,
      entries:
        direction === 'IN'
          ? [
              { ledgerId: account.id, type: 'DEBIT', amount: value },
              { ledgerId: counterLedger, type: 'CREDIT', amount: value },
            ]
          : [
              { ledgerId: counterLedger, type: 'DEBIT', amount: value },
              { ledgerId: account.id, type: 'CREDIT', amount: value },
            ],
    });
    return { ...result, account: this.accountById(account.id) };
  }

  /**
   * Starting balances when moving from Tally: cash, bank, what customers owe
   * and what is owed to suppliers. Posted as one balanced journal against the
   * owner's capital account.
   */
  recordOpeningBalances({ date, lines } = {}, userId = null) {
    if (!Array.isArray(lines) || lines.length === 0) fail('Add at least one opening balance.');
    const postingDate = date || localDate();
    const capital = this.ledgerForKey('capital_account');
    const entries = [];
    let capitalNet = 0; // positive = credit capital
    for (const line of lines) {
      const value = roundMoney(line.amount);
      if (!(value > 0)) fail('Each opening balance must be greater than zero.');
      let ledgerId;
      let debit;
      if (line.type === 'cash' || line.type === 'bank') {
        ledgerId = this.accountById(line.id).id;
        debit = true;
      } else if (line.type === 'customer') {
        if (!this.db.prepare('SELECT 1 FROM customers WHERE id = ?').get(line.id))
          fail('Customer not found.', 'CUSTOMER_NOT_FOUND', 404);
        ledgerId = this.postingEngine.getOrCreateCustomerLedger(this.companyId, Number(line.id));
        debit = true;
      } else if (line.type === 'supplier') {
        ledgerId = this.postingEngine.getOrCreateSupplierLedger(this.companyId, Number(line.id));
        debit = false;
      } else fail('Opening balance type must be cash, bank, customer or supplier.');
      entries.push({ ledgerId, type: debit ? 'DEBIT' : 'CREDIT', amount: value });
      capitalNet += debit ? value : -value;
    }
    capitalNet = roundMoney(capitalNet);
    if (capitalNet !== 0)
      entries.push({
        ledgerId: capital,
        type: capitalNet > 0 ? 'CREDIT' : 'DEBIT',
        amount: Math.abs(capitalNet),
      });
    const result = this.postingEngine.post({
      companyId: this.companyId,
      voucherType: 'Journal',
      voucherDate: postingDate,
      narration: 'Opening balances (moved from previous books)',
      created_by: userId,
      entries,
    });
    this.auditRepository.create({
      userId,
      action: 'OPENING_BALANCES',
      entityType: 'vouchers',
      entityId: result.voucherId,
      newValue: { date: postingDate, lines },
    });
    return result;
  }

  ledgerForKey(systemKey) {
    const existing = this.db
      .prepare('SELECT id FROM ledgers WHERE company_id = ? AND system_key = ?')
      .get(this.companyId, systemKey);
    if (existing) return existing.id;
    const spec = LAZY_LEDGERS[systemKey];
    if (!spec) fail(`Account ${systemKey} is missing.`, 'LEDGER_NOT_FOUND', 500);
    return this.insertLedger(spec.name, spec.group, spec.nature, systemKey);
  }

  insertLedger(name, groupId, nature, systemKey) {
    const id = this.db
      .prepare(
        `INSERT INTO ledgers (company_id, name, group_id, opening_balance, nature, is_system, system_key)
         VALUES (?, ?, ?, 0, ?, 1, ?)`,
      )
      .run(this.companyId, name, groupId, nature, systemKey).lastInsertRowid;
    this.db
      .prepare(
        'INSERT OR IGNORE INTO ledger_balances (company_id, ledger_id, running_balance) VALUES (?, ?, 0)',
      )
      .run(this.companyId, id);
    return Number(id);
  }
}
