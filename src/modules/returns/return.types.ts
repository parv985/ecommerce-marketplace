import type { ReturnStatus } from "../../constants/returnStatus.js";

export interface ReturnResponse {
  id: string;
  orderId: string;
  userId: string;
  sellerId: string;
  reason: string;
  status: ReturnStatus;
  statusReason: string | null;
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
