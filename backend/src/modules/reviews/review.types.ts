export interface ReviewResponse {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  productId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductReviewsResponse {
  productId: string;
  averageRating: number;
  reviewCount: number;
  items: ReviewResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SellerProductReviewsResponse {
  products: SellerReviewProductItem[];
  totalReviews: number;
  averageRating: number;
}

export interface SellerReviewProductItem {
  product: {
    id: string;
    name: string;
    image: string | null;
    price: number;
    stock: number;
  };
  reviews: ReviewResponse[];
  reviewCount: number;
  averageRating: number;
}
