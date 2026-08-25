import {
  Payment,
  type IPayment,
  type IRefund,
} from "../../models/Payment.js";
import {
  PaymentGateway,
  PaymentRecordStatus,
  RefundStatus,
} from "../../constants/payment.js";

export const findPaymentByOrderId = async (
  orderId: string,
): Promise<IPayment | null> => {
  return Payment.findOne({ orderId }).exec();
};

export const findPaymentByGatewayOrderId =
  async (
    gatewayOrderId: string,
  ): Promise<IPayment | null> => {
    return Payment.findOne({
      gatewayOrderId,
    }).exec();
  };

export const createPaymentRecord = async (
  data: {
    orderId: string;
    gateway: PaymentGateway;
    gatewayOrderId: string;
    amount: number;
    currency: string;
  },
): Promise<IPayment> => {
  return Payment.create(data);
};

export const markPaymentPaid = async (
  id: string,
  gatewayPaymentId: string,
): Promise<IPayment | null> => {
  return Payment.findByIdAndUpdate(
    id,
    {
      $set: {
        status: PaymentRecordStatus.PAID,
        gatewayPaymentId,
      },
    },
    { new: true },
  ).exec();
};

/*
 * Atomically claims a webhook event (unique sparse index on
 * webhookEventId) and applies the captured state in one operation.
 * Returns null when the event was already processed or a concurrent
 * copy won the race - the caller then safely no-ops.
 */
export const applyWebhookPaid = async (
  id: string,
  webhookEventId: string,
  gatewayPaymentId: string,
): Promise<IPayment | null> => {
  try {
    return await Payment.findOneAndUpdate(
      {
        _id: id,
        webhookEventId: { $exists: false },
      },
      {
        $set: {
          webhookEventId,
          status: PaymentRecordStatus.PAID,
          gatewayPaymentId,
        },
      },
      { new: true },
    ).exec();
  } catch (error) {
    /*
     * The unique webhookEventId index can reject the claim when the
     * event was already processed against ANOTHER payment (replayed
     * or foreign event) - treat that as already-processed, never an
     * error.
     */
    if ((error as { code?: number })?.code === 11000) {
      return null;
    }

    throw error;
  }
};

export const markPaymentRefunded = async (
  id: string,
  refund: IRefund,
): Promise<IPayment | null> => {
  return Payment.findByIdAndUpdate(
    id,
    {
      $set: {
        status: PaymentRecordStatus.REFUNDED,
        refund,
      },
    },
    { new: true },
  ).exec();
};

/*
 * Completes an asynchronous gateway refund (refund.processed webhook).
 * Atomically claims the event (unique sparse index) and marks the
 * refund completed in one operation; null when already processed.
 */
export const applyWebhookRefundProcessed = async (
  id: string,
  webhookEventId: string,
  gatewayRefundId: string | null,
): Promise<IPayment | null> => {
  try {
    return await Payment.findOneAndUpdate(
      {
        _id: id,
        webhookEventId: { $exists: false },
      },
      {
        $set: {
          webhookEventId,
          "refund.status": RefundStatus.PROCESSED,
          "refund.completedAt": new Date(),
          "refund.gatewayRefundId":
            gatewayRefundId ?? null,
        },
      },
      { new: true },
    ).exec();
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      return null;
    }

    throw error;
  }
};
