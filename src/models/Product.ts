import {
  Schema,
  model,
  type Types,
} from "mongoose";

import { ProductStatus } from "../constants/productStatus.js";

export interface IProduct {
  _id: Types.ObjectId;
  sellerId: Types.ObjectId;
  name: string;
  description?: string;
  category?: Types.ObjectId | null;
  price: number;
  stock: number;
  images: string[];
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
      index: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    images: {
      type: [String],
      default: [],
    },

    status: {
      type: String,
      enum: Object.values(ProductStatus),
      default: ProductStatus.DRAFT,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

productSchema.index(
  { status: 1, category: 1 },
);
productSchema.index(
  { status: 1, price: 1 },
);

export const Product = model<IProduct>(
  "Product",
  productSchema,
);
