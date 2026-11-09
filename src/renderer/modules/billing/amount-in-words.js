const ones = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function words(n) {
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ` ${ones[n % 10]}` : '');
  for (const [value, unit] of [
    [10000000, 'Crore'],
    [100000, 'Lakh'],
    [1000, 'Thousand'],
    [100, 'Hundred'],
  ]) {
    if (n >= value)
      return `${words(Math.floor(n / value))} ${unit}${n % value ? ` ${words(n % value)}` : ''}`;
  }
}
export function amountInWords(amount) {
  const paise = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(paise) || paise < 0) return 'Amount unavailable';
  return `${words(Math.floor(paise / 100))} Rupees${paise % 100 ? ` and ${words(paise % 100)} Paise` : ''} Only`;
}
