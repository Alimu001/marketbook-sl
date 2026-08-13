import { createHash } from "node:crypto";
import type { ClientMutationEntityType } from "../../generated/prisma/client.js";
import { Prisma } from "../../generated/prisma/client.js";
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

  const payloadHash = hashMutationPayload(options.payload);
  const mutationKey = {
    businessId: options.businessId,
    mutationId: options.mutationId,
  };

  const existing = await prisma.clientMutation.findUnique({
    where: {
      businessId_mutationId: mutationKey,
    },
  });

  if (existing) {
    const resultEntityId = validateExistingMutation(
      existing,
      options.userId,
      payloadHash,
    );

    if (resultEntityId) {
      return options.loadExisting(resultEntityId);
    }
  } else {
    try {
      await prisma.clientMutation.create({
        data: {
          businessId: options.businessId,
          userId: options.userId,
          mutationId: options.mutationId,
          entityType: options.entityType,
          payloadHash,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await prisma.clientMutation.findUnique({
          where: {
            businessId_mutationId: mutationKey,
          },
        });

        if (!raced) {
          throw error;
        }

        const resultEntityId = validateExistingMutation(
          raced,
          options.userId,
          payloadHash,
        );

        if (resultEntityId) {
          return options.loadExisting(resultEntityId);
        }
      } else {
        throw error;
      }
    }
  }

  const created = await options.execute();

  await prisma.clientMutation.update({
    where: {
      businessId_mutationId: mutationKey,
    },
    data: {
      resultEntityId: created.entityId,
    },
  });

  return created.result;
}
