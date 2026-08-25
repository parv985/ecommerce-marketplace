import { Schema, model, type Types } from "mongoose";

import {
  CouponStatus,
  CouponType,
} from "../constants/couponStatus.js";

export interface ICoupon {
  _id: Types.ObjectId;
  sellerId: Types.ObjectId;
  /* Normalized to uppercase. */
  code: string;
  type: CouponType;
  /* Percent (1-100) for PERCENTAGE, absolute amount for FIXED. */
  value: number;
  /* Minimum order value (after sales discounts) for the coupon to apply. */
  minOrderValue: number;
  /* Optional cap on the absolute discount amount. */
  maxDiscount?: number | null;
  /* Restriction lists; both empty means all of the seller's items qualify. */
  productIds: Types.ObjectId[];
  categoryIds: Types.ObjectId[];
  startAt: Date;
  endAt: Date;
  /* null = unlimited total uses. */
  usageLimit?: number | null;
  /* null = unlimited uses per user. */
  perUserLimit?: number | null;
  status: CouponStatus;
  /*
   * Live counter of claimed usages. Incremented atomically with a
   * $lt guard so concurrent requests can never exceed usageLimit.
   */
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    type: {
      type: String,
      enum: Object.values(CouponType),
      required: true,
    },

    value: {
      type: Number,
      required: true,
      min: 1,
    },

    minOrderValue: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    maxDiscount: {
      type: Number,
      min: 1,
      default: null,
    },

    productIds: {
      type: [Schema.Types.ObjectId],
      ref: "Product",
      default: [],
      index: true,
    },

    categoryIds: {
      type: [Schema.Types.ObjectId],
      ref: "Category",
      default: [],
      index: true,
    },

    startAt: {
      type: Date,
      required: true,
      index: true,
    },

    endAt: {
      type: Date,
      required: true,
      index: true,
    },

    usageLimit: {
      type: Number,
      min: 1,
      default: null,
    },

    perUserLimit: {
      type: Number,
      min: 1,
      default: 1,
    },

    status: {
      type: String,
      enum: Object.values(CouponStatus),
      default: CouponStatus.ACTIVE,
      index: true,
    },

    usageCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

couponSchema.index({
  status: 1,
  startAt: 1,
  endAt: 1,
});

export const Coupon = model<ICoupon>(
  "Coupon",
  couponSchema,
);
