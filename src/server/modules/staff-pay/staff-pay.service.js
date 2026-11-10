import { AppError } from '../../shared/errors/app-error.js';
import { localDate } from '../../shared/utils/local-date.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { MoneyService } from '../accounting/money.service.js';

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;
const fail = (message, code = 'VALIDATION_ERROR', status = 400) => {
  throw new AppError(message, status, code);
};

/**
 * Staff salary and advances in plain terms. Advances are money the staff
 * member owes back (an asset); a salary payment books the full salary as an
 * expense, recovers any advance deducted, and pays the rest from cash or bank.
 */
export class StaffPayService {
  constructor(db, { moneyService, auditRepository } = {}) {
    this.db = db;
    this.money = moneyService || new MoneyService(db);
    this.auditRepository = auditRepository || new AuditRepository(db);
  }

  summary(month = localDate().slice(0, 7)) {
    return this.db
      .prepare(
        `SELECT t.id, t.full_name AS name, t.technician_code AS code, t.phone_number AS phone,
           t.monthly_salary AS monthlySalary,
           ROUND(COALESCE((SELECT SUM(gross_amount) FROM staff_payments WHERE technician_id = t.id AND kind = 'ADVANCE'), 0)
             - COALESCE((SELECT SUM(advance_deducted) FROM staff_payments WHERE technician_id = t.id AND kind = 'SALARY'), 0), 2) AS advanceDue,
           (SELECT net_paid FROM staff_payments WHERE technician_id = t.id AND kind = 'SALARY' AND salary_month = ?) AS paidThisMonth
         FROM technicians t WHERE t.is_active = 1 ORDER BY t.full_name`,
      )
      .all(month)
      .map((row) => ({ ...row, month, salaryPaid: row.paidThisMonth !== null }));
  }

  history(technicianId) {
    this.staff(technicianId);
    return this.db
      .prepare(
        `SELECT sp.*, l.name AS paid_from FROM staff_payments sp
         LEFT JOIN ledgers l ON l.id = sp.payment_ledger_id
         WHERE sp.technician_id = ? ORDER BY sp.payment_date DESC, sp.id DESC`,
      )
      .all(technicianId);
  }

