import {
  RETURN_WINDOW_DAYS,
  ReturnStatus,
} from "../../constants/returnStatus.js";
import { UserRole } from "../../constants/roles.js";
import { AppError } from "../../errors/AppError.js";
import type { IReturnRequest } from "../../models/ReturnRequest.js";
import type { IOrder } from "../../models/Order.js";
import { findOrderById } from "../orders/order.repository.js";
import { incrementProductStock } from "../products/product.repository.js";
import { notifyReturnStatusChange } from "../notifications/notification.service.js";
import { logAudit } from "../../services/audit.service.js";
import {
  createReturn,
  findActiveReturnByOrder,
  findReturnById,
  findReturnByIdAndSeller,
  findReturnByIdAndUser,
  listReturnsBySeller,
  listReturnsByUser,
  updateReturnStatusById,
} from "./return.repository.js";
import {
  createReturnSchema,
  listReturnsQuerySchema,
  updateReturnStatusSchema,
  type CreateReturnInput,
  type ListReturnsQuery,
  type UpdateReturnStatusInput,
} from "./return.schema.js";
import type {
  PaginatedReturns,
  ReturnResponse,
} from "./return.types.js";

/*
 * Valid return lifecycle (documented in Swagger):
 *   PENDING  -> APPROVED | REJECTED | CANCELLED
 *   APPROVED -> COMPLETED
 *   REJECTED / CANCELLED / COMPLETED are terminal.
 * Only the order's seller or an admin advances a return; the buyer can
 * cancel their own pending request.
 */
const TRANSITIONS: Record<
  ReturnStatus,
  ReturnStatus[]
> = {
  [ReturnStatus.PENDING]: [
    ReturnStatus.APPROVED,
    ReturnStatus.REJECTED,
    ReturnStatus.CANCELLED,
  ],
  [ReturnStatus.APPROVED]: [
    ReturnStatus.COMPLETED,
  ],
  [ReturnStatus.REJECTED]: [],
  [ReturnStatus.CANCELLED]: [],
  [ReturnStatus.COMPLETED]: [],
};

const toReturnResponse = (
  returnRequest: IReturnRequest,
): ReturnResponse => {
  return {
    id: returnRequest._id.toString(),
    orderId: returnRequest.orderId.toString(),
    userId: returnRequest.userId.toString(),
    sellerId: returnRequest.sellerId.toString(),
    reason: returnRequest.reason,
    status: returnRequest.status,
    statusReason: returnRequest.statusReason ?? null,
    createdAt: returnRequest.createdAt,
    updatedAt: returnRequest.updatedAt,
  };
};

export const requestReturn = async (
  user: { id: string; role: UserRole },
  input: unknown,
): Promise<ReturnResponse> => {
  const data: CreateReturnInput =
    createReturnSchema.parse(input);

  const order = await findOrderById(data.orderId);

  if (!order) {
    throw new AppError(
      "Order not found",
      404,
      "ORDER_NOT_FOUND",
    );
  }

  if (order.userId.toString() !== user.id) {
    throw new AppError(
      "You can only request a return for your own order",
      403,
      "FORBIDDEN",
    );
  }

  const active =
    await findActiveReturnByOrder(data.orderId);

  if (active) {
    throw new AppError(
      "A return request for this order is already in progress",
      409,
      "RETURN_ALREADY_REQUESTED",
    );
  }

  const now = Date.now();
  const deliveredAt = order.deliveredAt;

  if (!deliveredAt) {
    throw new AppError(
      "Returns are only available after delivery",
      400,
      "RETURN_NOT_ELIGIBLE",
    );
  }

  const windowMs =
    RETURN_WINDOW_DAYS * 24 * 3600 * 1000;

  if (now - deliveredAt.getTime() > windowMs) {
    throw new AppError(
      `Returns must be requested within ${RETURN_WINDOW_DAYS} days of delivery`,
      400,
      "RETURN_WINDOW_EXPIRED",
    );
  }

  const created = await createReturn({
    orderId: order._id,
    userId: user.id,
    sellerId: order.sellerId,
    reason: data.reason,
    status: ReturnStatus.PENDING,
  });

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "RETURN_REQUESTED",
    entityType: "RETURN",
    entityId: created._id.toString(),
    metadata: { orderId: order._id.toString() },
  });

  return toReturnResponse(created);
};

