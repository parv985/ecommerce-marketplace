import { Schema, model, type Types } from "mongoose";

import { ReturnStatus } from "../constants/returnStatus.js";

export interface IReturnRequest {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  userId: Types.ObjectId;
  sellerId: Types.ObjectId;
  reason: string;
  status: ReturnStatus;
  /* Required when a return is rejected. */
  statusReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const returnRequestSchema = new Schema<IReturnRequest>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 500,
    },

    status: {
      type: String,
      enum: Object.values(ReturnStatus),
      default: ReturnStatus.PENDING,
      index: true,
    },

    statusReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

returnRequestSchema.index({ sellerId: 1, status: 1 });
returnRequestSchema.index({ userId: 1, createdAt: -1 });

/*
 * At most one ACTIVE return per order (PENDING / APPROVED / COMPLETED).
 * REJECTED and CANCELLED returns fall outside the index, so the buyer
 * can re-request within the return window. The partial unique index
 * also makes concurrent duplicate requests fail atomically.
 */
returnRequestSchema.index(
  { orderId: 1 },
  {
    name: "orderId_active_unique",
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          ReturnStatus.PENDING,
          ReturnStatus.APPROVED,
          ReturnStatus.COMPLETED,
        ],
      },
    },
  },
);

export const ReturnRequest = model<IReturnRequest>(
  "ReturnRequest",
  returnRequestSchema,
);
