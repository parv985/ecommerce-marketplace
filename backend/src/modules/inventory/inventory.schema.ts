import { z } from "zod";

const objectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ObjectId",
  );

export const inventoryQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20),
  })
  .strict();

export const inventoryParamsSchema = z
  .object({
    productId: objectId,
  })
  .strict();

export const adjustStockSchema = z
  .object({
    quantity: z
      .number()
      .int("Quantity must be an integer")
      .min(-1000000, "Quantity too small")
      .max(1000000, "Quantity too large"),
    reason: z
      .string()
      .trim()
      .min(1, "Reason is required")
      .max(500, "Reason cannot exceed 500 characters"),
  })
  .strict();

export type InventoryQueryInput =
  z.infer<typeof inventoryQuerySchema>;
export type AdjustStockInput =
  z.infer<typeof adjustStockSchema>;
