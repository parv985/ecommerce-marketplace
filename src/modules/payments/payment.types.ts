import type {
  PaymentGateway,
  PaymentRecordStatus,
  RefundStatus,
} from "../../constants/payment.js";

export interface RefundResponse {
  gatewayRefundId: string | null;
  amount: number;
  status: RefundStatus;
  reason: string | null;
  requestedAt: Date | null;
  completedAt: Date | null;
}

export interface PaymentResponse {
  id: string;
  orderId: string;
  gateway: PaymentGateway;
  gatewayOrderId: string;
  gatewayPaymentId: string | null;
  amount: number;
  currency: string;
  status: PaymentRecordStatus;
  refund: RefundResponse | null;
  /* Public key id for the Razorpay checkout widget (never the secret). */
  keyId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
