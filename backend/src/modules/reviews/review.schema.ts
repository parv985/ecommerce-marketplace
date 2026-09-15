import { z } from "zod";

const objectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ObjectId",
  );

export const createReviewSchema = z
  .object({
    productId: objectId,

    rating: z
      .number()
      .int("Rating must be an integer")
      .min(1, "Rating must be between 1 and 5")
      .max(5, "Rating must be between 1 and 5"),

    comment: z
      .string()
      .trim()
      .max(1000, "Comment cannot exceed 1000 characters")
      .optional(),
  })
  .strict();

export const updateReviewSchema = z
  .object({
    rating: z
      .number()
      .int("Rating must be an integer")
      .min(1, "Rating must be between 1 and 5")
      .max(5, "Rating must be between 1 and 5")
      .optional(),

    comment: z
      .string()
      .trim()
      .max(1000, "Comment cannot exceed 1000 characters")
      .nullable()
      .optional(),
  })
  .strict();

export const reviewIdParamsSchema = z
  .object({
    id: objectId,
  })
  .strict();

export const productReviewsParamsSchema = z
  .object({
    productId: objectId,
  })
  .strict();

export const listReviewsQuerySchema = z
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

export type CreateReviewInput =
  z.infer<typeof createReviewSchema>;
export type UpdateReviewInput =
  z.infer<typeof updateReviewSchema>;
export type ListReviewsQuery =
  z.infer<typeof listReviewsQuerySchema>;
