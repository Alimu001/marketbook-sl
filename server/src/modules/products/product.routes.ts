import { Router } from "express";
import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from "@marketbook/shared/validation";
import { requireBusinessRole } from "../../middleware/businessAuth.js";
import { validate, validateQuery } from "../../middleware/validate.js";
import * as productController from "./product.controller.js";

export const productsRouter = Router({ mergeParams: true });

productsRouter.post(
  "/",
  requireBusinessRole("owner", "admin", "staff"),
  validate(createProductSchema),
  productController.createProduct,
);

productsRouter.get(
  "/",
  validateQuery(listProductsQuerySchema),
  productController.listProducts,
);

productsRouter.get("/:productId", productController.getProduct);

productsRouter.patch(
  "/:productId",
  requireBusinessRole("owner", "admin", "staff"),
  validate(updateProductSchema),
  productController.updateProduct,
);

productsRouter.patch(
  "/:productId/archive",
  requireBusinessRole("owner", "admin"),
  productController.archiveProduct,
);

productsRouter.patch(
  "/:productId/restore",
  requireBusinessRole("owner", "admin"),
  productController.restoreProduct,
);
