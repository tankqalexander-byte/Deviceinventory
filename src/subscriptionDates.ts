import type { BillingCycle, Subscription } from "./types";

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_ROLL_ITERATIONS = 1200;

const CYCLE_MONTHS: Record<BillingCycle, number> = {
  Monthly: 1,
  Quarterly: 3,
  Annual: 12,
  Biennially: 24,
  "One-time": 0,
};

function daysInMonth(year: number, month: number): number {
  // month is 1-12; day 0 of next month is the last day of this month
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseISO(dateISO: string): { y: number; m: number; d: number } | null {
  if (typeof dateISO !== "string") return null;
  const match = ISO_RE.exec(dateISO);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

function formatISO(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Adds n months to a YYYY-MM-DD date, clamping to the last day of the target month. Bad input is returned unchanged. */
export function addMonths(dateISO: string, n: number): string {
  const parsed = parseISO(dateISO);
  if (!parsed || !Number.isInteger(n)) return dateISO;
  const total = parsed.y * 12 + (parsed.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12 + 12) % 12 + 1;
  const d = Math.min(parsed.d, daysInMonth(y, m));
  return formatISO(y, m, d);
}

/** Adds one billing cycle to a date. "One-time" returns the input unchanged. */
export function addCycle(dateISO: string, cycle: BillingCycle): string {
  const months = CYCLE_MONTHS[cycle];
  if (!months) return dateISO;
  return addMonths(dateISO, months);
}

/**
 * The next renewal date to show: for auto-renewing, non-cancelled, periodic subscriptions
 * whose stored date is in the past, rolls forward by whole cycles (always from the original
 * date, so day-of-month does not drift after a clamp) to the first date >= today.
 */
export function effectiveRenewalDate(
  sub: Pick<Subscription, "renewalDate" | "billingCycle" | "autoRenew" | "status">,
  todayISO: string
): string {
  const { renewalDate, billingCycle, autoRenew, status } = sub;
  if (!autoRenew || status === "Cancelled") return renewalDate;
  if (!billingCycle) return renewalDate;
  const months = CYCLE_MONTHS[billingCycle];
  if (!months) return renewalDate;
  if (!parseISO(renewalDate) || !parseISO(todayISO)) return renewalDate;
  if (renewalDate >= todayISO) return renewalDate;

  for (let n = 1; n <= MAX_ROLL_ITERATIONS; n++) {
    const candidate = addMonths(renewalDate, months * n);
    if (candidate >= todayISO) return candidate;
  }
  return renewalDate;
}
