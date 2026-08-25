import type {
  CouponStatus,
  CouponType,
} from "../../constants/couponStatus.js";

export interface CouponResponse {
  id: string;
  sellerId: string;
  code: string;
  type: CouponType;
  value: number;
  minOrderValue: number;
  maxDiscount: number | null;
  productIds: string[];
  categoryIds: string[];
  startAt: Date;
  endAt: Date;
  usageLimit: number | null;
  perUserLimit: number | null;
  usageCount: number;
  status: CouponStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedCoupons {
  items: CouponResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
