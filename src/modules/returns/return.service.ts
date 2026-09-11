import { Types } from "mongoose";

import {
  RETURN_WINDOW_DAYS,
  ReturnStatus,
} from "../../constants/returnStatus.js";
import { UserRole } from "../../constants/roles.js";
import {
  OrderStatus,
  PaymentStatus,
} from "../../constants/orderStatus.js";
import { RefundStatus } from "../../constants/payment.js";
import { AppError } from "../../errors/AppError.js";
import type {
  IReturnRefund,
  IReturnRequest,
} from "../../models/ReturnRequest.js";
import type { IOrder } from "../../models/Order.js";
import { InventoryTransactionType } from "../../models/InventoryTransaction.js";
import { runInTransaction } from "../../config/transaction.js";
import {
  findOrderById,
  markOrderReturned,
} from "../orders/order.repository.js";
import {
  findProductById,
  incrementProductStock,
} from "../products/product.repository.js";
import { recordStockChange } from "../inventory/inventory.service.js";
import { releaseCouponUsage } from "../coupons/coupon.repository.js";
import { reverseSettlementForOrder } from "../settlements/settlement.service.js";
import {
  refundOrderForReturn,
  type ReturnRefundOutcome,
} from "../payments/payment.service.js";
import {
  notifyReturnApprovedWithRefund,
  notifyReturnStatusChange,
  notifySellerReturnRefund,
} from "../notifications/notification.service.js";
import { recordOrderTimeline } from "../orders/orderTimeline.service.js";
import { logAudit } from "../../services/audit.service.js";
import {
  claimReturnForApproval,
  claimReturnStockRestore,
  createReturn,
  findActiveReturnByOrder,
  findReturnById,
  findReturnByIdAndUser,
  listReturnsBySeller,
  listReturnsByUser,
  markReturnCompleted,
  markReturnRefundProcessed,
  releaseFailedApproval,
  updateReturnStatusById,
} from "./return.repository.js";
import { planReturnRefund } from "./return.pricing.js";
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
 *
 * Approving is the money event: it refunds the buyer and rolls back
 * everything the original purchase changed (see approveReturn).
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

const isRefundProcessed = (
  returnRequest: IReturnRequest,
): boolean =>
  returnRequest.refund?.status ===
  RefundStatus.PROCESSED;

