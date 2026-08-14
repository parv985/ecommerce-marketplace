import type { ProductStatus } from "../../constants/productStatus.js";

export interface ProductResponse {
  id: string;
  sellerId: string;
  name: string;
  description: string | null;
  category: {
    id: string;
    name: string | null;
  } | null;
  price: number;
  stock: number;
  images: string[];
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedProducts {
  items: ProductResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
