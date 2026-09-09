import { z } from "zod";

import { UserRole } from "../../constants/roles.js";
import { SellerStatus } from "../../constants/sellerStatus.js";
import { ProductStatus } from "../../constants/productStatus.js";
import { OrderStatus } from "../../constants/orderStatus.js";

const objectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ObjectId",
  );

const pagination = {
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
};

export const listUsersQuerySchema = z
  .object({
    role: z.nativeEnum(UserRole).optional(),

    ...pagination,
  })
  .strict();

export const updateUserStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const listSellersQuerySchema = z
  .object({
    status: z
      .nativeEnum(SellerStatus)
      .optional(),

    ...pagination,
  })
  .strict();

export const updateSellerStatusSchema = z
  .object({
    status: z.nativeEnum(SellerStatus),

    reason: z
      .string()
      .trim()
      .max(500, "Reason cannot exceed 500 characters")
      .optional(),
  })
  .strict();

export const listAdminProductsQuerySchema = z
  .object({
    status: z
      .nativeEnum(ProductStatus)
      .optional(),

    ...pagination,
  })
  .strict();

export const updateProductStatusSchema = z
  .object({
    status: z.nativeEnum(ProductStatus),
  })
  .strict();

export const listAdminOrdersQuerySchema = z
  .object({
    status: z.nativeEnum(OrderStatus).optional(),

    ...pagination,
  })
  .strict();

export const adminIdParamsSchema = z
  .object({
    id: objectId,
  })
  .strict();

/*
 * Audit log listing (SUPER_ADMIN only).
 *
 * Every filter is optional and combined with AND. `actorId`,
 * `actorRole`, `action` and `entityType` are matched exactly: the audit
 * ledger is an append-only record of free-form strings, so the API does
 * not constrain them to an enum - new actions/entity types recorded by
 * future code are queryable immediately without a schema change.
 * (The Swagger docs list the values currently written by the app.)
 */
export const auditLogSortFieldSchema = z.enum([
  "createdAt",
  "action",
  "entityType",
  "actorRole",
  "actorId",
]);

export const auditLogSortOrderSchema = z.enum([
  "asc",
  "desc",
]);

export const listAuditLogsQuerySchema = z
  .object({
    actorId: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional(),

    actorRole: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .optional(),

    action: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional(),

    entityType: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .optional(),

    entityId: objectId.optional(),

    /*
     * Inclusive date range on createdAt. Accepts a date
     * (YYYY-MM-DD) or a full ISO-8601 timestamp. A bare date is
     * interpreted as UTC midnight for `fromDate` and, in the service
     * layer, as the END of that UTC day for `toDate` so that picking
     * a single day returns that whole day.
     */
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),

    sortBy: auditLogSortFieldSchema
      .optional()
      .default("createdAt"),

    sortOrder: auditLogSortOrderSchema
      .optional()
      .default("desc"),

    ...pagination,
  })
  .strict()
  .refine(
    (query) =>
      !query.fromDate ||
      !query.toDate ||
      query.fromDate.getTime() <=
        query.toDate.getTime(),
    {
      message: "fromDate must be on or before toDate",
      path: ["fromDate"],
    },
  );

export type ListUsersQuery = z.infer<
  typeof listUsersQuerySchema
>;
export type ListSellersQuery = z.infer<
  typeof listSellersQuerySchema
>;
export type ListAdminProductsQuery = z.infer<
  typeof listAdminProductsQuerySchema
>;
export type ListAdminOrdersQuery = z.infer<
  typeof listAdminOrdersQuerySchema
>;
export type ListAuditLogsQuery = z.infer<
  typeof listAuditLogsQuerySchema
>;
export type AuditLogSortField = z.infer<
  typeof auditLogSortFieldSchema
>;
export type AuditLogSortOrder = z.infer<
  typeof auditLogSortOrderSchema
>;
export type UpdateUserStatusInput = z.infer<
  typeof updateUserStatusSchema
>;
export type UpdateSellerStatusInput = z.infer<
  typeof updateSellerStatusSchema
>;
export type UpdateProductStatusInput = z.infer<
  typeof updateProductStatusSchema
>;