export const listMyReturns = async (
  user: { id: string; role: UserRole },
  query: unknown,
): Promise<PaginatedReturns> => {
  const parsed: ListReturnsQuery =
    listReturnsQuerySchema.parse(query);

  const filter: Record<string, unknown> = {};

  if (parsed.status) {
    filter.status = parsed.status;
  }

  const { items, total } =
    user.role === UserRole.SELLER
      ? await listReturnsBySeller(
          user.id,
          filter,
          parsed.page,
          parsed.limit,
        )
      : await listReturnsByUser(
          user.id,
          filter,
          parsed.page,
          parsed.limit,
        );

  return {
    items: items.map(toReturnResponse),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

export const getReturn = async (
  user: { id: string; role: UserRole },
  returnId: string,
): Promise<ReturnResponse> => {
  const returnRequest = await findReturnById(
    returnId,
  );

  if (!returnRequest) {
    throw new AppError(
      "Return request not found",
      404,
      "RETURN_NOT_FOUND",
    );
  }

  const isOwner =
    returnRequest.userId.toString() === user.id;
  const isSeller =
    returnRequest.sellerId.toString() === user.id;
  const isAdmin =
    user.role === UserRole.SUPER_ADMIN;

  if (!isOwner && !isSeller && !isAdmin) {
    throw new AppError(
      "You do not have permission to view this return request",
      403,
      "FORBIDDEN",
    );
  }

  return toReturnResponse(returnRequest);
};

export const updateReturnStatus = async (
  user: { id: string; role: UserRole },
  returnId: string,
  input: unknown,
): Promise<ReturnResponse> => {
  const data: UpdateReturnStatusInput =
    updateReturnStatusSchema.parse(input);

  const returnRequest = await findReturnById(
    returnId,
  );

  if (!returnRequest) {
    throw new AppError(
      "Return request not found",
      404,
      "RETURN_NOT_FOUND",
    );
  }

  const isSeller =
    returnRequest.sellerId.toString() === user.id;
  const isAdmin =
    user.role === UserRole.SUPER_ADMIN;

  if (!isSeller && !isAdmin) {
    throw new AppError(
      "Only the seller or an admin can update a return request",
      403,
      "FORBIDDEN",
    );
  }

  if (data.status === returnRequest.status) {
    return toReturnResponse(returnRequest);
  }

  const allowed = TRANSITIONS[returnRequest.status];

  if (!allowed.includes(data.status)) {
    throw new AppError(
      `Cannot transition return from ${returnRequest.status} to ${data.status}`,
      400,
      "INVALID_RETURN_TRANSITION",
    );
  }

  /*
   * Completing a return means the goods are received back, so the
   * committed stock is restored to the seller's inventory.
   */
  if (data.status === ReturnStatus.COMPLETED) {
    const order = await findOrderById(
      returnRequest.orderId.toString(),
    );

    if (order) {
      for (const item of order.items) {
        await incrementProductStock(
          item.productId.toString(),
          item.quantity,
        );
      }
    }
  }

  const updated = await updateReturnStatusById(
    returnId,
    data.status,
    data.reason ?? undefined,
  );

  if (!updated) {
    throw new AppError(
      "Return request not found",
      404,
      "RETURN_NOT_FOUND",
    );
  }

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "RETURN_STATUS_CHANGED",
    entityType: "RETURN",
    entityId: returnId,
    before: { status: returnRequest.status },
    after: { status: updated.status },
  });

  await notifyReturnStatusChange(
    updated,
    updated.status,
  );

  return toReturnResponse(updated);
};

export const cancelReturn = async (
  user: { id: string; role: UserRole },
  returnId: string,
): Promise<ReturnResponse> => {
  const returnRequest =
    await findReturnByIdAndUser(returnId, user.id);

  if (!returnRequest) {
    throw new AppError(
      "Return request not found",
      404,
      "RETURN_NOT_FOUND",
    );
  }

  if (returnRequest.status === ReturnStatus.CANCELLED) {
    return toReturnResponse(returnRequest);
  }

  const allowed = TRANSITIONS[returnRequest.status];

  if (!allowed.includes(ReturnStatus.CANCELLED)) {
    throw new AppError(
      `A return in ${returnRequest.status} state cannot be cancelled`,
      400,
      "INVALID_RETURN_TRANSITION",
    );
  }

  const updated = await updateReturnStatusById(
    returnId,
    ReturnStatus.CANCELLED,
  );

  if (!updated) {
    throw new AppError(
      "Return request not found",
      404,
      "RETURN_NOT_FOUND",
    );
  }

  return toReturnResponse(updated);
};
