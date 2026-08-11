const MONEY_PATTERN = /^\d+(\.\d{1,4})?$/;
const QUANTITY_PATTERN = /^\d+(\.\d{1,4})?$/;

function toScaledInteger(value: string, targetScale: number): bigint | null {
  const trimmed = value.trim();
  const pattern = targetScale === 2 ? MONEY_PATTERN : QUANTITY_PATTERN;

  if (!pattern.test(trimmed)) {
    return null;
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const normalized = `${whole}${fraction.padEnd(targetScale, "0").slice(0, targetScale)}`;
  return BigInt(normalized);
}

function fromScaledInteger(value: bigint, scale: number): string {
  const factor = 10n ** BigInt(scale);
  const whole = value / factor;
  const fraction = (value % factor).toString().padStart(scale, "0");

  if (scale === 2) {
    return `${whole}.${fraction}`;
  }

  return `${whole}.${fraction.replace(/0+$/, "") || "0"}`.replace(/\.$/, "");
}

export function isValidMoneyInput(value: string): boolean {
  return toScaledInteger(value, 2) !== null;
}

export function multiplyMoney(unitPrice: string, quantity: string): string | null {
  const priceValue = toScaledInteger(unitPrice, 2);
  const quantityValue = toScaledInteger(quantity, 4);

  if (priceValue === null || quantityValue === null) {
    return null;
  }

  const result = (priceValue * quantityValue) / 10000n;
  return fromScaledInteger(result, 2);
}

export function addMoney(left: string, right: string): string | null {
  const leftValue = toScaledInteger(left, 2);
  const rightValue = toScaledInteger(right, 2);

  if (leftValue === null || rightValue === null) {
    return null;
  }

  return fromScaledInteger(leftValue + rightValue, 2);
}

export function subtractMoney(left: string, right: string): string | null {
  const leftValue = toScaledInteger(left, 2);
  const rightValue = toScaledInteger(right, 2);

  if (leftValue === null || rightValue === null) {
    return null;
  }

  if (leftValue < rightValue) {
    return null;
  }

  return fromScaledInteger(leftValue - rightValue, 2);
}

export function sumMoney(values: string[]): string | null {
  return values.reduce<string | null>((total, value) => {
    if (total === null) {
      return null;
    }

    return addMoney(total, value);
  }, "0.00");
}

export function compareMoney(left: string, right: string): number | null {
  const leftValue = toScaledInteger(left, 2);
  const rightValue = toScaledInteger(right, 2);

  if (leftValue === null || rightValue === null) {
    return null;
  }

  if (leftValue === rightValue) {
    return 0;
  }

  return leftValue > rightValue ? 1 : -1;
}
