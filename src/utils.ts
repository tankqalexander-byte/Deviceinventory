/**
 * Helper utilities for managing dates and styling in the TeaLoan inventory system.
 */
import { EmploymentStatus } from "./types";

// Helper to get today's date formatted as YYYY-MM-DD using local time
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Current date formatted as YYYY-MM-DD
export const SYSTEM_TODAY = getTodayDateString();

export function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split("-").map(Number);
  // Month in JS Date is 0-indexed
  return new Date(year, month - 1, day);
}

export interface DateDiffResult {
  days: number;
  isOverdue: boolean;
  text: string;
}

export function getLoanRemainingDays(expectedReturnDateStr: string, checkoutDateStr?: string): DateDiffResult {
  if (!expectedReturnDateStr) {
    return {
      days: 0,
      isOverdue: false,
      text: "Indefinite loan (No end date)"
    };
  }
  const today = new Date();
  const due = parseDate(expectedReturnDateStr);
  
  // Reset hours to avoid time-of-day offsets
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      days: overdueDays,
      isOverdue: true,
      text: `${overdueDays} day${overdueDays > 1 ? "s" : ""} overdue`
    };
  } else if (diffDays === 0) {
    return {
      days: 0,
      isOverdue: false,
      text: "Due today"
    };
  } else {
    return {
      days: diffDays,
      isOverdue: false,
      text: `Due in ${diffDays} day${diffDays > 1 ? "s" : ""}`
    };
  }
}

export function formatFriendlyDate(dateStr: string): string {
  if (!dateStr) return "Indefinite (No return date)";
  try {
    const date = parseDate(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  } catch (e) {
    return dateStr;
  }
}

export function getEmploymentStatusMeta(status?: EmploymentStatus): {
  label: EmploymentStatus;
  textClass: string;
  dotClass: string;
  warningText?: string;
} {
  const normalized: EmploymentStatus = status || "Full-Time";
  switch (normalized) {
    case "Full-Time":
      return {
        label: "Full-Time",
        textClass: "text-emerald-700",
        dotClass: "bg-emerald-500"
      };
    case "Part-Time":
      return {
        label: "Part-Time",
        textClass: "text-blue-700",
        dotClass: "bg-blue-500"
      };
    case "Contractor":
      return {
        label: "Contractor",
        textClass: "text-indigo-700",
        dotClass: "bg-indigo-500"
      };
    case "Intern":
      return {
        label: "Intern",
        textClass: "text-amber-700",
        dotClass: "bg-amber-500"
      };
    case "On Leave":
      return {
        label: "On Leave",
        textClass: "text-amber-800",
        dotClass: "bg-amber-600",
        warningText: "This borrower is currently marked as On Leave."
      };
    case "Offboarded":
      return {
        label: "Offboarded",
        textClass: "text-rose-700",
        dotClass: "bg-rose-500",
        warningText: "This borrower is marked as Offboarded. Verify eligibility before issuing hardware."
      };
    default:
      return {
        label: "Full-Time",
        textClass: "text-emerald-700",
        dotClass: "bg-emerald-500"
      };
  }
}