const toReturnResponse = (
  returnRequest: IReturnRequest,
): ReturnResponse => {
  const refund = returnRequest.refund ?? null;

  return {
    id: returnRequest._id.toString(),
    orderId: returnRequest.orderId.toString(),
    userId: returnRequest.userId.toString(),
    sellerId: returnRequest.sellerId.toString(),
    reason: returnRequest.reason,
    status: returnRequest.status,
    statusReason: returnRequest.statusReason ?? null,
    approvedAt: returnRequest.approvedAt ?? null,
    decidedBy:
      returnRequest.decidedBy?.toString() ?? null,
    decidedRole: returnRequest.decidedRole ?? null,
    stockRestoredAt:
      returnRequest.stockRestoredAt ?? null,
    refund: refund
      ? {
          amount: refund.amount,
          status: refund.status,
          method: refund.method,
          gatewayRefundId:
            refund.gatewayRefundId ?? null,
          paymentId:
            refund.paymentId?.toString() ?? null,
          reason: refund.reason ?? null,
          requestedAt: refund.requestedAt ?? null,
          completedAt: refund.completedAt ?? null,
        }
      : null,
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

  if (order.status === OrderStatus.CANCELLED) {
    throw new AppError(
      "A cancelled order cannot be returned",
      400,
      "RETURN_NOT_ELIGIBLE",
    );
  }

  /*
   * Defensive: a RETURNED order has already been refunded, so it can
   * never be returned again even if its return record is missing.
   */
  if (order.status === OrderStatus.RETURNED) {
    throw new AppError(
      "This order has already been returned and refunded",
      409,
      "ORDER_ALREADY_RETURNED",
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

/*
 * ---------------------------------------------------------------------
 * Approval: refund + rollbacks
 * ---------------------------------------------------------------------
 */

/*
 * Credits the returned units back to the seller's inventory and writes
 * an inventory transaction per line item.
 *
 * Claimed through `stockRestoredAt`, so approving twice - or approving
 * and later completing - can never restore the same stock twice.
 * Returns the number of units credited.
 */
const restoreStockForReturn = async (
  returnRequest: IReturnRequest,
  order: IOrder,
  actor: { id: string; role: string },
): Promise<number> => {
  const claimed = await claimReturnStockRestore(
    returnRequest._id.toString(),
  );

  if (!claimed) {
    return 0;
  }

  let units = 0;

  for (const item of order.items) {
    const productId = item.productId.toString();
    const product = await findProductById(productId);

    await incrementProductStock(
      productId,
      item.quantity,
    );

    units += item.quantity;

    await recordStockChange({
      productId,
      sellerId: order.sellerId.toString(),
      type: InventoryTransactionType.RETURN_RESTOCK,
      quantity: item.quantity,
      previousStock: product?.stock ?? 0,
      actorId: actor.id,
      actorRole: actor.role,
      reason: `Return approved for order ${order.orderNumber}`,
      referenceId: returnRequest._id.toString(),
      referenceType: "RETURN",
      metadata: {
        orderId: order._id.toString(),
      },
    });
  }

  return units;
};

/*
 * The complete approval workflow:
 *
 *  1. claim the return (PENDING -> APPROVED) atomically, which is what
 *     makes a double-click / duplicate call unable to refund twice;
 *  2. issue the refund through the existing payment mechanism
 *     (gateway for online orders, offline ledger entry for COD) -
 *     outside the transaction because a gateway call cannot be
 *     rolled back and must never be replayed;
 *  3. apply every rollback in ONE transaction: order status + refund
 *     status, stock, coupon usage, seller earnings and platform
 *     commission in the settlement, the return's refund record and the
 *     order timeline;
 *  4. audit + notify (never inside the transaction, and a notification
 *     failure can never undo a completed refund).
 *
 * Every step is claimed before it runs, so if the process dies
 * part-way the next approval call resumes where it stopped instead of
 * duplicating anything.
 */
const approveReturn = async (
  actor: { id: string; role: UserRole },
  returnRequest: IReturnRequest,
  statusReason?: string | null,
): Promise<ReturnResponse> => {
  const returnId = returnRequest._id.toString();

  const order = await findOrderById(
    returnRequest.orderId.toString(),
  );

  if (!order) {
    throw new AppError(
      "Order not found",
      404,
      "ORDER_NOT_FOUND",
    );
  }

  if (order.status === OrderStatus.CANCELLED) {
    throw new AppError(
      "This order was cancelled, so it cannot be refunded through a return",
      409,
      "RETURN_ORDER_CANCELLED",
    );
  }

  /*
   * Already approved and refunded: the endpoint is being called again.
   * Nothing to do - report the existing state instead of paying twice.
   */
  if (
    returnRequest.status === ReturnStatus.APPROVED &&
    isRefundProcessed(returnRequest)
  ) {
    return toReturnResponse(returnRequest);
  }

  const plan = planReturnRefund(order);

  const refundDraft: IReturnRefund = {
    amount: plan.amount,
    status: RefundStatus.PENDING,
    method: plan.method,
    gatewayRefundId: null,
    paymentId: null,
    reason: plan.reason,
    requestedAt: new Date(),
    completedAt: null,
  };

  let claimed = returnRequest;

  if (returnRequest.status === ReturnStatus.PENDING) {
    const winner = await claimReturnForApproval(
      returnId,
      {
        refund: refundDraft,
        decidedBy: actor.id,
        decidedRole: actor.role,
        statusReason: statusReason ?? undefined,
      },
    );

    if (!winner) {
      /*
       * Somebody else won the claim. Either they finished (report
       * their result) or the request is still being processed.
       */
      const current = await findReturnById(returnId);

      if (
        current &&
        current.status === ReturnStatus.APPROVED &&
        isRefundProcessed(current)
      ) {
        return toReturnResponse(current);
      }

      throw new AppError(
        "This return request is already being processed",
        409,
        "RETURN_APPROVAL_IN_PROGRESS",
      );
    }

    claimed = winner;
  }

  /*
   * Step 2 - move the money. Runs before the transaction on purpose.
   */
  let outcome: ReturnRefundOutcome;

  try {
    outcome = await refundOrderForReturn(order, plan);
  } catch (error) {
    /*
     * Nothing was committed, so put the return back to PENDING with a
     * FAILED refund record and let the seller retry (or fix the
     * payment first). State and money stay in step.
     */
    await releaseFailedApproval(returnId, {
      ...refundDraft,
      status: RefundStatus.FAILED,
      reason:
        error instanceof Error
          ? error.message
          : "Refund failed",
    });

    await logAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: "RETURN_REFUND_FAILED",
      entityType: "RETURN",
      entityId: returnId,
      metadata: {
        orderId: order._id.toString(),
        amount: plan.amount,
        method: plan.method,
      },
    });

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      "The refund could not be processed, so the return was left pending",
      502,
      "REFUND_FAILED",
    );
  }

  /*
   * Step 3 - one transaction for every record the original purchase
   * touched. All-or-nothing on any deployment that supports
   * transactions (see src/config/transaction.ts).
   */
  const applied = await runInTransaction(async () => {
    /*
     * Order: RETURNED + payment REFUNDED (when money moved). Returns
     * null when a previous (resumed) run already made the transition,
     * which is also the signal not to duplicate the timeline entry.
     */
    const returnedOrder = await markOrderReturned(
      order._id.toString(),
      returnId,
      outcome.amount > 0
        ? PaymentStatus.REFUNDED
        : order.paymentStatus,
    );

    /* Inventory back to the seller. */
    const restockedUnits =
      await restoreStockForReturn(
        claimed,
        order,
        actor,
      );

    /* Coupon: release the usage so the buyer can use it again. */
    await releaseCouponUsage(order._id.toString());

    /* Seller earnings + platform commission out of the settlement. */
    const reversal = await reverseSettlementForOrder(
      order,
    );

    /* Return ledger: the refund is done. */
    await markReturnRefundProcessed(returnId, {
      amount: outcome.amount,
      status: RefundStatus.PROCESSED,
      method: outcome.method,
      gatewayRefundId: outcome.gatewayRefundId,
      paymentId: outcome.paymentId
        ? new Types.ObjectId(outcome.paymentId)
        : null,
      reason: outcome.reason,
      requestedAt:
        returnRequest.refund?.requestedAt ??
        refundDraft.requestedAt,
      completedAt: outcome.completedAt,
    });

    /* Order history (once - only for the run that closed the order). */
    if (returnedOrder) {
      await recordOrderTimeline({
        orderId: order._id.toString(),
        status: OrderStatus.RETURNED,
        actorId: actor.id,
        actorRole: actor.role,
        reason: `Return approved - refund of ${outcome.amount} issued`,
      });
    }

    return { restockedUnits, reversal };
  });

  /*
   * Step 4 - audit trail and notifications, after the money and the
   * rollbacks are durable.
   */
  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "RETURN_APPROVED",
    entityType: "RETURN",
    entityId: returnId,
    before: {
      status: returnRequest.status,
    },
    after: {
      status: ReturnStatus.APPROVED,
    },
    metadata: {
      orderId: order._id.toString(),
      refundAmount: outcome.amount,
      refundMethod: outcome.method,
      refundStatus: outcome.status,
      gatewayRefundId: outcome.gatewayRefundId,
      restockedUnits: applied.value.restockedUnits,
      settlementAdjusted:
        applied.value.reversal.reversed,
      settlementId:
        applied.value.reversal.settlementId,
      commissionReversed:
        applied.value.reversal.commissionReversed,
      sellerPayableReversed:
        applied.value.reversal.sellerPayableReversed,
      couponReleased: order.couponId
        ? order.couponId.toString()
        : null,
      transactional: applied.transactional,
    },
  });

  const updated =
    (await findReturnById(returnId)) ?? claimed;

  await notifyReturnApprovedWithRefund({
    returnRequest: updated,
    order,
    refund: {
      amount: outcome.amount,
      method: outcome.method,
    },
  });

  await notifySellerReturnRefund({
    returnRequest: updated,
    order,
    refund: {
      amount: outcome.amount,
      method: outcome.method,
    },
    restockedUnits: applied.value.restockedUnits,
    reversal: applied.value.reversal,
  });

  return toReturnResponse(updated);
};

