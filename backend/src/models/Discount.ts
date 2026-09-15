import { Schema, model, type Types } from "mongoose";

import {
  DiscountStatus,
  DiscountType,
} from "../constants/discountStatus.js";

export interface IDiscount {
  _id: Types.ObjectId;
  sellerId: Types.ObjectId;
  /* Exactly one of productId / categoryId is set (validated in the schema). */
  productId?: Types.ObjectId | null;
  categoryId?: Types.ObjectId | null;
  discountType: DiscountType;
  /* Percentage value, e.g. 10 means 10% off. */
  discountValue: number;
  startAt: Date;
  endAt: Date;
  status: DiscountStatus;
  createdAt: Date;
  updatedAt: Date;
}

const discountSchema = new Schema<IDiscount>(
  {
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },

    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },

    discountType: {
      type: String,
      enum: Object.values(DiscountType),
      default: DiscountType.PERCENTAGE,
    },

    discountValue: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
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

    status: {
      type: String,
      enum: Object.values(DiscountStatus),
      default: DiscountStatus.ACTIVE,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

/*
 * Query pattern: checkout resolves which discounts are live for a set of
 * products/categories. The compound index serves that lookup directly.
 */
discountSchema.index({
  status: 1,
  startAt: 1,
  endAt: 1,
});

export const Discount = model<IDiscount>(
  "Discount",
  discountSchema,
);
