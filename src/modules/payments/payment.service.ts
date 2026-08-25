import { UserRole } from "../../constants/roles.js";
import {
  PaymentMethod,
  PaymentStatus,
} from "../../constants/orderStatus.js";
import {
  PaymentGateway,
  PaymentRecordStatus,
  RefundStatus,
} from "../../constants/payment.js";
import { AppError } from "../../errors/AppError.js";
import type { IOrder } from "../../models/Order.js";
import type { IPayment } from "../../models/Payment.js";
import { logAudit } from "../../services/audit.service.js";
import { env } from "../../config/env.js";
import {
  findOrderById,
  updateOrderPaymentIdById,
  updateOrderPaymentStatusById,
} from "../orders/order.repository.js";
import {
  notifyPaymentReceived,
  notifyPaymentRefunded,
} from "../notifications/notification.service.js";
import {
  createGatewayOrder,
  createGatewayRefund,
  getGatewayMode,
  isRazorpayConfigured,
  verifyClientPaymentSignature,
  verifyWebhookSignature,
} from "./razorpay.service.js";
import {
  applyWebhookPaid,
  applyWebhookRefundProcessed,
  createPaymentRecord,
  findPaymentByGatewayOrderId,
  findPaymentByOrderId,
  markPaymentPaid,
  markPaymentRefunded,
} from "./payment.repository.js";
import {
  verifyPaymentSchema,
  type VerifyPaymentInput,
} from "./payment.schema.js";
import type { PaymentResponse } from "./payment.types.js";

const toPaymentResponse = (
  payment: IPayment,
): PaymentResponse => {
  return {
    id: payment._id.toString(),
    orderId: payment.orderId.toString(),
    gateway: payment.gateway as PaymentGateway,
    gatewayOrderId: payment.gatewayOrderId,
    gatewayPaymentId:
      payment.gatewayPaymentId ?? null,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    refund: payment.refund
      ? {
          gatewayRefundId:
            payment.refund.gatewayRefundId ??
            null,
          amount: payment.refund.amount,
          status: payment.refund.status,
          reason: payment.refund.reason ?? null,
          requestedAt:
            payment.refund.requestedAt ?? null,
          completedAt:
            payment.refund.completedAt ?? null,
        }
      : null,
    /*
     * keyId is Razorpay's PUBLIC identifier used to open the checkout
     * widget. The key secret and webhook secret are never exposed.
     */
    keyId: isRazorpayConfigured()
      ? (env.RAZORPAY_KEY_ID ?? null)
      : null,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
};

/*
 * ---------------------------------------------------------------------
 * Payment initiation
 * ---------------------------------------------------------------------
 */

/*
 * Creates a gateway payment order for the authenticated buyer's order.
 * Idempotent: a repeated call returns the existing payment record
 * instead of creating a second gateway order (which would double-charge
 * if the buyer paid both).
 */
export const initiatePayment = async (
  user: { id: string; role: UserRole },
  orderId: string,
): Promise<PaymentResponse> => {
  const order = await findOrderById(orderId);

  if (!order) {
    throw new AppError(
      "Order not found",
      404,
      "ORDER_NOT_FOUND",
    );
  }

  if (order.userId.toString() !== user.id) {
    throw new AppError(
      "You do not have permission to pay for this order",
      403,
      "FORBIDDEN",
    );
  }

  if (
    order.paymentMethod !== PaymentMethod.ONLINE
  ) {
    throw new AppError(
      "Only online orders can be paid through the payment gateway",
      400,
      "PAYMENT_METHOD_NOT_ONLINE",
    );
  }

  const existing = await findPaymentByOrderId(
    orderId,
  );

  if (existing) {
    return toPaymentResponse(existing);
  }

  if (
    order.paymentStatus !== PaymentStatus.PENDING
  ) {
    throw new AppError(
      "This order cannot be paid in its current state",
      400,
      "INVALID_PAYMENT_STATE",
    );
  }

  /*
   * The gateway order amount is always derived from the server-side
   * order total - never from the client.
   */
  const gatewayOrder = await createGatewayOrder({
    amount: order.total,
    receipt: order.orderNumber,
    notes: { orderId: order._id.toString() },
  });

  const payment = await createPaymentRecord({
    orderId,
    gateway: getGatewayMode(),
    gatewayOrderId: gatewayOrder.id,
    amount: order.total,
    currency: gatewayOrder.currency,
  });

  await updateOrderPaymentIdById(
    orderId,
    payment._id.toString(),
  );

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "PAYMENT_INITIATED",
    entityType: "ORDER",
    entityId: orderId,
    metadata: {
      gatewayOrderId: gatewayOrder.id,
      amount: order.total,
    },
  });

  return toPaymentResponse(payment);
};

