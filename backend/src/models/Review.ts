import {
  Schema,
  model,
  type Types,
} from "mongoose";

export interface IReview {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  productId: Types.ObjectId;
  rating: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  },
);

/*
 * One review per user per product. Enforced at the database level
 * so concurrent requests cannot create duplicates.
 */
reviewSchema.index(
  { userId: 1, productId: 1 },
  { unique: true },
);

reviewSchema.index({
  productId: 1,
  createdAt: -1,
});

export const Review = model<IReview>(
  "Review",
  reviewSchema,
);
