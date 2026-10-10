import assert from 'node:assert/strict';
import test from 'node:test';
import { localDate } from '../../src/server/shared/utils/local-date.js';
import { localDate as browserLocalDate } from '../../public/local-date.js';
import { GstService } from '../../src/server/modules/gst/gst.service.js';
import { ProfitService } from '../../src/server/modules/profit/profit.service.js';
import Database from 'better-sqlite3';
import { DashboardRepository } from '../../src/server/modules/dashboard/dashboard.repository.js';

test('browser and server business dates preserve local month and day across UTC boundaries', () => {
  // 1 October at 01:00 in India is 30 September in UTC.
  const date = { getFullYear: () => 2026, getMonth: () => 9, getDate: () => 1 };
  assert.equal(localDate(date), '2026-10-01');
  assert.equal(browserLocalDate(date), '2026-10-01');
});

test('GST and profit month presets use the local calendar', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 11, 1).getTime() });
  for (const Service of [GstService, ProfitService]) {
    const service = new Service({});
    service.repository.summary = () => ({});
    assert.deepEqual(service.summary({ period: 'this_month' }).filters, {
      period: 'this_month',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-11',
    });
  }
});

test('today workshop counts interpret stored UTC timestamps on the local calendar', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE job_cards (status TEXT, vehicle_id INTEGER, opened_at TEXT, closed_at TEXT, promised_delivery_at TEXT);
      INSERT INTO job_cards VALUES ('COMPLETED', 1, '2026-09-30 20:00:00', '2026-09-30 20:00:00', NULL);`);
    const day = localDate(new Date('2026-09-30T20:00:00Z'));
    const metrics = new DashboardRepository(db).getOperationsMetrics(day);
    assert.equal(metrics.todayJobCardsCount, 1);
    assert.equal(metrics.vehiclesServicedToday, 1);
  } finally {
    db.close();
  }
});