/*
 * ---------------------------------------------------------------------
 * Server-side payment verification
 * ---------------------------------------------------------------------
 */

/*
 * Verifies the client-provided payment signature against the gateway
 * order id stored on the server. The client can never set payment
 * status directly - only a signature that re-derives to the expected
 * HMAC can mark the order paid. Idempotent once PAID.
 */
export const verifyOrderPayment = async (
  user: { id: string; role: UserRole },
  orderId: string,
  input: unknown,
): Promise<PaymentResponse> => {
  const data: VerifyPaymentInput =
    verifyPaymentSchema.parse(input);

  const order = await findOrderById(orderId);

  if (!order) {
    throw new AppError(
      "Order not found",
      404,
      "ORDER_NOT_FOUND",
    );
  }

  if (order.userId.toString() !== user.id) {
    throw new AppError(
      "You do not have permission to pay for this order",
      403,
      "FORBIDDEN",
    );
  }

  const payment = await findPaymentByOrderId(
    orderId,
  );

  if (!payment) {
    throw new AppError(
      "No payment was initiated for this order",
      400,
      "PAYMENT_NOT_INITIATED",
    );
  }

  if (payment.status === PaymentRecordStatus.PAID) {
    return toPaymentResponse(payment);
  }

  const valid = verifyClientPaymentSignature({
    gatewayOrderId: payment.gatewayOrderId,
    paymentId: data.paymentId,
    signature: data.signature,
  });

  if (!valid) {
    throw new AppError(
      "Invalid payment signature",
      400,
      "INVALID_PAYMENT_SIGNATURE",
    );
  }

  const updated = await markPaymentPaid(
    payment._id.toString(),
    data.paymentId,
  );

  const updatedOrder =
    await updateOrderPaymentStatusById(
      orderId,
      PaymentStatus.PAID,
    );

  if (updatedOrder) {
    await notifyPaymentReceived(updatedOrder);
  }

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "PAYMENT_VERIFIED",
    entityType: "ORDER",
    entityId: orderId,
    metadata: {
      gatewayPaymentId: data.paymentId,
    },
  });

  return toPaymentResponse(updated!);
};

/*
 * ---------------------------------------------------------------------
 * Webhook processing
 * ---------------------------------------------------------------------
 */

/*
 * Processes a Razorpay webhook. Signature is verified over the raw
 * body; events are claimed atomically through the unique sparse index
 * on webhookEventId, so a duplicate delivery (Razorpay retries
 * webhooks) is always a no-op and can never double-process an order.
 * Unknown orders are ignored - we never fabricate payments from
 * events we cannot tie back to a payment record we created.
 */
export const processPaymentWebhook = async (
  input: {
    rawBody: string;
    signature: string;
  },
): Promise<{ processed: boolean }> => {
  if (
    !verifyWebhookSignature(
      input.rawBody,
      input.signature,
    )
  ) {
    throw new AppError(
      "Invalid webhook signature",
      400,
      "INVALID_WEBHOOK_SIGNATURE",
    );
  }

  let payload: {
    event?: string;
    payload?: {
      payment?: { entity?: Record<string, unknown> };
      refund?: { entity?: Record<string, unknown> };
    };
  };

  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    return { processed: false };
  }

  const event = payload.event ?? "";
  const entity =
    payload.payload?.payment?.entity;

  if (!entity?.id) {
    return { processed: false };
  }

  const gatewayOrderId = (
    entity.order_id as string | undefined
  ) ?? "";

  const payment = gatewayOrderId
    ? await findPaymentByGatewayOrderId(
        gatewayOrderId,
      )
    : null;

  if (!payment) {
    return { processed: false };
  }

  /*
   * payment.captured / order.paid: mark the payment and order paid.
   */
  if (
    event === "payment.captured" ||
    event === "order.paid"
  ) {
    const eventId = `${event}:${entity.id}`;

    const claimed = await applyWebhookPaid(
      payment._id.toString(),
      eventId,
      entity.id as string,
    );

    if (!claimed) {
      return { processed: false };
    }

    const order = await findOrderById(
      payment.orderId.toString(),
    );

    if (
      order &&
      order.paymentStatus !== PaymentStatus.PAID
    ) {
      const updatedOrder =
        await updateOrderPaymentStatusById(
          order._id.toString(),
          PaymentStatus.PAID,
        );

      if (updatedOrder) {
        await notifyPaymentReceived(
          updatedOrder,
        );
      }
    }

    await logAudit({
      actorId: "webhook",
      actorRole: "SYSTEM",
      action: "PAYMENT_CAPTURED",
      entityType: "ORDER",
      entityId: payment.orderId.toString(),
      metadata: { eventId },
    });

    return { processed: true };
  }

  /*
   * refund.processed: an asynchronous gateway refund completed.
   */
  if (event === "refund.processed") {
    const refundEntity =
      payload.payload?.refund?.entity;

    if (!refundEntity?.id) {
      return { processed: false };
    }

    const eventId = `${event}:${refundEntity.id}`;

    const claimed = await applyWebhookRefundProcessed(
      payment._id.toString(),
      eventId,
      refundEntity.id as string,
    );

    if (!claimed) {
      return { processed: false };
    }

    return { processed: true };
  }

  return { processed: false };
};

