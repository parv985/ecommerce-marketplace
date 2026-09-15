import { z } from "zod";

const objectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ObjectId",
  );

/* YYYY-MM month key (e.g. "2026-07"). */
export const monthKeySchema = z
  .string()
  .regex(
    /^\d{4}-(0[1-9]|1[0-2])$/,
    "Month must be in YYYY-MM format",
  );

export const listSettlementsQuerySchema = z
  .object({
    status: z
      .enum([
        "PENDING",
        "PROCESSING",
        "PAID",
        "FAILED",
        "CANCELLED",
      ])
      .optional(),
    sellerId: objectId.optional(),
    month: monthKeySchema.optional(),
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

export const generateSettlementSchema = z
  .object({
    month: monthKeySchema,
  })
  .strict();

export const settlementIdParamsSchema = z
  .object({
    id: objectId,
  })
  .strict();

export const sellerSettlementQuerySchema = z
  .object({
    month: monthKeySchema.optional(),
  })
  .strict();

export const commissionRateSchema = z
  .object({
    rate: z
      .number()
      .min(0, "Rate must be between 0 and 100")
      .max(100, "Rate must be between 0 and 100"),
  })
  .strict();

export type ListSettlementsQuery =
  z.infer<typeof listSettlementsQuerySchema>;
export type GenerateSettlementInput =
  z.infer<typeof generateSettlementSchema>;
export type SellerSettlementQuery =
  z.infer<typeof sellerSettlementQuerySchema>;
export type CommissionRateInput =
  z.infer<typeof commissionRateSchema>;
