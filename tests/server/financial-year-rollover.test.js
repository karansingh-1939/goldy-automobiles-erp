import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { PeriodLockService } from '../../src/server/modules/accounting/period-lock.service.js';

function lockDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE financial_years (id INTEGER PRIMARY KEY, company_id INTEGER, name TEXT,
      start_date TEXT, end_date TEXT, is_active INTEGER, is_closed INTEGER);
    CREATE TABLE locked_periods (company_id INTEGER, start_date TEXT, end_date TEXT, is_locked INTEGER);
    CREATE TABLE gst_period_locks (company_id INTEGER, tax_period TEXT, is_locked INTEGER);
    INSERT INTO financial_years VALUES (1, 1, 'FY 2026-27', '2026-04-01', '2027-03-31', 1, 0);`);
  return db;
}
const years = (db) =>
  db
    .prepare(
      'SELECT name, start_date, end_date, is_active FROM financial_years ORDER BY start_date',
    )
    .all();

test('billing continues after 31 March by opening the next financial year', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2027, 3, 1, 10).getTime() });
  const db = lockDb();
  try {
    const locks = new PeriodLockService(db);
    locks.verifyPeriodLock(1, '2027-04-01');
    assert.deepEqual(years(db).at(-1), {
      name: 'FY 2027-28',
      start_date: '2027-04-01',
      end_date: '2028-03-31',
      is_active: 1,
    });
    locks.verifyPeriodLock(1, '2027-04-02');
    assert.equal(years(db).length, 2);
  } finally {
    db.close();
  }
});

test('a long gap fills every missing year, but future and back-dated years stay rejected', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2029, 5, 15, 10).getTime() });
  const db = lockDb();
  try {
    const locks = new PeriodLockService(db);
    locks.verifyPeriodLock(1, '2029-06-15');
    assert.deepEqual(
      years(db).map((y) => y.name),
      ['FY 2026-27', 'FY 2027-28', 'FY 2028-29', 'FY 2029-30'],
    );
    assert.throws(() => locks.verifyPeriodLock(1, '2030-04-01'), /No financial year covers/);
    assert.throws(() => locks.verifyPeriodLock(1, '2025-12-01'), /No financial year covers/);
  } finally {
    db.close();
  }
});

test('a closed year is never reopened', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 10, 10).getTime() });
  const db = lockDb();
  try {
    db.prepare('UPDATE financial_years SET is_closed = 1').run();
    assert.throws(
      () => new PeriodLockService(db).verifyPeriodLock(1, '2026-11-10'),
      /already closed/,
    );
    assert.equal(years(db).length, 1);
  } finally {
    db.close();
  }
});
