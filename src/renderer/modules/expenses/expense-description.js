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

export function encodeExpenseDescription({ description, paymentMethod, notes }) {
  return `${description.trim()}${paymentMethod !== 'Cash' || notes.trim() ? ` [Payment: ${paymentMethod}]` : ''}${notes.trim() ? ` [Notes: ${notes.trim()}]` : ''}`.trim();
}
