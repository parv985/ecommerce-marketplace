import { z } from "zod";

import { ReturnStatus } from "../../constants/returnStatus.js";

const objectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ObjectId",
  );

export const createReturnSchema = z
  .object({
    orderId: objectId,
    reason: z
      .string()
      .trim()
      .min(5, "Reason must be at least 5 characters")
      .max(500, "Reason cannot exceed 500 characters"),
  })
  .strict();

export const updateReturnStatusSchema = z
  .object({
    status: z.nativeEnum(ReturnStatus),
    reason: z
      .string()
      .trim()
      .max(500, "Reason cannot exceed 500 characters")
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.status === ReturnStatus.REJECTED &&
      !value.reason
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message:
          "A reason is required when rejecting a return",
      });
    }
  });

export const returnIdParamsSchema = z
  .object({
    id: objectId,
  })
  .strict();

export const listReturnsQuerySchema = z
  .object({
    status: z
      .nativeEnum(ReturnStatus)
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

export type CreateReturnInput =
  z.infer<typeof createReturnSchema>;
export type UpdateReturnStatusInput =
  z.infer<typeof updateReturnStatusSchema>;
export type ListReturnsQuery =
  z.infer<typeof listReturnsQuerySchema>;
