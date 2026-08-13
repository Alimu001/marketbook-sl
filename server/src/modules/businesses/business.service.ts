import type {
  BusinessDetails,
  BusinessMemberSummary,
  BusinessMembership,
  BusinessSummary,
  CreateBusinessResponse,
} from "@marketbook/shared/types";
import type {
  CreateBusinessInput,
  UpdateBusinessInput,
  UpdateMemberRoleInput,
} from "@marketbook/shared/validation";
import type { Business, BusinessMember } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import { DEFAULT_EXPENSE_CATEGORIES } from "../expenses/defaultCategories.js";

function toBusinessDetails(business: Business): BusinessDetails {
  return {
    id: business.id,
    name: business.name,
    createdAt: business.createdAt.toISOString(),
    updatedAt: business.updatedAt.toISOString(),
  };
}

function toBusinessMembership(membership: BusinessMember): BusinessMembership {
  return {
    id: membership.id,
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
  };
}

function toBusinessSummary(
  business: Business,
  membership: BusinessMember,
): BusinessSummary {
  return {
    id: business.id,
    name: business.name,
    role: membership.role,
    createdAt: business.createdAt.toISOString(),
  };
}

export async function createBusiness(
  userId: string,
  input: CreateBusinessInput,
): Promise<CreateBusinessResponse> {
  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        name: input.name,
      },
    });

    const membership = await tx.businessMember.create({
      data: {
        userId,
        businessId: business.id,
        role: "owner",
      },
    });

    await tx.expenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.map((category) => ({
        businessId: business.id,
        name: category.name,
        description: category.description,
      })),
    });

    return { business, membership };
  });

  return {
    business: toBusinessDetails(result.business),
    membership: toBusinessMembership(result.membership),
  };
}

export async function listBusinesses(userId: string): Promise<BusinessSummary[]> {
  const memberships = await prisma.businessMember.findMany({
    where: { userId },
    include: { business: true },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((membership) =>
    toBusinessSummary(membership.business, membership),
  );
}

export async function getBusiness(businessId: string): Promise<BusinessDetails> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new AppError(403, "Access denied", "FORBIDDEN");
  }

  return toBusinessDetails(business);
}

export async function updateBusiness(
  businessId: string,
  input: UpdateBusinessInput,
): Promise<BusinessDetails> {
  const business = await prisma.business.update({
    where: { id: businessId },
    data: {
      name: input.name,
    },
  });

  return toBusinessDetails(business);
}

export async function listMembers(
  businessId: string,
): Promise<BusinessMemberSummary[]> {
  const members = await prisma.businessMember.findMany({
    where: { businessId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return members.map((member) => ({
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    role: member.role,
    joinedAt: member.createdAt.toISOString(),
  }));
}

export async function updateMemberRole(
  businessId: string,
  targetUserId: string,
  actingUserId: string,
  input: UpdateMemberRoleInput,
): Promise<BusinessMemberSummary> {
  if (targetUserId === actingUserId) {
    throw new AppError(403, "Access denied", "FORBIDDEN");
  }

  const targetMember = await prisma.businessMember.findUnique({
    where: {
      userId_businessId: {
        userId: targetUserId,
        businessId,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!targetMember) {
    throw new AppError(404, "Member not found", "NOT_FOUND");
  }

  if (targetMember.role === "owner") {
    throw new AppError(403, "Access denied", "FORBIDDEN");
  }

  const updatedMember = await prisma.businessMember.update({
    where: { id: targetMember.id },
    data: { role: input.role },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return {
    userId: updatedMember.user.id,
    name: updatedMember.user.name,
    email: updatedMember.user.email,
    role: updatedMember.role,
    joinedAt: updatedMember.createdAt.toISOString(),
  };
}

export async function removeMember(
  businessId: string,
  targetUserId: string,
): Promise<void> {
  const targetMember = await prisma.businessMember.findUnique({
    where: {
      userId_businessId: {
        userId: targetUserId,
        businessId,
      },
    },
  });

  if (!targetMember) {
    throw new AppError(404, "Member not found", "NOT_FOUND");
  }

  if (targetMember.role === "owner") {
    throw new AppError(403, "Access denied", "FORBIDDEN");
  }

  await prisma.businessMember.delete({
    where: { id: targetMember.id },
  });
}
