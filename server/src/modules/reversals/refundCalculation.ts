import { Prisma } from "../../../generated/prisma/client.js";

export function calculateLineRefundAmount(
  subtotal: Prisma.Decimal,
  discountAmount: Prisma.Decimal,
  lineSubtotal: Prisma.Decimal,
  itemQuantity: Prisma.Decimal,
  refundQuantity: Prisma.Decimal,
): Prisma.Decimal {
  if (subtotal.lte(0) || itemQuantity.lte(0)) {
    return new Prisma.Decimal(0);
  }

  const lineDiscountShare = discountAmount
    .mul(lineSubtotal)
    .div(subtotal);
  const lineNetAmount = lineSubtotal.sub(lineDiscountShare);
  const refundFraction = refundQuantity.div(itemQuantity);

  return lineNetAmount.mul(refundFraction).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function calculateEstimatedRefundPerUnit(
  subtotal: Prisma.Decimal,
  discountAmount: Prisma.Decimal,
  lineSubtotal: Prisma.Decimal,
  itemQuantity: Prisma.Decimal,
): Prisma.Decimal {
  if (itemQuantity.lte(0)) {
    return new Prisma.Decimal(0);
  }

  return calculateLineRefundAmount(
    subtotal,
    discountAmount,
    lineSubtotal,
    itemQuantity,
    new Prisma.Decimal(1),
  );
}
