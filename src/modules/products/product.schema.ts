import { z } from "zod";

import { ProductStatus } from "../../constants/productStatus.js";

const objectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ObjectId",
  );

export const createProductSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Product name must be at least 2 characters")
      .max(150, "Product name cannot exceed 150 characters"),

    description: z
      .string()
      .trim()
      .max(2000, "Description cannot exceed 2000 characters")
      .optional(),

    category: objectId.optional(),

    price: z
      .number()
      .positive("Price must be greater than 0")
      .max(10000000, "Price is too large"),

    stock: z
      .number()
      .int("Stock must be an integer")
      .min(0, "Stock cannot be negative")
      .max(1000000, "Stock is too large"),

    images: z
      .array(
        z
          .string()
          .trim()
          .url("Image must be a valid URL"),
      )
      .max(8, "A product can have at most 8 images")
      .optional()
      .default([]),

    status: z
      .nativeEnum(ProductStatus)
      .optional()
      .default(ProductStatus.DRAFT),
  })
  .strict();

export const updateProductSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Product name must be at least 2 characters")
      .max(150, "Product name cannot exceed 150 characters")
      .optional(),

    description: z
      .string()
      .trim()
      .max(2000, "Description cannot exceed 2000 characters")
      .optional(),

    category: objectId.nullable().optional(),

    price: z
      .number()
      .positive("Price must be greater than 0")
      .max(10000000, "Price is too large")
      .optional(),

    stock: z
      .number()
      .int("Stock must be an integer")
      .min(0, "Stock cannot be negative")
      .max(1000000, "Stock is too large")
      .optional(),

    images: z
      .array(
        z
          .string()
          .trim()
          .url("Image must be a valid URL"),
      )
      .max(8, "A product can have at most 8 images")
      .optional(),

    status: z
      .nativeEnum(ProductStatus)
      .optional(),
  })
  .strict();

export const productIdParamsSchema = z
  .object({
    id: objectId,
  })
  .strict();

export const listProductsQuerySchema = z
  .object({
    search: z
      .string()
      .trim()
      .max(100)
      .optional(),

    category: objectId.optional(),

    minPrice: z
      .coerce
      .number()
      .min(0)
      .optional(),

    maxPrice: z
      .coerce
      .number()
      .min(0)
      .optional(),

    sort: z
      .enum(["newest", "oldest", "price_asc", "price_desc", "name_asc"])
      .optional()
      .default("newest"),

    page: z
      .coerce
      .number()
      .int()
      .min(1)
      .optional()
      .default(1),

    limit: z
      .coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20),
  })
  .strict();

export type CreateProductInput =
  z.infer<typeof createProductSchema>;
export type UpdateProductInput =
  z.infer<typeof updateProductSchema>;
export type ListProductsQuery =
  z.infer<typeof listProductsQuerySchema>;
