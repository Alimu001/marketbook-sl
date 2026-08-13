const QUANTITY_PATTERN = /^\d+(\.\d{1,4})?$/;

export function isValidQuantityInput(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && QUANTITY_PATTERN.test(trimmed) && !trimmed.startsWith("-");
}

export function normalizeQuantity(value: string): string {
  const trimmed = value.trim();
  if (!QUANTITY_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return trimmed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function formatQuantityDisplay(value: string): string {
  return normalizeQuantity(value);
}

export function formatQuantityWithUnit(quantity: string, unit: string): string {
  return `${formatQuantityDisplay(quantity)} ${unit}`;
}

export function formatSignedQuantityChange(value: string): string {
  const normalized = formatQuantityDisplay(value);
  if (normalized.startsWith("-")) {
    return normalized;
  }

  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}

export function addQuantities(base: string, delta: string): string | null {
  if (!isValidQuantityInput(base) || !isValidQuantityInput(delta)) {
    return null;
  }

  const baseParts = base.trim().split(".");
  const deltaParts = delta.trim().split(".");
  const scale = Math.max(baseParts[1]?.length ?? 0, deltaParts[1]?.length ?? 0);
  const factor = 10 ** scale;
  const baseInt = BigInt(baseParts[0] + (baseParts[1] ?? "").padEnd(scale, "0"));
  const deltaInt = BigInt(deltaParts[0] + (deltaParts[1] ?? "").padEnd(scale, "0"));
  const result = baseInt + deltaInt;

  if (result < 0n) {
    return null;
  }

  const whole = result / BigInt(factor);
  const fraction = result % BigInt(factor);
  if (fraction === 0n) {
    return whole.toString();
  }

  return `${whole}.${fraction.toString().padStart(scale, "0").replace(/0+$/, "")}`;
}

export function subtractQuantities(base: string, amount: string): string | null {
  if (!isValidQuantityInput(base) || !isValidQuantityInput(amount)) {
    return null;
  }

  const baseParts = base.trim().split(".");
  const amountParts = amount.trim().split(".");
  const scale = Math.max(baseParts[1]?.length ?? 0, amountParts[1]?.length ?? 0);
  const factor = 10 ** scale;
  const baseInt = BigInt(baseParts[0] + (baseParts[1] ?? "").padEnd(scale, "0"));
  const amountInt = BigInt(amountParts[0] + (amountParts[1] ?? "").padEnd(scale, "0"));
  const result = baseInt - amountInt;

  if (result < 0n) {
    return null;
  }

  const whole = result / BigInt(factor);
  const fraction = result % BigInt(factor);
  if (fraction === 0n) {
    return whole.toString();
  }

  return `${whole}.${fraction.toString().padStart(scale, "0").replace(/0+$/, "")}`;
}
