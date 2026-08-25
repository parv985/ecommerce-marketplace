import type { ProductStatus } from "../../constants/productStatus.js";

export interface ProductImage {
  url: string;
  publicId: string;
}

export interface ProductSpec {
  key: string;
  value: string;
}

export interface ProductResponse {
  id: string;
  sellerId: string;
  name: string;
  description: string | null;
  sku: string | null;
  category: {
    id: string;
    name: string | null;
  } | null;
  price: number;
  stock: number;
  images: ProductImage[];
  specifications: ProductSpec[];
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
