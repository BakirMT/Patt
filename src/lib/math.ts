import type {
  DashboardMetrics,
  Person,
  PersonBalanceSummary,
  Transaction,
  TransactionType,
} from '../types/ledger';

export const CURRENCY_OPTIONS = [
  { code: 'USD', symbol: '$', label: 'US Dollar ($)' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee (₹)' },
  { code: 'AED', symbol: 'AED ', label: 'UAE Dirham (AED)' },
  { code: 'SAR', symbol: 'SAR ', label: 'Saudi Riyal (SAR)' },
  { code: 'EUR', symbol: '€', label: 'Euro (€)' },
  { code: 'GBP', symbol: '£', label: 'British Pound (£)' },
  { code: 'PKR', symbol: 'Rs ', label: 'Pakistani Rupee (Rs)' },
  { code: 'QAR', symbol: 'QAR ', label: 'Qatari Riyal (QAR)' },
];

export const MAX_TRANSACTION_AMOUNT = 9999999999.99;

/**
 * Convert a decimal monetary value to integer minor units (cents)
 * to eliminate IEEE-754 floating-point drift in balance summations.
 */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100);
}

/**
 * Convert integer minor units back to a 2-decimal number.
 */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Validate and parse a user-supplied monetary amount string.
 * Returns a positive number rounded to 2 decimal places, or null if invalid.
 */
export function parseAmount(raw: string | number): number | null {
  const num = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, '').trim());
  if (!Number.isFinite(num) || num <= 0 || num > MAX_TRANSACTION_AMOUNT) {
    return null;
  }
  const cents = toCents(num);
  if (cents <= 0) return null;
  return fromCents(cents);
}

/**
 * Format a numeric value with currency symbol and 2 decimal places.
 */
export function formatMoney(amount: number, currencySymbol = '$'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const isNegative = safe < 0;
  const formatted = Math.abs(safe).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${isNegative ? '-' : ''}${currencySymbol}${formatted}`;
}

/**
 * Normalize a manually entered person code into a deterministic, Firestore-safe
 * document key matching ^[A-Z0-9_\-]+$ so uniqueness checks are case-insensitive.
 */
export function normalizePersonCodeKey(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_\-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export function isValidPersonCode(code: string): boolean {
  const trimmed = code.trim();
  if (trimmed.length < 1 || trimmed.length > 40) return false;
  if (!/^[A-Za-z0-9_\-\. ]+$/.test(trimmed)) return false;
  return normalizePersonCodeKey(trimmed).length >= 1;
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateDisplay(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

export const TRANSACTION_TYPE_META: Record<
  TransactionType,
  {
    label: string;
    shortLabel: string;
    description: string;
    textClass: string;
    subtleBgClass: string;
    borderClass: string;
  }
> = {
  GIVEN: {
    label: 'Given Money',
    shortLabel: 'Given',
    description: 'Money given to person (increases Receivable)',
    textClass: 'text-emerald-400',
    subtleBgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/25',
  },
  RECEIVED: {
    label: 'Received Money',
    shortLabel: 'Received',
    description: 'Money returned by person (reduces Receivable)',
    textClass: 'text-sky-400',
    subtleBgClass: 'bg-sky-500/10',
    borderClass: 'border-sky-500/25',
  },
  PAYABLE: {
    label: 'Payable (Owed)',
    shortLabel: 'Payable',
    description: 'Money you owe to person (increases Payable)',
    textClass: 'text-amber-400',
    subtleBgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/25',
  },
  PAID: {
    label: 'Paid Back',
    shortLabel: 'Paid',
    description: 'Payment toward payable balance (reduces Payable)',
    textClass: 'text-rose-400',
    subtleBgClass: 'bg-rose-500/10',
    borderClass: 'border-rose-500/25',
  },
};

/**
 * Compute strictly separated Receivable and Payable balances per person.
 * Receivable = Total Given - Total Received
 * Payable    = Total Owed (PAYABLE) - Total Paid (PAID)
 */
export function computePersonBalanceMap(
  persons: Person[],
  transactions: Transaction[]
): Record<string, PersonBalanceSummary> {
  const accum: Record<
    string,
    {
      given: number;
      received: number;
      payable: number;
      paid: number;
      count: number;
      lastDate: string | null;
    }
  > = {};

  for (const p of persons) {
    accum[p.id] = {
      given: 0,
      received: 0,
      payable: 0,
      paid: 0,
      count: 0,
      lastDate: null,
    };
  }

  // Track seen transaction IDs to guarantee a transaction is never counted twice
  const seenTxIds = new Set<string>();

  for (const tx of transactions) {
    if (seenTxIds.has(tx.id)) continue;
    seenTxIds.add(tx.id);

    if (!accum[tx.personId]) {
      accum[tx.personId] = {
        given: 0,
        received: 0,
        payable: 0,
        paid: 0,
        count: 0,
        lastDate: null,
      };
    }

    const bucket = accum[tx.personId];
    const cents = toCents(tx.amount);
    bucket.count += 1;
    if (!bucket.lastDate || tx.date > bucket.lastDate) {
      bucket.lastDate = tx.date;
    }

    switch (tx.type) {
      case 'GIVEN':
        bucket.given += cents;
        break;
      case 'RECEIVED':
        bucket.received += cents;
        break;
      case 'PAYABLE':
        bucket.payable += cents;
        break;
      case 'PAID':
        bucket.paid += cents;
        break;
    }
  }

  const result: Record<string, PersonBalanceSummary> = {};
  for (const [personId, b] of Object.entries(accum)) {
    result[personId] = {
      personId,
      totalGiven: fromCents(b.given),
      totalReceived: fromCents(b.received),
      remainingReceivable: fromCents(b.given - b.received),
      totalPayablePrincipal: fromCents(b.payable),
      totalPaid: fromCents(b.paid),
      remainingPayable: fromCents(b.payable - b.paid),
      transactionCount: b.count,
      lastTransactionDate: b.lastDate,
    };
  }
  return result;
}

export function computeDashboardMetrics(
  persons: Person[],
  transactions: Transaction[]
): DashboardMetrics {
  let given = 0;
  let received = 0;
  let payablePrincipal = 0;
  let paid = 0;

  const seen = new Set<string>();
  for (const tx of transactions) {
    if (seen.has(tx.id)) continue;
    seen.add(tx.id);
    const cents = toCents(tx.amount);
    switch (tx.type) {
      case 'GIVEN':
        given += cents;
        break;
      case 'RECEIVED':
        received += cents;
        break;
      case 'PAYABLE':
        payablePrincipal += cents;
        break;
      case 'PAID':
        paid += cents;
        break;
    }
  }

  return {
    totalPersons: persons.length,
    totalGiven: fromCents(given),
    totalReceived: fromCents(received),
    totalReceivable: fromCents(given - received),
    totalPayablePrincipal: fromCents(payablePrincipal),
    totalPaid: fromCents(paid),
    totalPayable: fromCents(payablePrincipal - paid),
    totalTransactionCount: seen.size,
  };
}
