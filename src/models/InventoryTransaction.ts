import {
  Schema,
  model,
  type Types,
} from "mongoose";

export enum InventoryTransactionType {
  STOCK_DECREMENT = "STOCK_DECREMENT",
  STOCK_INCREMENT = "STOCK_INCREMENT",
  ORDER_CANCELLED = "ORDER_CANCELLED",
  /* Stock credited back when a seller approves a buyer's return. */
  RETURN_RESTOCK = "RETURN_RESTOCK",
  MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT",
  INITIAL_STOCK = "INITIAL_STOCK",
}

export interface IInventoryTransaction {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  sellerId: Types.ObjectId;
  type: InventoryTransactionType;
  quantity: number;
  previousStock: number;
  newStock: number;
  actorId: string;
  actorRole: string;
  reason: string;
  referenceId?: Types.ObjectId | null;
  referenceType?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const inventoryTransactionSchema =
  new Schema<IInventoryTransaction>(
    {
      productId: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true,
        index: true,
      },

      sellerId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      type: {
        type: String,
        enum: Object.values(
          InventoryTransactionType,
        ),
        required: true,
      },

      quantity: {
        type: Number,
        required: true,
      },

      previousStock: {
        type: Number,
        required: true,
      },

      newStock: {
        type: Number,
        required: true,
      },

      actorId: {
        type: String,
        required: true,
      },

      actorRole: {
        type: String,
        required: true,
      },

      reason: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500,
      },

      referenceId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      referenceType: {
        type: String,
        trim: true,
        maxlength: 50,
        default: null,
      },

      metadata: {
        type: Schema.Types.Mixed,
        default: null,
      },
    },
    {
      timestamps: { createdAt: true, updatedAt: false },
    },
  );

inventoryTransactionSchema.index({
  productId: 1,
  createdAt: -1,
});

inventoryTransactionSchema.index({
  sellerId: 1,
  createdAt: -1,
});

export const InventoryTransaction = model<
  IInventoryTransaction
>("InventoryTransaction", inventoryTransactionSchema);
