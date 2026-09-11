import { Schema, model, type Types } from "mongoose";

import {
  RefundMethod,
  RefundStatus,
} from "../constants/payment.js";
import { ReturnStatus } from "../constants/returnStatus.js";

/*
 * Money side of an approved return. Written when the seller approves
 * the request and finalised once the refund reached the buyer, so the
 * ledger for "who was paid back, how much and when" lives on the return
 * itself and can never be double-issued (see the claim in
 * return.repository.ts).
 */
export interface IReturnRefund {
  /* Eligible amount: what the buyer actually paid for the order. */
  amount: number;
  status: RefundStatus;
  method: RefundMethod;
  /* Gateway refund id for online payments, null for COD/offline. */
  gatewayRefundId: string | null;
  paymentId: Types.ObjectId | null;
  reason: string | null;
  requestedAt: Date | null;
  completedAt: Date | null;
}

export interface IReturnRequest {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  userId: Types.ObjectId;
  sellerId: Types.ObjectId;
  reason: string;
  status: ReturnStatus;
  /* Required when a return is rejected. */
  statusReason?: string | null;
  /* Set atomically when a seller/admin approves the request. */
  approvedAt?: Date | null;
  /* Actor (seller or admin user id) that decided the request. */
  decidedBy?: Types.ObjectId | null;
  decidedRole?: string | null;
  /*
   * Set once the returned stock has been credited back to the seller's
   * inventory. The claim on this field is what makes repeated
   * approvals/completions restore the stock exactly once.
   */
  stockRestoredAt?: Date | null;
  refund?: IReturnRefund | null;
  createdAt: Date;
  updatedAt: Date;
}

const returnRefundSchema = new Schema<IReturnRefund>(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: Object.values(RefundStatus),
      default: RefundStatus.PENDING,
    },

    method: {
      type: String,
      enum: Object.values(RefundMethod),
      default: RefundMethod.NONE,
    },

    gatewayRefundId: {
      type: String,
      default: null,
    },

    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },

    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    requestedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  },
);

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

    approvedAt: {
      type: Date,
      default: null,
    },

    decidedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    decidedRole: {
      type: String,
      trim: true,
      maxlength: 30,
      default: null,
    },

    stockRestoredAt: {
      type: Date,
      default: null,
    },

    refund: {
      type: returnRefundSchema,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

returnRequestSchema.index({ sellerId: 1, status: 1 });
returnRequestSchema.index({ userId: 1, createdAt: -1 });
returnRequestSchema.index({ orderId: 1, status: 1 });

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
