import type { ProductStatus } from "../../constants/productStatus.js";

export interface CartProductSummary {
  id: string;
  sellerId: string;
  name: string;
  price: number;
  stock: number;
  images: string[];
  status: ProductStatus;
}

export interface CartItemResponse {
  productId: string;
  quantity: number;
  /*
   * Live product data resolved from the database. Null when the
   * product is missing or no longer active.
   */
  product: CartProductSummary | null;
  subtotal: number;
}

export interface CartResponse {
  id: string;
  items: CartItemResponse[];
  totalItems: number;
  totalQuantity: number;
  totalPrice: number;
}
