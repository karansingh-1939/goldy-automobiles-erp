import { describe, expect, it } from 'vitest';
import { formatLocalTimestamp } from '../../src/renderer/shared/utils/date-time.js';

describe('formatLocalTimestamp', () => {
  it('treats SQLite timestamps as UTC and shows local time', () => {
    const expected = new Date(Date.UTC(2026, 10, 10, 14, 9, 39));
    const pad = (n) => String(n).padStart(2, '0');
    expect(formatLocalTimestamp('2026-11-10 14:09:39')).toBe(
      `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())} ${pad(
        expected.getHours(),
      )}:${pad(expected.getMinutes())}`,
    );
  });

  it('handles empty and unparseable values', () => {
    expect(formatLocalTimestamp(null)).toBe('—');
    expect(formatLocalTimestamp('not a date')).toBe('not a date');
  });
});
