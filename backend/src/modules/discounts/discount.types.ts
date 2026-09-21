import type {
  DiscountStatus,
  DiscountType,
} from "../../constants/discountStatus.js";

export interface DiscountResponse {
  id: string;
  sellerId: string;
  productId: string | null;
  productName?: string | null;
  categoryId: string | null;
  categoryName?: string | null;
  scope?: "PRODUCT" | "CATEGORY";
  discountType: DiscountType;
  discountValue: number;
  startAt: Date;
  endAt: Date;
  status: DiscountStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedDiscounts {
  items: DiscountResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
