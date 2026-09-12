import { AppError } from "../middleware/errorHandler.js";
import {
  expenseDateToQueryBound,
  formatExpenseDateOutput,
  parseExpenseDateInput,
} from "./expenseDate.js";

export interface ReportDateTimeBounds {
  from: Date;
  to: Date;
}

export function parseReportDateInput(value: string): Date {
  try {
    return parseExpenseDateInput(value);
  } catch {
    throw new AppError(400, "Invalid report date", "INVALID_REPORT_DATE_RANGE");
  }
}

export function formatReportDateOutput(date: Date): string {
  return formatExpenseDateOutput(date);
}

export function reportDateRangeToDateTimeBounds(
  from: string,
  to: string,
): ReportDateTimeBounds {
  return {
    from: parseReportDateInput(from),
    to: expenseDateToQueryBound(to, true),
  };
}

export function reportDateRangeToExpenseDateBounds(
  from: string,
  to: string,
): ReportDateTimeBounds {
  return {
    from: parseReportDateInput(from),
    to: parseReportDateInput(to),
  };
}
