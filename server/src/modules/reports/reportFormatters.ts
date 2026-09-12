import { Prisma } from "../../../generated/prisma/client.js";
import { formatMoney } from "../../lib/money.js";

export function decimalFromUnknown(value: unknown): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) {
    return value;
  }

  if (value === null || value === undefined) {
    return new Prisma.Decimal(0);
  }

  return new Prisma.Decimal(String(value));
}

export function formatMoneyFromUnknown(value: unknown): string {
  return formatMoney(decimalFromUnknown(value));
}

export function calculatePercentage(
  part: Prisma.Decimal,
  total: Prisma.Decimal,
): string {
  if (total.lte(0)) {
    return "0.00";
  }

  return part.div(total).mul(100).toFixed(2);
}

export function calculateAverage(
  total: Prisma.Decimal,
  count: number,
): string {
  if (count <= 0) {
    return "0.00";
  }

  return formatMoney(total.div(count));
}

export function escapeCsvField(value: string): string {
  let sanitized = value.replace(/\r?\n/g, " ");

  if (/^[=+\-@]/.test(sanitized)) {
    sanitized = `'${sanitized}`;
  }

  if (/[",]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }

  return sanitized;
}

export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) => row.map(escapeCsvField).join(",")),
  ];

  return `${lines.join("\n")}\n`;
}
