import { z } from "zod";

const objectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ObjectId",
  );

export const addWishlistItemSchema = z
  .object({
    productId: objectId,
  })
  .strict();

export const wishlistItemParamsSchema = z
  .object({
    productId: objectId,
  })
  .strict();

export type AddWishlistItemInput =
  z.infer<typeof addWishlistItemSchema>;
