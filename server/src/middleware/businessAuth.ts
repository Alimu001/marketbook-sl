import type { BusinessRole } from "@marketbook/shared/constants";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getRouteParam } from "../lib/routeParams.js";
import { AppError } from "./errorHandler.js";

export function requireBusinessRole(...allowedRoles: BusinessRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.business) {
        throw new AppError(
          500,
          "Business context is missing",
          "INTERNAL_ERROR",
        );
      }

      if (!allowedRoles.includes(req.business.role)) {
        throw new AppError(403, "Access denied", "FORBIDDEN");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function requireBusinessMembership(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth?.userId;
    const businessId = getRouteParam(req.params.businessId);

    if (!userId) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    if (!businessId) {
      throw new AppError(400, "Business ID is required", "VALIDATION_ERROR");
    }

    const membership = await prisma.businessMember.findUnique({
      where: {
        userId_businessId: {
          userId,
          businessId,
        },
      },
    });

    if (!membership) {
      throw new AppError(403, "Access denied", "FORBIDDEN");
    }

    req.business = {
      id: membership.businessId,
      membershipId: membership.id,
      role: membership.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}
