import { z } from "zod";

import {
  DiscountStatus,
  DiscountType,
} from "../../constants/discountStatus.js";

const objectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ObjectId",
  );

/*
 * A discount targets exactly one of productId or categoryId.
 * The superRefine rules keep the payloads mutually exclusive and
 * enforce that the discount window is ordered (endAt after startAt).
 */
export const createDiscountSchema = z
  .object({
    productId: objectId.optional(),
    categoryId: objectId.optional(),
    discountType: z
      .nativeEnum(DiscountType)
      .optional()
      .default(DiscountType.PERCENTAGE),
    discountValue: z
      .number()
      .int("Discount must be a whole percentage")
      .min(1, "Discount must be at least 1%")
      .max(100, "Discount cannot exceed 100%"),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    status: z
      .nativeEnum(DiscountStatus)
      .optional()
      .default(DiscountStatus.ACTIVE),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.productId && !value.categoryId) {
      ctx.addIssue({
        code: "custom",
        path: ["productId"],
        message:
          "Either productId or categoryId is required",
      });
    }

    if (value.productId && value.categoryId) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryId"],
        message:
          "Provide either productId or categoryId, not both",
      });
    }

    if (value.endAt.getTime() <= value.startAt.getTime()) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "endAt must be after startAt",
      });
    }
  });

export const updateDiscountSchema = z
  .object({
    productId: objectId.nullable().optional(),
    categoryId: objectId.nullable().optional(),
    discountType: z
      .nativeEnum(DiscountType)
      .optional(),
    discountValue: z
      .number()
      .int("Discount must be a whole percentage")
      .min(1, "Discount must be at least 1%")
      .max(100, "Discount cannot exceed 100%")
      .optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    status: z
      .nativeEnum(DiscountStatus)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.productId && value.categoryId) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryId"],
        message:
          "Provide either productId or categoryId, not both",
      });
    }

    if (
      value.startAt &&
      value.endAt &&
      value.endAt.getTime() <= value.startAt.getTime()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "endAt must be after startAt",
      });
    }
  });

export const discountIdParamsSchema = z
  .object({
    id: objectId,
  })
  .strict();

export const listDiscountsQuerySchema = z
  .object({
    status: z
      .nativeEnum(DiscountStatus)
      .optional(),
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

export type CreateDiscountInput =
  z.infer<typeof createDiscountSchema>;
export type UpdateDiscountInput =
  z.infer<typeof updateDiscountSchema>;
export type ListDiscountsQuery =
  z.infer<typeof listDiscountsQuerySchema>;
