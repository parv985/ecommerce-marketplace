import type { SettlementStatus } from "../../constants/settlementStatus.js";

export interface SettlementOrderResponse {
  orderId: string;
  orderNumber: string;
  total: number;
  commissionRate: number;
  commissionAmount: number;
  sellerPayable: number;
  deliveredAt: Date;
}

export interface SettlementResponse {
  id: string;
  sellerId: string;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  status: SettlementStatus;
  orders: SettlementOrderResponse[];
  totalSales: number;
  totalCommission: number;
  totalPayable: number;
  commissionRate: number;
  paidAt: Date | null;
  reminderSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedSettlements {
  items: SettlementResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
