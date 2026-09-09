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

export const listAuditLogsQuerySchema = z
  .object({
    actorId: z.string().trim().min(1).optional(),
    actorRole: z.string().trim().min(1).optional(),
    action: z.string().trim().min(1).optional(),
    entityType: z.string().trim().min(1).optional(),
    entityId: objectId.optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    sortBy: z
      .enum(["createdAt", "action", "actorRole", "entityType"])
      .optional()
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
    ...pagination,
  })
  .strict();

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
export type UpdateUserStatusInput = z.infer<
  typeof updateUserStatusSchema
>;
export type UpdateSellerStatusInput = z.infer<
  typeof updateSellerStatusSchema
>;
export type UpdateProductStatusInput = z.infer<
  typeof updateProductStatusSchema
>;
export type ListAuditLogsQuery = z.infer<
  typeof listAuditLogsQuerySchema
>;
