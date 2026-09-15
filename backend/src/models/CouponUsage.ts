import { Schema, model, type Types } from "mongoose";

export interface ICouponUsage {
  _id: Types.ObjectId;
  couponId: Types.ObjectId;
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  discountAmount: number;
  usedAt: Date;
  /*
   * True when the parent coupon has perUserLimit = 1; feeds the
   * partial unique index (couponId, userId) for atomic enforcement.
   */
  enforcePerUserOne?: boolean;
  createdAt: Date;
}

const couponUsageSchema = new Schema<ICouponUsage>(
  {
    couponId: {
      type: Schema.Types.ObjectId,
      ref: "Coupon",
      required: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    discountAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    usedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    enforcePerUserOne: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

/*
 * One usage per (coupon, order): repeated checkouts for the same order
 * cannot create duplicate usage records.
 */
couponUsageSchema.index(
  { couponId: 1, orderId: 1 },
  { unique: true },
);

/*
 * Hard per-user cap for coupons configured with perUserLimit = 1
 * (the default). Claiming a second time for the same user fails on
 * this unique index even under concurrency.
 */
couponUsageSchema.index(
  { couponId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      enforcePerUserOne: true,
    },
  },
);

couponUsageSchema.index({ userId: 1, usedAt: -1 });

export const CouponUsage = model<ICouponUsage>(
  "CouponUsage",
  couponUsageSchema,
);
