import {
  InventoryTransaction,
  type IInventoryTransaction,
  InventoryTransactionType,
} from "../../models/InventoryTransaction.js";
import { Product } from "../../models/Product.js";
import { ProductStatus } from "../../constants/productStatus.js";

export const createInventoryTransaction =
  async (data: {
    productId: string;
    sellerId: string;
    type: InventoryTransactionType;
    quantity: number;
    previousStock: number;
    newStock: number;
    actorId: string;
    actorRole: string;
    reason: string;
    referenceId?: string | null;
    referenceType?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<IInventoryTransaction> => {
    const doc: Record<string, unknown> = {
      productId: data.productId,
      sellerId: data.sellerId,
      type: data.type,
      quantity: data.quantity,
      previousStock: data.previousStock,
      newStock: data.newStock,
      actorId: data.actorId,
      actorRole: data.actorRole,
      reason: data.reason,
    };

    if (data.referenceId != null) {
      doc.referenceId = data.referenceId;
    }

    if (data.referenceType != null) {
      doc.referenceType = data.referenceType;
    }

    if (data.metadata != null) {
      doc.metadata = data.metadata;
    }

    return InventoryTransaction.create(doc);
  };

export const listInventoryTransactions =
  async (
    productId: string,
    page: number,
    limit: number,
  ): Promise<{
    items: IInventoryTransaction[];
    total: number;
  }> => {
    const [items, total] = await Promise.all([
      InventoryTransaction.find({ productId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      InventoryTransaction.countDocuments({
        productId,
      }).exec(),
    ]);

    return { items, total };
  };

export const listInventoryTransactionsBySeller =
  async (
    sellerId: string,
    page: number,
    limit: number,
  ): Promise<{
    items: IInventoryTransaction[];
    total: number;
  }> => {
    const [items, total] = await Promise.all([
      InventoryTransaction.find({ sellerId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      InventoryTransaction.countDocuments({
        sellerId,
      }).exec(),
    ]);

    return { items, total };
  };

export const getProductStock = async (
  productId: string,
): Promise<number | null> => {
  const product = await Product.findById(productId)
    .select("stock")
    .exec();

  return product?.stock ?? null;
};
