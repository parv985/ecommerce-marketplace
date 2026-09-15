import { AppError } from "../../errors/AppError.js";
import { UserRole } from "../../constants/roles.js";
import {
  InventoryTransactionType,
} from "../../models/InventoryTransaction.js";
import {
  createInventoryTransaction,
  listInventoryTransactions,
  listInventoryTransactionsBySeller,
} from "./inventory.repository.js";
import {
  decrementProductStock,
  incrementProductStock,
  findProductByIdAndSeller,
} from "../products/product.repository.js";

/**
 * Records an inventory transaction when stock changes.
 * Called after successful stock increment/decrement to maintain audit trail.
 */
export const recordStockChange = async (
  input: {
    productId: string;
    sellerId: string;
    type: InventoryTransactionType;
    quantity: number;
    previousStock: number;
    actorId: string;
    actorRole: string;
    reason: string;
    referenceId?: string;
    referenceType?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> => {
  await createInventoryTransaction({
    productId: input.productId,
    sellerId: input.sellerId,
    type: input.type,
    quantity: input.quantity,
    previousStock: input.previousStock,
    newStock: input.previousStock + input.quantity,
    actorId: input.actorId,
    actorRole: input.actorRole,
    reason: input.reason,
    ...(input.referenceId !== undefined && {
      referenceId: input.referenceId,
    }),
    ...(input.referenceType !== undefined && {
      referenceType: input.referenceType,
    }),
    ...(input.metadata !== undefined && {
      metadata: input.metadata,
    }),
  });
};

/**
 * Decrements stock atomically and records the transaction.
 * Returns the previous and new stock levels.
 */
export const decrementStockWithTransaction =
  async (
    input: {
      productId: string;
      sellerId: string;
      quantity: number;
      actorId: string;
      actorRole: string;
      reason: string;
      referenceId?: string;
      referenceType?: string;
    },
  ): Promise<{ previousStock: number; newStock: number }> => {
    const product = await findProductByIdAndSeller(
      input.productId,
      input.sellerId,
    );

    if (!product) {
      throw new AppError(
        "Product not found",
        404,
        "PRODUCT_NOT_FOUND",
      );
    }

    if (product.stock < input.quantity) {
      throw new AppError(
        `Insufficient stock. Available: ${product.stock}, requested: ${input.quantity}`,
        400,
        "INSUFFICIENT_STOCK",
      );
    }

    const previousStock = product.stock;

    const success = await decrementProductStock(
      input.productId,
      input.quantity,
    );

    if (!success) {
      throw new AppError(
        "Insufficient stock",
        400,
        "INSUFFICIENT_STOCK",
      );
    }

    const newStock = previousStock - input.quantity;

    await recordStockChange({
      productId: input.productId,
      sellerId: input.sellerId,
      type: InventoryTransactionType.STOCK_DECREMENT,
      quantity: -input.quantity,
      previousStock,
      actorId: input.actorId,
      actorRole: input.actorRole,
      reason: input.reason,
    });

    return { previousStock, newStock };
  };

/**
 * Increments stock atomically and records the transaction.
 * Used for order cancellations and manual adjustments.
 */
export const incrementStockWithTransaction =
  async (
    input: {
      productId: string;
      sellerId: string;
      quantity: number;
      type: InventoryTransactionType;
      actorId: string;
      actorRole: string;
      reason: string;
      referenceId?: string;
      referenceType?: string;
    },
  ): Promise<{ previousStock: number; newStock: number }> => {
    const product = await findProductByIdAndSeller(
      input.productId,
      input.sellerId,
    );

    if (!product) {
      throw new AppError(
        "Product not found",
        404,
        "PRODUCT_NOT_FOUND",
      );
    }

    const previousStock = product.stock;

    await incrementProductStock(
      input.productId,
      input.quantity,
    );

    const newStock = previousStock + input.quantity;

    await recordStockChange({
      productId: input.productId,
      sellerId: input.sellerId,
      type: input.type,
      quantity: input.quantity,
      previousStock,
      actorId: input.actorId,
      actorRole: input.actorRole,
      reason: input.reason,
    });

    return { previousStock, newStock };
  };

/**
 * Lists inventory transactions for a product with pagination.
 */
export const getProductTransactions = async (
  user: { id: string; role: UserRole },
  productId: string,
  page: number,
  limit: number,
) => {
  return listInventoryTransactions(
    productId,
    page,
    limit,
  );
};

/**
 * Lists inventory transactions for a seller's products with pagination.
 */
export const getSellerTransactions = async (
  sellerId: string,
  page: number,
  limit: number,
) => {
  return listInventoryTransactionsBySeller(
    sellerId,
    page,
    limit,
  );
};
