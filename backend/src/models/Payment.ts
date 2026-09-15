import {
  Schema,
  model,
  type Types,
} from "mongoose";

import {
  PaymentGateway,
  PaymentRecordStatus,
  RefundStatus,
} from "../constants/payment.js";

export interface IRefund {
  gatewayRefundId: string | null;
  /* Refunded amount in rupees (always the full paid amount). */
  amount: number;
  status: RefundStatus;
  reason: string | null;
  requestedAt: Date | null;
  completedAt: Date | null;
}

export interface IPayment {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  gateway: PaymentGateway;
  /* Provider order id returned by createGatewayOrder. */
  gatewayOrderId: string;
  /* Provider payment id, set after capture/verification. */
  gatewayPaymentId: string | null;
  /* Amount in rupees. */
  amount: number;
  currency: string;
  status: PaymentRecordStatus;
  refund: IRefund | null;
  /*
   * Idempotency key for webhook events ("<event>:<entityId>"). The
   * sparse unique index guarantees a given webhook event can only be
   * processed once, even under concurrent delivery. The field is
   * intentionally OMITTED (never null) before an event is claimed:
   * MongoDB's sparse index excludes missing fields but indexes null
   * values, so a null default would allow only one unclaimed payment.
   */
  webhookEventId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const refundSchema = new Schema<IRefund>(
  {
    gatewayRefundId: {
      type: String,
      default: null,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: Object.values(RefundStatus),
      default: RefundStatus.PENDING,
    },

    reason: {
      type: String,
      default: null,
    },

    requestedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const paymentSchema = new Schema<IPayment>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
      index: true,
    },

    gateway: {
      type: String,
      enum: Object.values(PaymentGateway),
      required: true,
    },

    gatewayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    gatewayPaymentId: {
      type: String,
      default: null,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      required: true,
      default: "INR",
    },

    status: {
      type: String,
      enum: Object.values(PaymentRecordStatus),
      default: PaymentRecordStatus.PENDING,
      index: true,
    },

    refund: {
      type: refundSchema,
      default: null,
    },

    webhookEventId: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

/*
 * One webhook event per payment record. Sparse: documents without a
 * webhookEventId (all non-webhook payments) are excluded, so the
 * unique constraint only applies to events actually received.
 */
paymentSchema.index(
  { webhookEventId: 1 },
  {
    unique: true,
    sparse: true,
  },
);

export const Payment = model<IPayment>(
  "Payment",
  paymentSchema,
);
