import type { ProductStatus } from "../../constants/productStatus.js";

export interface ProductImage {
  url: string;
  publicId: string;
}

export interface ProductSpec {
  key: string;
  value: string;
}

/*
 * Live sales discount (created by a seller for a product or category)
 * that currently applies to the product, resolved server-side with the
 * same deterministic rules used at checkout. Absent/null when no
 * discount is live. `discountValue` is the percentage, `discountAmount`
 * the absolute saving per unit and `discountedPrice` the price a buyer
 * actually pays per unit at checkout.
 */
export interface ProductActiveDiscount {
  id: string;
  discountValue: number;
  discountAmount: number;
  discountedPrice: number;
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
  /** Present on public catalog responses; null when nothing is live. */
  activeDiscount?: ProductActiveDiscount | null;
}

export interface PaginatedProducts {
  items: ProductResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
