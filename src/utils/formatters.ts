export function formatNumber(value: string | number, maximumFractionDigits = 2): string {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(num);
}

type DecimalFormatOptions = {
  maxFractionDigits?: number;
  minFractionDigits?: number;
  groupSeparator?: string;
};

export function formatDecimalString(value: string, opts: DecimalFormatOptions = {}): string {
  const { maxFractionDigits = 2, minFractionDigits = 0, groupSeparator = ',' } = opts;
  const raw = String(value ?? '').trim();
  if (!raw) return '0';

  const sign = raw.startsWith('-') ? '-' : '';
  const unsigned = raw.replace(/^[-+]/, '');
  const [intRaw, fracRaw = ''] = unsigned.split('.');

  const intDigits = (intRaw || '0').replace(/^0+(?=\d)/, '');
  const groupedInt = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator);

  const clipped = fracRaw.slice(0, Math.max(0, maxFractionDigits));
  let trimmed = clipped;
  while (trimmed.length > minFractionDigits && trimmed.endsWith('0')) trimmed = trimmed.slice(0, -1);
  while (trimmed.length < minFractionDigits) trimmed += '0';

  return trimmed.length ? `${sign}${groupedInt}.${trimmed}` : `${sign}${groupedInt}`;
}

export function formatTokenAmount(value: string, opts?: { maxSmallFractionDigits?: number; maxLargeFractionDigits?: number }): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '0';

  const unsigned = raw.replace(/^[-+]/, '');
  const [intRaw] = unsigned.split('.');
  const intDigits = (intRaw || '0').replace(/^0+(?=\d)/, '');
  const isSmall = intDigits === '0';

  return formatDecimalString(raw, {
    maxFractionDigits: isSmall ? (opts?.maxSmallFractionDigits ?? 6) : (opts?.maxLargeFractionDigits ?? 2),
    minFractionDigits: 0,
  });
}
