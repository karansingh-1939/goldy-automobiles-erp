/**
 * SQLite CURRENT_TIMESTAMP values ("YYYY-MM-DD HH:MM:SS") are UTC without a
 * zone marker. Convert them to the laptop's local time for display.
 */
export function formatLocalTimestamp(value) {
  if (!value) return '—';
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(String(value));
  const date = new Date(match ? `${match[1]}T${match[2]}Z` : value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
