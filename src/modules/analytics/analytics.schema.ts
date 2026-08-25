import { z } from "zod";

const dateRangeRefine = (
  value: {
    from?: Date | undefined;
    to?: Date | undefined;
  },
  ctx: z.RefinementCtx,
): void => {
  if (
    value.from &&
    value.to &&
    value.to.getTime() < value.from.getTime()
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["to"],
      message: "to must not be before from",
    });
  }
};

export const salesSeriesQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    groupBy: z
      .enum(["day", "month"])
      .optional()
      .default("day"),
  })
  .strict()
  .superRefine(dateRangeRefine);

export const revenueQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    groupBy: z
      .enum(["day", "month"])
      .optional()
      .default("day"),
  })
  .strict()
  .superRefine(dateRangeRefine);

export const topProductsQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(10),
  })
  .strict();

export const customersQuerySchema = z
  .object({
    search: z
      .string()
      .trim()
      .max(100)
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

export type SalesSeriesQuery =
  z.infer<typeof salesSeriesQuerySchema>;
export type RevenueQuery =
  z.infer<typeof revenueQuerySchema>;
export type TopProductsQuery =
  z.infer<typeof topProductsQuerySchema>;
export type CustomersQuery =
  z.infer<typeof customersQuerySchema>;
