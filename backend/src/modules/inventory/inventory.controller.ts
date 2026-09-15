import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/apiResponse.js";
import {
  getProductTransactions,
  getSellerTransactions,
  incrementStockWithTransaction,
} from "./inventory.service.js";
import {
  findProductsBySeller,
} from "../products/product.repository.js";
import { InventoryTransactionType } from "../../models/InventoryTransaction.js";

export const listSellerInventoryController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const result = await getSellerTransactions(
      req.user!.id,
      page,
      limit,
    );

    sendSuccess(
      res,
      "Inventory transactions fetched successfully",
      result,
    );
  };

export const listProductInventoryController =
  async (
    req: Request<{ productId: string }>,
    res: Response,
  ): Promise<void> => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const result = await getProductTransactions(
      req.user!,
      req.params.productId,
      page,
      limit,
    );

    sendSuccess(
      res,
      "Product inventory transactions fetched successfully",
      result,
    );
  };

export const adjustStockController = async (
  req: Request<{ productId: string }>,
  res: Response,
): Promise<void> => {
  const { quantity, reason } = req.body;
  const productId = req.params.productId;

  if (quantity > 0) {
    const result = await incrementStockWithTransaction({
      productId,
      sellerId: req.user!.id,
      quantity,
      type: InventoryTransactionType.MANUAL_ADJUSTMENT,
      actorId: req.user!.id,
      actorRole: req.user!.role,
      reason,
    });

    sendSuccess(
      res,
      "Stock adjusted successfully",
      result,
    );
  } else if (quantity < 0) {
    const result = await incrementStockWithTransaction({
      productId,
      sellerId: req.user!.id,
      quantity: Math.abs(quantity),
      type: InventoryTransactionType.MANUAL_ADJUSTMENT,
      actorId: req.user!.id,
      actorRole: req.user!.role,
      reason,
    });

    sendSuccess(
      res,
      "Stock adjusted successfully",
      result,
    );
  } else {
    sendSuccess(
      res,
      "No adjustment needed",
      { previousStock: 0, newStock: 0 },
    );
  }
};
