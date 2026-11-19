import type { Device, LoanRecord } from "./types";

export interface LoanDateChanges {
  checkoutDate?: string;
  expectedReturnDate?: string;
  returnedDate?: string;
}

// Only copy keys that were explicitly provided (an empty expectedReturnDate is a valid value).
function pick(changes: LoanDateChanges): LoanDateChanges {
  const out: LoanDateChanges = {};
  if (changes.checkoutDate !== undefined) out.checkoutDate = changes.checkoutDate;
  if (changes.expectedReturnDate !== undefined) out.expectedReturnDate = changes.expectedReturnDate;
  if (changes.returnedDate !== undefined) out.returnedDate = changes.returnedDate;
  return out;
}

/**
 * Immutably applies date edits to a loan. Updates the matching history entry and,
 * if the loan is the active one, the currentLoan copy too. Never touches `status`.
 */
export function applyLoanDateChanges(device: Device, loanId: string, changes: LoanDateChanges): Device {
  const patch = pick(changes);
  const patchRecord = (r: LoanRecord): LoanRecord => (r.id === loanId ? { ...r, ...patch } : r);
  return {
    ...device,
    history: device.history.map(patchRecord),
    currentLoan: device.currentLoan ? patchRecord(device.currentLoan) : device.currentLoan,
  };
}

const isValidDate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/**
 * Returns an error message, or null if valid. Dates are YYYY-MM-DD so string comparison is safe.
 * Pass `due` for active loans (may be ""), `returned` for past loans (required).
 */
export function validateLoanDates(
  input: { checkout: string; due?: string; returned?: string },
  kind: "active" | "past",
  today: string
): string | null {
  const { checkout, due = "", returned = "" } = input;
  if (!checkout) return "Checkout date is required.";
  if (!isValidDate(checkout)) return "Checkout date is not a valid date.";
  if (checkout > today) return "Checkout date cannot be in the future.";
  if (kind === "active") {
    if (due) {
      if (!isValidDate(due)) return "Due date is not a valid date.";
      if (due < checkout) return "Due date must be on or after the checkout date.";
    }
    return null;
  }
  if (!returned) return "Returned date is required.";
  if (!isValidDate(returned)) return "Returned date is not a valid date.";
  if (returned < checkout) return "Returned date must be on or after the checkout date.";
  if (returned > today) return "Returned date cannot be in the future.";
  return null;
}
