import {
  Schema,
  model,
  type Types,
} from "mongoose";

import { ProductStatus } from "../constants/productStatus.js";

export interface IProductImage {
  url: string;
  publicId: string;
}

export interface IProductSpec {
  key: string;
  value: string;
}

export interface IProduct {
  _id: Types.ObjectId;
  sellerId: Types.ObjectId;
  name: string;
  description?: string;
  sku?: string;
  category?: Types.ObjectId | null;
  price: number;
  stock: number;
  images: IProductImage[];
  specifications: IProductSpec[];
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

    sku: {
      type: String,
      trim: true,
      maxlength: 100,
      sparse: true,
    },

    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    images: [
      {
        url: {
          type: String,
          required: true,
        },
        publicId: {
          type: String,
          required: true,
        },
      },
    ],

    specifications: [
      {
        key: {
          type: String,
          required: true,
          trim: true,
        },
        value: {
          type: String,
          required: true,
          trim: true,
        },
      },
    ],

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
