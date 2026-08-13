import { AppError } from "../middleware/errorHandler.js";

export function parseExpenseDateInput(value: string): Date {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  if (!match) {
    throw new AppError(400, "Invalid expense date", "INVALID_EXPENSE_DATE");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new AppError(400, "Invalid expense date", "INVALID_EXPENSE_DATE");
  }

  return date;
}

export function formatExpenseDateOutput(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function expenseDateToQueryBound(value: string, endOfDay: boolean): Date {
  const base = parseExpenseDateInput(value);

  if (!endOfDay) {
    return base;
  }

  return new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}
