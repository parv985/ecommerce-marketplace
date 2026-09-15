import { z } from "zod";

import {
  CouponStatus,
  CouponType,
} from "../../constants/couponStatus.js";

const objectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ObjectId",
  );

const couponCodeSchema = z
  .string()
  .trim()
  .min(3, "Code must be at least 3 characters")
  .max(30, "Code cannot exceed 30 characters")
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "Code can only contain letters, numbers, _ and -",
  )
  .transform((value) => value.toUpperCase());

const validateCouponTypeValue = (
  value: {
    type: CouponType;
    value: number;
  },
  ctx: z.RefinementCtx,
): void => {
  if (
    value.type === CouponType.PERCENTAGE &&
    (value.value < 1 || value.value > 100)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message:
        "Percentage coupons must be between 1 and 100",
    });
  }
};

export const createCouponSchema = z
  .object({
    code: couponCodeSchema,
    type: z.nativeEnum(CouponType),
    value: z
      .number()
      .positive("Value must be greater than 0")
      .max(10000000, "Value is too large"),
    minOrderValue: z
      .number()
      .min(0)
      .optional()
      .default(0),
    maxDiscount: z
      .number()
      .positive()
      .max(10000000)
      .optional()
      .nullable(),
    productIds: z
      .array(objectId)
      .max(50, "At most 50 products can be restricted")
      .optional()
      .default([]),
    categoryIds: z
      .array(objectId)
      .max(50, "At most 50 categories can be restricted")
      .optional()
      .default([]),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    usageLimit: z
      .number()
      .int()
      .min(1)
      .optional()
      .nullable(),
    perUserLimit: z
      .number()
      .int()
      .min(1)
      .optional()
      .nullable(),
    status: z
      .nativeEnum(CouponStatus)
      .optional()
      .default(CouponStatus.ACTIVE),
  })
  .strict()
  .superRefine((value, ctx) => {
    validateCouponTypeValue(value, ctx);

    if (
      value.endAt.getTime() <= value.startAt.getTime()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "endAt must be after startAt",
      });
    }
  });

export const updateCouponSchema = z
  .object({
    type: z.nativeEnum(CouponType).optional(),
    value: z
      .number()
      .positive("Value must be greater than 0")
      .max(10000000, "Value is too large")
      .optional(),
    minOrderValue: z
      .number()
      .min(0)
      .optional(),
    maxDiscount: z
      .number()
      .positive()
      .max(10000000)
      .optional()
      .nullable(),
    productIds: z
      .array(objectId)
      .max(50, "At most 50 products can be restricted")
      .optional(),
    categoryIds: z
      .array(objectId)
      .max(50, "At most 50 categories can be restricted")
      .optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    usageLimit: z
      .number()
      .int()
      .min(1)
      .optional()
      .nullable(),
    perUserLimit: z
      .number()
      .int()
      .min(1)
      .optional()
      .nullable(),
    status: z
      .nativeEnum(CouponStatus)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type && value.value !== undefined) {
      validateCouponTypeValue(
        {
          type: value.type,
          value: value.value,
        },
        ctx,
      );
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

export const couponIdParamsSchema = z
  .object({
    id: objectId,
  })
  .strict();

export const listCouponsQuerySchema = z
  .object({
    status: z
      .nativeEnum(CouponStatus)
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

export const applyCouponCodeSchema = z
  .object({
    couponCode: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .transform((value) =>
        value.toUpperCase(),
      ),
  })
  .strict();

export type CreateCouponInput =
  z.infer<typeof createCouponSchema>;
export type UpdateCouponInput =
  z.infer<typeof updateCouponSchema>;
export type ListCouponsQuery =
  z.infer<typeof listCouponsQuerySchema>;
export type ApplyCouponCodeInput =
  z.infer<typeof applyCouponCodeSchema>;
