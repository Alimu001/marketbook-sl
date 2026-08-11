const MONEY_INPUT_PATTERN = /^\d+(\.\d{1,2})?$/;

export function isValidMoneyInput(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed || !MONEY_INPUT_PATTERN.test(trimmed)) {
    return false;
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const normalized = `${whole}.${fraction.padEnd(2, "0")}`;
  const parts = normalized.split(".");

  if (parts.length !== 2) {
    return false;
  }

  return !normalized.startsWith("-");
}

export function parseMoneyInput(value: string): number {
  const trimmed = value.trim();
  const [whole, fraction = ""] = trimmed.split(".");
  const normalized = `${whole}.${fraction.padEnd(2, "0")}`;

  return Number(normalized);
}

export function formatMoneyDisplay(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "NLe 0.00";
  }

  if (!isValidMoneyInput(trimmed)) {
    return `NLe ${trimmed}`;
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const normalized = `${whole}.${fraction.padEnd(2, "0")}`;

  return `NLe ${normalized}`;
}

export function formatProductPrice(value: string, unit: string): string {
  return `${formatMoneyDisplay(value)} / ${unit}`;
}

export function formatDateDisplay(isoDate: string): string {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
