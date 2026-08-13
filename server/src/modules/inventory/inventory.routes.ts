import { Router } from "express";
import {
  inventoryHistoryQuerySchema,
  listInventoryQuerySchema,
  openingStockSchema,
  stockAdjustmentSchema,
  updateLowStockThresholdSchema,
} from "@marketbook/shared/validation";
import { requireBusinessRole } from "../../middleware/businessAuth.js";
import { validate, validateQuery } from "../../middleware/validate.js";
import * as inventoryController from "./inventory.controller.js";

export const inventoryListRouter = Router({ mergeParams: true });

inventoryListRouter.get(
  "/",
  validateQuery(listInventoryQuerySchema),
  inventoryController.listInventory,
);

export const inventoryProductRouter = Router({ mergeParams: true });

inventoryProductRouter.get("/", inventoryController.getInventoryBalance);

inventoryProductRouter.post(
  "/opening",
  requireBusinessRole("owner", "admin", "staff"),
  validate(openingStockSchema),
  inventoryController.setOpeningStock,
);

inventoryProductRouter.post(
  "/adjust",
  requireBusinessRole("owner", "admin", "staff"),
  validate(stockAdjustmentSchema),
  inventoryController.adjustInventory,
);

inventoryProductRouter.patch(
  "/threshold",
  requireBusinessRole("owner", "admin", "staff"),
  validate(updateLowStockThresholdSchema),
  inventoryController.updateLowStockThreshold,
);

inventoryProductRouter.get(
  "/history",
  validateQuery(inventoryHistoryQuerySchema),
  inventoryController.getInventoryHistory,
);
