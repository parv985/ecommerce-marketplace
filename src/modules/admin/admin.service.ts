import { AppError } from "../../errors/AppError.js";
import { SellerStatus } from "../../constants/sellerStatus.js";
import mongoose from "mongoose";
import { getCacheKey, invalidateCache } from "../../config/redis.js";
import { logAudit } from "../../services/audit.service.js";
import { notifySellerDecision } from "../notifications/notification.service.js";
import { revokeAllRefreshTokensForUser } from "../auth/auth.repository.js";
import type { UserDocument } from "../../models/User.js";
import type { ISeller } from "../../models/Seller.js";
import type { IProduct } from "../../models/Product.js";
import type { IOrder } from "../../models/Order.js";
import type { IAuditLog } from "../../models/AuditLog.js";
import {
  findSellerById,
  findUserById,
  findUsersByIds,
  listAllOrders,
  listAllProducts,
  listAuditLogs,
  listSellers,
  listUsers,
  updateProductStatusById,
  updateSellerById,
  updateUserById,
} from "./admin.repository.js";
import {
  listAdminOrdersQuerySchema,
  listAdminProductsQuerySchema,
  listAuditLogsQuerySchema,
  listSellersQuerySchema,
  listUsersQuerySchema,
  updateProductStatusSchema,
  updateSellerStatusSchema,
  updateUserStatusSchema,
  type ListAdminOrdersQuery,
  type ListAdminProductsQuery,
  type ListAuditLogsQuery,
  type ListSellersQuery,
  type ListUsersQuery,
  type UpdateProductStatusInput,
  type UpdateSellerStatusInput,
  type UpdateUserStatusInput,
} from "./admin.schema.js";
import type {
  AdminAuditLogResponse,
  AdminListResponse,
  AdminOrderResponse,
  AdminProductResponse,
  AdminSellerResponse,
  AdminUserResponse,
} from "./admin.types.js";

const toAdminUserResponse = (
  user: UserDocument,
): AdminUserResponse => {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    authProvider: user.authProvider ?? "LOCAL",
    isEmailVerified: user.isEmailVerified,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
};

const toAdminSellerResponse = (
  seller: ISeller,
): AdminSellerResponse => {
  return {
    id: seller._id.toString(),
    userId: seller.userId.toString(),
    businessName: seller.businessName,
    phone: seller.phone ?? null,
    gstin: seller.gstin,
    pan: seller.pan,
    status: seller.status,
    statusReason: seller.statusReason ?? null,
    createdAt: seller.createdAt,
  };
};

const toAdminProductResponse = (
  product: IProduct,
): AdminProductResponse => {
  return {
    id: product._id.toString(),
    sellerId: product.sellerId.toString(),
    name: product.name,
    price: product.price,
    stock: product.stock,
    status: product.status,
    createdAt: product.createdAt,
  };
};

const toAdminOrderResponse = (
  order: IOrder,
): AdminOrderResponse => {
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    userId: order.userId.toString(),
    sellerId: order.sellerId.toString(),
    itemCount: order.items.length,
    total: order.total,
    paymentStatus: order.paymentStatus,
    status: order.status,
    createdAt: order.createdAt,
  };
};

