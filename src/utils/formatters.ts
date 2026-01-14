export function formatNumber(value: string | number, maximumFractionDigits = 2): string {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(num);
}

type RoundedDecimalFormatOptions = {
  fractionDigits?: number;
  groupSeparator?: string;
};

function addOneToDigitString(digits: string): { value: string; carried: boolean } {
  if (!digits) return { value: '1', carried: false };
  const arr = digits.split('');
  let carry = 1;
  for (let i = arr.length - 1; i >= 0; i--) {
    const d = arr[i].charCodeAt(0) - 48;
    if (d < 0 || d > 9) {
      // Unexpected input; fall back to a safe default.
      return { value: digits, carried: false };
    }
    const next = d + carry;
    if (next >= 10) {
      arr[i] = '0';
      carry = 1;
    } else {
      arr[i] = String.fromCharCode(48 + next);
      carry = 0;
      break;
    }
  }
  if (carry === 1) return { value: `1${arr.join('')}`, carried: true };
  return { value: arr.join(''), carried: false };
}

/**
 * Formats a decimal string with grouping and ROUNDING (not truncation).
 * Example: "1234.567" -> "1,234.57" for fractionDigits=2.
 */
export function formatDecimalStringRounded(value: string, opts: RoundedDecimalFormatOptions = {}): string {
  const { fractionDigits = 2, groupSeparator = ',' } = opts;
  const raw = String(value ?? '').trim();
  const safeDigits = Math.max(0, Math.floor(fractionDigits));
  if (!raw) return safeDigits ? `0.${'0'.repeat(safeDigits)}` : '0';

  const sign = raw.startsWith('-') ? '-' : '';
  const unsigned = raw.replace(/^[-+]/, '');
  const [intRaw, fracRaw = ''] = unsigned.split('.');

  const intOnlyDigits = (intRaw || '0').replace(/\D/g, '') || '0';
  const fracOnlyDigits = fracRaw.replace(/\D/g, '');

  // Prepare rounding: we need (fractionDigits + 1) digits.
  const padded = fracOnlyDigits.padEnd(safeDigits + 1, '0');
  const roundDigit = padded.charAt(safeDigits) || '0';
  let fracKeep = padded.slice(0, safeDigits);
  let intDigits = intOnlyDigits.replace(/^0+(?=\d)/, '');

  if (safeDigits > 0 && roundDigit >= '5') {
    const inc = addOneToDigitString(fracKeep.padStart(safeDigits, '0'));
    if (inc.value.length > safeDigits) {
      // Overflowed the fractional part, carry into integer.
      fracKeep = inc.value.slice(1);
      intDigits = addOneToDigitString(intDigits || '0').value;
    } else {
      fracKeep = inc.value;
    }
  }

  if (safeDigits > 0) {
    fracKeep = fracKeep.padEnd(safeDigits, '0');
  }

  const groupedInt = (intDigits || '0').replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator);
  return safeDigits > 0 ? `${sign}${groupedInt}.${fracKeep}` : `${sign}${groupedInt}`;
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
