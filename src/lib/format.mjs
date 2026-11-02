export const money = (cents) => {
  const v = (cents ?? 0) / 100;
  return (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const toCents = (text) => {
  const n = Number(String(text).replace(/[$,]/g, ''));
  if (!Number.isFinite(n)) throw new Error(`Not an amount: ${text}`);
  return Math.round(n * 100);
};

export function table(rows, headers) {
  const all = [headers, ...rows].map((r) => r.map(String));
  const widths = headers.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  const numeric = headers.map((_, i) => rows.every((r) => /^-?[\d,.]+$/.test(String(r[i]))));
  return all
    .map((r) => r.map((c, i) => (numeric[i] ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  '))
    .join('\n');
}

export const monthArg = (m) => {
  const month = m ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Month must be YYYY-MM, got ${month}`);
  return month;
};

export const dateArg = (d, label = 'date') => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d ?? '')) throw new Error(`${label} must be YYYY-MM-DD, got ${d}`);
  return d;
};

export const onOff = (v) => {
  if (['on', 'true', 'yes'].includes(String(v).toLowerCase())) return true;
  if (['off', 'false', 'no'].includes(String(v).toLowerCase())) return false;
  throw new Error(`Expected on or off, got ${v}`);
};