/*
 * Completing a return records that the goods are back with the
 * seller. The refund and the rollbacks already happened at approval;
 * the stock credit is only performed here for returns approved before
 * that flow existed, so the inventory is never credited twice.
 */
const completeReturn = async (
  actor: { id: string; role: UserRole },
  returnRequest: IReturnRequest,
): Promise<ReturnResponse> => {
  const returnId = returnRequest._id.toString();

  /*
   * A return that has a refund record which is not PROCESSED means the
   * buyer has not been paid back yet - closing it would hide an
   * outstanding refund. (Returns approved before refunds existed have
   * no refund record at all and stay completable.)
   */
  if (
    returnRequest.refund &&
    !isRefundProcessed(returnRequest)
  ) {
    throw new AppError(
      "This return cannot be completed until its refund has been processed",
      400,
      "RETURN_REFUND_NOT_PROCESSED",
    );
  }

  const updated = await markReturnCompleted(returnId);

  if (!updated) {
    const current = await findReturnById(returnId);

    if (
      current &&
      current.status === ReturnStatus.COMPLETED
    ) {
      return toReturnResponse(current);
    }

    throw new AppError(
      "Return request not found",
      404,
      "RETURN_NOT_FOUND",
    );
  }

  let restockedUnits = 0;

  if (!updated.stockRestoredAt) {
    const order = await findOrderById(
      updated.orderId.toString(),
    );

    if (order) {
      restockedUnits = await restoreStockForReturn(
        updated,
        order,
        actor,
      );
    }
  }

  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "RETURN_STATUS_CHANGED",
    entityType: "RETURN",
    entityId: returnId,
    before: { status: returnRequest.status },
    after: { status: updated.status },
    metadata: { restockedUnits },
  });

  await notifyReturnStatusChange(
    updated,
    updated.status,
  );

  return toReturnResponse(updated);
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

  /*
   * Re-approving an already approved return is not an error: either
   * the refund completed (return the state) or it did not (resume the
   * pipeline so a failed run can finish without a second refund).
   */
  if (
    data.status === ReturnStatus.APPROVED &&
    returnRequest.status === ReturnStatus.APPROVED
  ) {
    return approveReturn(user, returnRequest);
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

  if (data.status === ReturnStatus.APPROVED) {
    return approveReturn(
      user,
      returnRequest,
      data.reason ?? null,
    );
  }

  if (data.status === ReturnStatus.COMPLETED) {
    return completeReturn(user, returnRequest);
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

  /*
   * An approved return has already refunded the buyer and rolled the
   * purchase back - cancelling it would undo a completed money
   * movement, so it is refused explicitly.
   */
  if (
    returnRequest.status === ReturnStatus.APPROVED &&
    isRefundProcessed(returnRequest)
  ) {
    throw new AppError(
      "This return was already approved and refunded, so it can no longer be cancelled",
      400,
      "RETURN_ALREADY_REFUNDED",
    );
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

