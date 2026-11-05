/** Display formatting for money strings (ui_spec §1.4, NFR-01): group the
 * integer digits in threes by string manipulation only. Never `Number`,
 * `parseFloat` or `toLocaleString`, so a value can never pick up float
 * rounding on its way to the screen. */

const PLAIN_DECIMAL_RE = /^(-?)(\d+)(\.\d*)?$/;

export function groupThousands(value: string): string {
  const match = PLAIN_DECIMAL_RE.exec(value);
  if (!match) return value;
  const [, sign = '', digits = '', fraction = ''] = match;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}${fraction}`;
}

export function formatRupees(value: string): string {
  return value === '' ? '' : `₹${groupThousands(value)}`;
}