/*
 * ---------------------------------------------------------------------
 * Refunds
 * ---------------------------------------------------------------------
 */

/*
 * Refunds a paid online order in full. Only the order's seller or an
 * admin may issue a refund (buyer-facing refunds happen through
 * cancellation/returns, which call refundPaidOrderInternal). Refund
 * amounts are never client-supplied - always the paid order total.
 * Idempotent: a second refund request on an already-refunded payment
 * returns the current state.
 */
export const refundOrderPayment = async (
  user: { id: string; role: UserRole },
  orderId: string,
): Promise<PaymentResponse> => {
  const order = await findOrderById(orderId);

  if (!order) {
    throw new AppError(
      "Order not found",
      404,
      "ORDER_NOT_FOUND",
    );
  }

  const isSellerOfOrder =
    user.role === UserRole.SELLER &&
    order.sellerId.toString() === user.id;

  if (
    user.role !== UserRole.SUPER_ADMIN &&
    !isSellerOfOrder
  ) {
    throw new AppError(
      "You do not have permission to refund this order",
      403,
      "FORBIDDEN",
    );
  }

  return refundPaidOrderInternal(order, user);
};

/*
 * Shared refund core. Called by the public refund endpoint and by the
 * cancellation flow (buyer cancels a paid online order - the refund is
 * implied by the cancellation). If the gateway rejects the refund the
 * cancellation is aborted so state never diverges (cancelled order but
 * money still held).
 */
export const refundPaidOrderInternal = async (
  order: IOrder,
  actor: {
    id: string;
    role: UserRole | string;
  },
): Promise<PaymentResponse> => {
  if (
    order.paymentMethod !== PaymentMethod.ONLINE
  ) {
    throw new AppError(
      "This order was not paid online",
      400,
      "PAYMENT_METHOD_NOT_ONLINE",
    );
  }

  const payment = await findPaymentByOrderId(
    order._id.toString(),
  );

  if (!payment) {
    throw new AppError(
      "No payment was initiated for this order",
      400,
      "PAYMENT_NOT_INITIATED",
    );
  }

  if (
    payment.status === PaymentRecordStatus.REFUNDED
  ) {
    return toPaymentResponse(payment);
  }

  if (payment.status !== PaymentRecordStatus.PAID) {
    throw new AppError(
      "Only paid orders can be refunded",
      400,
      "INVALID_PAYMENT_STATE",
    );
  }

  const refund = await createGatewayRefund({
    paymentId:
      payment.gatewayPaymentId ??
      payment.gatewayOrderId,
    amount: payment.amount,
    notes: { orderId: order._id.toString() },
  });

  const updated = await markPaymentRefunded(
    payment._id.toString(),
    {
      gatewayRefundId: refund.id,
      amount: payment.amount,
      status: refund.status,
      reason: "Full refund",
      requestedAt: new Date(),
      completedAt:
        refund.status === RefundStatus.PROCESSED
          ? new Date()
          : null,
    },
  );

  await updateOrderPaymentStatusById(
    order._id.toString(),
    PaymentStatus.REFUNDED,
  );

  await notifyPaymentRefunded(order);

  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "PAYMENT_REFUNDED",
    entityType: "ORDER",
    entityId: order._id.toString(),
    metadata: {
      gatewayRefundId: refund.id,
      amount: payment.amount,
    },
  });

  return toPaymentResponse(updated!);
};