  setMonthlySalary(technicianId, { monthlySalary } = {}, userId = null) {
    const staff = this.staff(technicianId);
    const value = roundMoney(monthlySalary);
    if (!(value >= 0)) fail('Monthly salary must be zero or more.');
    this.db
      .prepare(
        'UPDATE technicians SET monthly_salary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      )
      .run(value, staff.id);
    this.auditRepository.create({
      userId,
      action: 'UPDATE_SALARY',
      entityType: 'technicians',
      entityId: staff.id,
      oldValue: { monthly_salary: staff.monthly_salary },
      newValue: { monthly_salary: value },
    });
    return this.summary().find((row) => row.id === staff.id);
  }

  giveAdvance(technicianId, { amount, accountId, date, notes } = {}, userId = null) {
    const staff = this.staff(technicianId);
    const value = roundMoney(amount);
    if (!(value > 0)) fail('Enter an advance amount greater than zero.');
    const account = this.money.accountById(accountId);
    const paymentDate = date || localDate();
    return this.db.transaction(() => {
      const voucher = this.money.postingEngine.post({
        companyId: 1,
        voucherType: 'Payment',
        voucherDate: paymentDate,
        narration: `Advance to ${staff.full_name}${notes ? `: ${String(notes).slice(0, 200)}` : ''}`,
        created_by: userId,
        entries: [
          { ledgerId: this.money.ledgerForKey('staff_advances'), type: 'DEBIT', amount: value },
          { ledgerId: account.id, type: 'CREDIT', amount: value },
        ],
      });
      const id = this.insertPayment({
        technician_id: staff.id,
        kind: 'ADVANCE',
        salary_month: null,
        gross_amount: value,
        advance_deducted: 0,
        net_paid: value,
        payment_ledger_id: account.id,
        voucher_id: voucher.voucherId,
        payment_date: paymentDate,
        notes: notes ? String(notes).slice(0, 300) : null,
        created_by: userId,
      });
      return this.payment(id, userId, 'ADVANCE');
    })();
  }

  paySalary(technicianId, payload = {}, userId = null) {
    const staff = this.staff(technicianId);
    const month = String(payload.month || localDate().slice(0, 7));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('Choose the salary month.');
    const gross = roundMoney(payload.amount ?? staff.monthly_salary);
    if (!(gross > 0)) fail('Enter the salary amount, or set the monthly salary first.');
    const advanceDue = this.summary(month).find((row) => row.id === staff.id)?.advanceDue || 0;
    const deduct = roundMoney(payload.advanceDeducted ?? 0);
    if (deduct < 0) fail('Advance deducted cannot be negative.');
    if (deduct > advanceDue + 0.001)
      fail(`Only ₹${advanceDue.toFixed(2)} of advance is outstanding for ${staff.full_name}.`);
    if (deduct > gross) fail('Advance deducted cannot be more than the salary.');
    const net = roundMoney(gross - deduct);
    const paymentDate = payload.date || localDate();
    if (
      this.db
        .prepare(
          "SELECT 1 FROM staff_payments WHERE technician_id = ? AND kind = 'SALARY' AND salary_month = ?",
        )
        .get(staff.id, month)
    )
      fail(
        `Salary for ${month} is already paid to ${staff.full_name}.`,
        'SALARY_ALREADY_PAID',
        409,
      );
    const account = net > 0 ? this.money.accountById(payload.accountId) : null;

    return this.db.transaction(() => {
      const entries = [
        { ledgerId: this.money.ledgerForKey('salary_expense'), type: 'DEBIT', amount: gross },
      ];
      if (deduct > 0)
        entries.push({
          ledgerId: this.money.ledgerForKey('staff_advances'),
          type: 'CREDIT',
          amount: deduct,
        });
      if (net > 0) entries.push({ ledgerId: account.id, type: 'CREDIT', amount: net });
      const voucher = this.money.postingEngine.post({
        companyId: 1,
        voucherType: net > 0 ? 'Payment' : 'Journal',
        voucherDate: paymentDate,
        narration: `Salary ${month} for ${staff.full_name}${deduct > 0 ? ` (advance recovered ₹${deduct.toFixed(2)})` : ''}`,
        created_by: userId,
        entries,
      });
      const id = this.insertPayment({
        technician_id: staff.id,
        kind: 'SALARY',
        salary_month: month,
        gross_amount: gross,
        advance_deducted: deduct,
        net_paid: net,
        payment_ledger_id: account?.id ?? null,
        voucher_id: voucher.voucherId,
        payment_date: paymentDate,
        notes: payload.notes ? String(payload.notes).slice(0, 300) : null,
        created_by: userId,
      });
      return this.payment(id, userId, 'SALARY');
    })();
  }

  staff(id) {
    const staff = this.db.prepare('SELECT * FROM technicians WHERE id = ?').get(Number(id));
    if (!staff) fail('Staff member not found.', 'STAFF_NOT_FOUND', 404);
    return staff;
  }

  insertPayment(row) {
    return Number(
      this.db
        .prepare(
          `INSERT INTO staff_payments (technician_id, kind, salary_month, gross_amount, advance_deducted, net_paid,
             payment_ledger_id, voucher_id, payment_date, notes, created_by)
           VALUES (@technician_id, @kind, @salary_month, @gross_amount, @advance_deducted, @net_paid,
             @payment_ledger_id, @voucher_id, @payment_date, @notes, @created_by)`,
        )
        .run(row).lastInsertRowid,
    );
  }

  payment(id, userId, action) {
    const payment = this.db.prepare('SELECT * FROM staff_payments WHERE id = ?').get(id);
    this.auditRepository.create({
      userId,
      action: action === 'ADVANCE' ? 'STAFF_ADVANCE' : 'SALARY_PAID',
      entityType: 'staff_payments',
      entityId: id,
      newValue: payment,
    });
    return payment;
  }
}
