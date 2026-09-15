import { z } from "zod";

const objectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ObjectId",
  );

export const addCartItemSchema = z
  .object({
    productId: objectId,

    quantity: z
      .number()
      .int("Quantity must be an integer")
      .min(1, "Quantity must be at least 1")
      .max(999, "Quantity is too large"),
  })
  .strict();

export const updateCartItemSchema = z
  .object({
    quantity: z
      .number()
      .int("Quantity must be an integer")
      .min(1, "Quantity must be at least 1")
      .max(999, "Quantity is too large"),
  })
  .strict();

export const cartItemParamsSchema = z
  .object({
    productId: objectId,
  })
  .strict();

export type AddCartItemInput =
  z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput =
  z.infer<typeof updateCartItemSchema>;