export const getUsersList = async (
  query: unknown,
): Promise<AdminListResponse<AdminUserResponse>> => {
  const parsed: ListUsersQuery =
    listUsersQuerySchema.parse(query);

  const filter: Record<string, unknown> = {};

  if (parsed.role) {
    filter.role = parsed.role;
  }

  const { items, total } = await listUsers(
    filter,
    parsed.page,
    parsed.limit,
  );

  return {
    items: items.map(toAdminUserResponse),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

export const setUserActiveStatus = async (
  actorId: string,
  userId: string,
  input: unknown,
): Promise<AdminUserResponse> => {
  const data: UpdateUserStatusInput =
    updateUserStatusSchema.parse(input);

  const user = await findUserById(userId);

  if (!user) {
    throw new AppError(
      "User not found",
      404,
      "USER_NOT_FOUND",
    );
  }

  const updated = await updateUserById(
    userId,
    { isActive: data.isActive },
  );

  if (!updated) {
    throw new AppError(
      "User not found",
      404,
      "USER_NOT_FOUND",
    );
  }

  /*
   * Deactivation must be enforced IMMEDIATELY, not when the current
   * access token eventually expires: revoke every live refresh token
   * so no new access token can be minted from an existing session.
   * (The authenticate middleware additionally re-checks isActive on
   * every request, so still-valid access tokens are rejected too.)
   */
  if (!data.isActive) {
    await revokeAllRefreshTokensForUser(
      userId,
    );
  }

  await logAudit({
    actorId,
    actorRole: "SUPER_ADMIN",
    action: "USER_STATUS_UPDATE",
    entityType: "USER",
    entityId: userId,
    before: { isActive: user.isActive },
    after: { isActive: updated.isActive },
  });

  return toAdminUserResponse(updated);
};

export const getSellersList = async (
  query: unknown,
): Promise<AdminListResponse<AdminSellerResponse>> => {
  const parsed: ListSellersQuery =
    listSellersQuerySchema.parse(query);

  const filter: Record<string, unknown> = {};

  if (parsed.status) {
    filter.status = parsed.status;
  }

  const { items, total } = await listSellers(
    filter,
    parsed.page,
    parsed.limit,
  );

  return {
    items: items.map(toAdminSellerResponse),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

export const setSellerStatus = async (
  user: { id: string; role: string },
  sellerId: string,
  input: unknown,
): Promise<AdminSellerResponse> => {
  const data: UpdateSellerStatusInput =
    updateSellerStatusSchema.parse(input);

  const seller = await findSellerById(sellerId);

  if (!seller) {
    throw new AppError(
      "Seller not found",
      404,
      "SELLER_NOT_FOUND",
    );
  }

  const updated = await updateSellerById(
    sellerId,
    {
      status: data.status,
      statusReason: data.reason ?? null,
    },
  );

  if (!updated) {
    throw new AppError(
      "Seller not found",
      404,
      "SELLER_NOT_FOUND",
    );
  }

  /*
   * The seller is told about approval/rejection decisions, and the
   * action is recorded in the audit log (before/after status).
   */
  if (
    data.status === SellerStatus.APPROVED ||
    data.status === SellerStatus.REJECTED
  ) {
    await notifySellerDecision(updated, data.status);
  }

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "SELLER_STATUS_UPDATE",
    entityType: "SELLER",
    entityId: sellerId,
    before: { status: seller.status },
    after: { status: updated.status },
    metadata: { reason: data.reason ?? null },
  });

  return toAdminSellerResponse(updated);
};

export const getAdminProductsList = async (
  query: unknown,
): Promise<AdminListResponse<AdminProductResponse>> => {
  const parsed: ListAdminProductsQuery =
    listAdminProductsQuerySchema.parse(query);

  const filter: Record<string, unknown> = {};

  if (parsed.status) {
    filter.status = parsed.status;
  }

  const { items, total } = await listAllProducts(
    filter,
    parsed.page,
    parsed.limit,
  );

  return {
    items: items.map(toAdminProductResponse),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

export const setProductStatus = async (
  productId: string,
  input: unknown,
): Promise<AdminProductResponse> => {
  const data: UpdateProductStatusInput =
    updateProductStatusSchema.parse(input);

  const updated = await updateProductStatusById(
    productId,
    data.status,
  );

  if (!updated) {
    throw new AppError(
      "Product not found",
      404,
      "PRODUCT_NOT_FOUND",
    );
  }

  /* Invalidate product catalog cache so the public browse endpoint
     reflects the status change immediately. */
  await invalidateCache(getCacheKey("products", "*"));

  return toAdminProductResponse(updated);
};

export const getAdminOrdersList = async (
  query: unknown,
): Promise<AdminListResponse<AdminOrderResponse>> => {
  const parsed: ListAdminOrdersQuery =
    listAdminOrdersQuerySchema.parse(query);

  const filter: Record<string, unknown> = {};

  if (parsed.status) {
    filter.status = parsed.status;
  }

  const { items, total } = await listAllOrders(
    filter,
    parsed.page,
    parsed.limit,
  );

  return {
    items: items.map(toAdminOrderResponse),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

const toAdminAuditLogResponse = (
  log: IAuditLog,
  actor?: Pick<UserDocument, "name" | "email"> | null,
): AdminAuditLogResponse => {
  return {
    id: log._id.toString(),
    actorId: log.actorId,
    /* Human-readable actor identity when the actor is a real user;
       system actors ("system", "webhook") and deleted users stay null. */
    actorName: actor?.name ?? null,
    actorEmail: actor?.email ?? null,
    actorRole: log.actorRole,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId
      ? log.entityId.toString()
      : null,
    before: log.before ?? null,
    after: log.after ?? null,
    metadata: log.metadata ?? null,
    createdAt: log.createdAt,
  };
};

/*
 * Free-text search across an audit entry's identity fields, evaluated
 * entirely in the query (server-side) so the frontend can search
 * without ever downloading the ledger:
 *   - actorId and action: case-insensitive partial match (a pasted
 *     full or partial ObjectId and action fragments both work);
 *   - entityId: exact match when the term is a full 24-char ObjectId,
 *     otherwise a hex fragment matches stored ObjectIds containing it
 *     (ObjectId fields are compared through their string form).
 * All branches are OR-ed; every other filter still ANDs on top.
 */
const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildAuditSearchFilter = (
  term: string,
): Record<string, unknown>[] => {
  const loose = new RegExp(escapeRegExp(term), "i");
  const clauses: Record<string, unknown>[] = [
    { actorId: loose },
    { action: loose },
  ];

  if (mongoose.isValidObjectId(term)) {
    clauses.push({ entityId: new mongoose.Types.ObjectId(term) });
  } else if (/^[0-9a-f]{4,24}$/i.test(term)) {
    /* Partial ObjectId: compare the stored ObjectId as a string.
       Restricted to hex fragments so ordinary words never take this
       (unindexed) path. */
    clauses.push({
      $expr: {
        $regexMatch: {
          input: { $toString: "$entityId" },
          regex: escapeRegExp(term),
          options: "i",
        },
      },
    });
  }

  return clauses;
};

/*
 * A `toDate` given as a bare date (YYYY-MM-DD) coerces to UTC
 * midnight, which would silently exclude everything logged later that
 * same day. When the timestamp carries no time component we widen it
 * to the end of that UTC day so "from 2026-01-01 to 2026-01-31"
 * really means "the whole of January".
 */
const toInclusiveUpperBound = (date: Date): Date => {
  const hasTimeComponent =
    date.getUTCHours() !== 0 ||
    date.getUTCMinutes() !== 0 ||
    date.getUTCSeconds() !== 0 ||
    date.getUTCMilliseconds() !== 0;

  if (hasTimeComponent) {
    return date;
  }

  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  return endOfDay;
};

export const getAuditLogsList = async (
  query: unknown,
): Promise<AdminListResponse<AdminAuditLogResponse>> => {
  const parsed: ListAuditLogsQuery =
    listAuditLogsQuerySchema.parse(query);

  const filter: Record<string, unknown> = {};

  if (parsed.actorId) {
    filter.actorId = parsed.actorId;
  }

  if (parsed.actorRole) {
    filter.actorRole = parsed.actorRole;
  }

  if (parsed.action) {
    filter.action = parsed.action;
  }

  if (parsed.entityType) {
    filter.entityType = parsed.entityType;
  }

  if (parsed.entityId) {
    filter.entityId = parsed.entityId;
  }

  if (parsed.search) {
    filter.$or = buildAuditSearchFilter(parsed.search);
  }

  if (parsed.fromDate || parsed.toDate) {
    const createdAt: Record<string, Date> = {};

    if (parsed.fromDate) {
      createdAt.$gte = parsed.fromDate;
    }

    if (parsed.toDate) {
      createdAt.$lte = toInclusiveUpperBound(
        parsed.toDate,
      );
    }

    filter.createdAt = createdAt;
  }

  /* Default: newest first (createdAt desc). */
  const sort: Record<string, 1 | -1> = {
    [parsed.sortBy]:
      parsed.sortOrder === "asc" ? 1 : -1,
  };

  const { items, total } = await listAuditLogs(
    filter,
    sort,
    parsed.page,
    parsed.limit,
  );

  /* One batched query decorates the page's entries with the actors'
     name/email — actors that are not real users (system actors, or
     users since deleted) simply keep null. */
  const actorIds = [
    ...new Set(
      items
        .map((log) => log.actorId)
        .filter((actorId) =>
          mongoose.isValidObjectId(actorId),
        ),
    ),
  ];
  const actors = await findUsersByIds(actorIds);
  const actorsById = new Map(
    actors.map((user) => [user._id.toString(), user]),
  );

  return {
    items: items.map((log) => {
      const actor = actorsById.get(log.actorId) ?? null;
      return toAdminAuditLogResponse(log, actor);
    }),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};
