import { createHash } from "node:crypto";
import type { ClientMutationEntityType } from "../../generated/prisma/client.js";
import { prisma } from "./prisma.js";
import { AppError } from "../middleware/errorHandler.js";

const MIN_MUTATION_ID_LENGTH = 8;
const MAX_MUTATION_ID_LENGTH = 128;

export function hashMutationPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function normalizeMutationId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  if (
    trimmed.length < MIN_MUTATION_ID_LENGTH ||
    trimmed.length > MAX_MUTATION_ID_LENGTH
  ) {
    return undefined;
  }

  return trimmed;
}

export function getIdempotencyKeyFromRequest(
  headers: Record<string, unknown>,
): string | undefined {
  const raw = headers["idempotency-key"];

  if (typeof raw === "string") {
    return normalizeMutationId(raw);
  }

  if (Array.isArray(raw) && typeof raw[0] === "string") {
    return normalizeMutationId(raw[0]);
  }

  return undefined;
}

interface ExecuteIdempotentMutationOptions<T> {
  businessId: string;
  userId: string;
  mutationId?: string | undefined;
  entityType: ClientMutationEntityType;
  payload: unknown;
  execute: () => Promise<{ entityId: string; result: T }>;
  loadExisting: (entityId: string) => Promise<T>;
}

function validateExistingMutation(
  existing: {
    userId: string;
    payloadHash: string;
    resultEntityId: string | null;
  },
  userId: string,
  payloadHash: string,
): string | null {
  if (existing.userId !== userId) {
    throw new AppError(
      403,
      "Unauthorized mutation replay",
      "MUTATION_UNAUTHORIZED",
    );
  }

  if (existing.payloadHash !== payloadHash) {
    throw new AppError(
      409,
      "Idempotency key already used with different request body",
      "IDEMPOTENCY_CONFLICT",
    );
  }

  return existing.resultEntityId;
}

export async function executeIdempotentMutation<T>(
  options: ExecuteIdempotentMutationOptions<T>,
): Promise<T> {
  if (!options.mutationId) {
    const created = await options.execute();
    return created.result;
  }

  const mutationId = options.mutationId;
  const payloadHash = hashMutationPayload(options.payload);
  const mutationKey = {
    businessId: options.businessId,
    mutationId,
  };

  return prisma.$transaction(async (tx) => {
    const lockKey = `${options.businessId}:${mutationId}`;
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) IS NULL AS "locked"
    `;

    const existing = await tx.clientMutation.findUnique({
      where: { businessId_mutationId: mutationKey },
    });

    if (existing) {
      const resultEntityId = validateExistingMutation(
        existing,
        options.userId,
        payloadHash,
      );
      if (resultEntityId) return options.loadExisting(resultEntityId);
    } else {
      await tx.clientMutation.create({
        data: {
          businessId: options.businessId,
          userId: options.userId,
          mutationId,
          entityType: options.entityType,
          payloadHash,
        },
      });
    }

    const created = await options.execute();

    await tx.clientMutation.update({
      where: { businessId_mutationId: mutationKey },
      data: { resultEntityId: created.entityId },
    });

    return created.result;
  });
}
