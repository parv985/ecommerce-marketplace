import type { ReturnStatus } from "../../constants/returnStatus.js";
import type {
  RefundMethod,
  RefundStatus,
} from "../../constants/payment.js";

/* Money side of a return, exposed to the buyer and the seller. */
export interface ReturnRefundResponse {
  amount: number;
  status: RefundStatus;
  method: RefundMethod;
  gatewayRefundId: string | null;
  paymentId: string | null;
  reason: string | null;
  requestedAt: Date | null;
  completedAt: Date | null;
}

export interface ReturnResponse {
  id: string;
  orderId: string;
  userId: string;
  sellerId: string;
  reason: string;
  status: ReturnStatus;
  statusReason: string | null;
  approvedAt: Date | null;
  decidedBy: string | null;
  decidedRole: string | null;
  stockRestoredAt: Date | null;
  refund: ReturnRefundResponse | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedReturns {
  items: ReturnResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
