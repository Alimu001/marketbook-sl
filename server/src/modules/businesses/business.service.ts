import type {
  BusinessDetails,
  BusinessMemberSummary,
  BusinessActivitySummary,
  BusinessMembership,
  BusinessSummary,
  CreateBusinessResponse,
} from "@marketbook/shared/types";
import type {
  CreateBusinessInput,
  UpdateBusinessInput,
  UpdateMemberRoleInput,
  AddBusinessMemberInput,
  ListBusinessActivitiesQuery,
  ResetMemberPasswordInput,
} from "@marketbook/shared/validation";
import type { Business, BusinessMember } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import { DEFAULT_EXPENSE_CATEGORIES } from "../expenses/defaultCategories.js";
import { DEFAULT_RECEIPT_FOOTER } from "../../config/constants.js";
import { hashPassword } from "../../lib/bcrypt.js";

function toBusinessDetails(business: Business): BusinessDetails {
  return {
    id: business.id,
    name: business.name,
    email: business.email,
    phone: business.phone,
    address: business.address,
    receiptFooter: business.receiptFooter,
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
    const owner = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    const business = await tx.business.create({
      data: {
        name: input.name,
        email: owner.email,
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        receiptFooter: DEFAULT_RECEIPT_FOOTER,
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
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.receiptFooter !== undefined
        ? { receiptFooter: input.receiptFooter }
        : {}),
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

export async function addMember(
  businessId: string,
  input: AddBusinessMemberInput,
): Promise<BusinessMemberSummary> {
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existingUser) {
    throw new AppError(
      409,
      "An account already exists with that email",
      "EMAIL_EXISTS",
    );
  }

  const passwordHash = await hashPassword(input.password);
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        mustChangePassword: true,
      },
      select: { id: true, name: true, email: true },
    });
    const member = await tx.businessMember.create({
      data: { businessId, userId: user.id, role: input.role },
    });
    return { user, member };
  });

  return {
    userId: result.user.id,
    name: result.user.name,
    email: result.user.email,
    role: result.member.role,
    joinedAt: result.member.createdAt.toISOString(),
  };
}

export async function resetMemberPassword(
  businessId: string,
  targetUserId: string,
  actingUserId: string,
  input: ResetMemberPasswordInput,
): Promise<void> {
  if (targetUserId === actingUserId) {
    throw new AppError(403, "Use personal settings to change your password", "FORBIDDEN");
  }
  const membership = await prisma.businessMember.findUnique({
    where: { userId_businessId: { userId: targetUserId, businessId } },
  });
  if (!membership || membership.role === "owner") {
    throw new AppError(404, "Member not found", "NOT_FOUND");
  }
  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetUserId },
      data: { passwordHash, mustChangePassword: true },
    }),
    prisma.refreshToken.deleteMany({ where: { userId: targetUserId } }),
  ]);
}

export async function listActivities(
  businessId: string,
  query: ListBusinessActivitiesQuery,
): Promise<{
  items: BusinessActivitySummary[];
  page: number;
  limit: number;
  total: number;
}> {
  const where = {
    businessId,
    ...(query.userId ? { actorUserId: query.userId } : {}),
  };
  const [activities, total] = await prisma.$transaction([
    prisma.businessActivity.findMany({
      where,
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.businessActivity.count({ where }),
  ]);

  return {
    items: activities.map((activity) => ({
      id: activity.id,
      actorUserId: activity.actorUserId,
      actorName: activity.actor.name,
      actorEmail: activity.actor.email,
      method: activity.method,
      path: activity.path,
      statusCode: activity.statusCode,
      createdAt: activity.createdAt.toISOString(),
    })),
    page: query.page,
    limit: query.limit,
    total,
  };
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
