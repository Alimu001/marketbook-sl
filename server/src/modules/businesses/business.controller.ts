import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../middleware/errorHandler.js";
import { getRouteParam } from "../../lib/routeParams.js";
import * as businessService from "./business.service.js";

export async function createBusiness(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    const result = await businessService.createBusiness(userId, req.body);
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function listBusinesses(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    const businesses = await businessService.listBusinesses(userId);
    res.status(200).json({ data: businesses });
  } catch (error) {
    next(error);
  }
}

export async function getBusiness(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const businessId = req.business?.id;

    if (!businessId) {
      throw new AppError(500, "Business context is missing", "INTERNAL_ERROR");
    }

    const business = await businessService.getBusiness(businessId);
    res.status(200).json({ data: business });
  } catch (error) {
    next(error);
  }
}

export async function updateBusiness(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const businessId = req.business?.id;

    if (!businessId) {
      throw new AppError(500, "Business context is missing", "INTERNAL_ERROR");
    }

    const business = await businessService.updateBusiness(businessId, req.body);
    res.status(200).json({ data: business });
  } catch (error) {
    next(error);
  }
}

export async function listMembers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const businessId = req.business?.id;

    if (!businessId) {
      throw new AppError(500, "Business context is missing", "INTERNAL_ERROR");
    }

    const members = await businessService.listMembers(businessId);
    res.status(200).json({ data: members });
  } catch (error) {
    next(error);
  }
}

export async function updateMemberRole(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const businessId = req.business?.id;
    const actingUserId = req.auth?.userId;
    const targetUserId = getRouteParam(req.params.userId);

    if (!businessId || !actingUserId || !targetUserId) {
      throw new AppError(500, "Business context is missing", "INTERNAL_ERROR");
    }

    const member = await businessService.updateMemberRole(
      businessId,
      targetUserId,
      actingUserId,
      req.body,
    );
    res.status(200).json({ data: member });
  } catch (error) {
    next(error);
  }
}

export async function removeMember(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const businessId = req.business?.id;
    const targetUserId = getRouteParam(req.params.userId);

    if (!businessId || !targetUserId) {
      throw new AppError(500, "Business context is missing", "INTERNAL_ERROR");
    }

    await businessService.removeMember(businessId, targetUserId);
    res.status(200).json({ data: { success: true } });
  } catch (error) {
    next(error);
  }
}
