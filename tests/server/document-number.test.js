import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
  DocumentSeries,
  financialYearLabel,
  nextDocumentNumber,
} from '../../src/server/shared/utils/document-number.js';

function sequenceDb() {
  const db = new Database(':memory:');
  db.exec(
    fs.readFileSync(
      new URL('../../src/server/database/migrations/045_document_sequences.sql', import.meta.url),
      'utf8',
    ),
  );
  return db;
}

test('financial year runs April to March', () => {
  assert.equal(financialYearLabel('2026-03-31'), '25-26');
  assert.equal(financialYearLabel('2026-04-01'), '26-27');
  assert.equal(financialYearLabel('2026-11-10'), '26-27');
  assert.equal(financialYearLabel('2099-12-31'), '99-00');
  assert.throws(() => financialYearLabel('10/11/2026'), /Invalid business date/);
});

test('invoice numbers are consecutive, per series, restart each financial year and fit GST limits', () => {
  const db = sequenceDb();
  try {
    const workshop = (date) => nextDocumentNumber(db, DocumentSeries.WORKSHOP_INVOICE, date);
    assert.equal(workshop('2026-11-10'), 'INV/26-27/0001');
    assert.equal(workshop('2026-11-10'), 'INV/26-27/0002');
    assert.equal(
      nextDocumentNumber(db, DocumentSeries.COUNTER_INVOICE, '2026-11-10'),
      'CS/26-27/0001',
    );
    assert.equal(workshop('2027-04-01'), 'INV/27-28/0001');
    assert.equal(workshop('2027-03-31'), 'INV/26-27/0003');

    db.prepare(
      "UPDATE document_sequences SET last_number = 99998 WHERE series = 'INV' AND financial_year = '26-27'",
    ).run();
    const longest = workshop('2026-11-10');
    assert.equal(longest, 'INV/26-27/99999');
    assert.ok(longest.length <= 16);
  } finally {
    db.close();
  }
});

test('a failed posting releases its reserved number', () => {
  const db = sequenceDb();
  try {
    assert.throws(() =>
      db.transaction(() => {
        nextDocumentNumber(db, DocumentSeries.WORKSHOP_INVOICE, '2026-11-10');
        throw new Error('posting failed');
      })(),
    );
    assert.equal(
      nextDocumentNumber(db, DocumentSeries.WORKSHOP_INVOICE, '2026-11-10'),
      'INV/26-27/0001',
    );
  } finally {
    db.close();
  }
});
