import type { ProductImage } from "../products/product.types.js";

export interface WishlistProductSummary {
  id: string;
  sellerId: string;
  name: string;
  price: number;
  stock: number;
  images: ProductImage[];
  status: string;
}

export interface WishlistItemResponse {
  productId: string;
  addedAt: Date;
  product: WishlistProductSummary | null;
}

export interface WishlistResponse {
  id: string;
  items: WishlistItemResponse[];
  totalItems: number;
}
