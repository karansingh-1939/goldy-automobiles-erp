// Preserve metadata written by the former expense screen when editing historical records.
export function decodeExpenseDescription(raw = '') {
  const text = raw || '';
  return {
    description: text
      .replace(/\s*\[Payment:\s*[^\]]+\]/g, '')
      .replace(/\s*\[Notes:\s*[^\]]+\]/g, '')
      .trim(),
    paymentMethod: text.match(/\[Payment:\s*([^\]]+)\]/)?.[1]?.trim() || 'Cash',
    notes: text.match(/\[Notes:\s*([^\]]+)\]/)?.[1]?.trim() || '',
  };
}

// Payment is now stored in its own field; only notes stay in the description.
export function encodeExpenseDescription({ description, notes = '' }) {
  return `${description.trim()}${notes.trim() ? ` [Notes: ${notes.trim()}]` : ''}`.trim();
}

// Maps the free-text payment method of older records to a payment mode.
export function paymentModeFromText(text = '') {
  const value = String(text).toUpperCase();
  if (value.includes('UPI')) return 'UPI';
  if (value.includes('CARD')) return 'CARD';
  if (/BANK|NEFT|RTGS|IMPS|TRANSFER|CHEQUE/.test(value)) return 'BANK';
  return 'CASH';
}
