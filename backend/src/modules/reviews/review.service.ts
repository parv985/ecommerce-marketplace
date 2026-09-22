import { AppError } from "../../errors/AppError.js";
import type { IReview } from "../../models/Review.js";
import {
  aggregateProductRating,
  createReview,
  deleteReviewById,
  findReviewById,
  findReviewByUserAndProduct,
  findReviewUserNames,
  hasDeliveredOrderWithProduct,
  listReviewsByProduct,
  updateReviewById,
} from "./review.repository.js";
import {
  createReviewSchema,
  listReviewsQuerySchema,
  updateReviewSchema,
  type CreateReviewInput,
  type ListReviewsQuery,
  type UpdateReviewInput,
} from "./review.schema.js";
import { Product } from "../../models/Product.js";
import { Review } from "../../models/Review.js";
import { Seller } from "../../models/Seller.js";
import type {
  ProductReviewsResponse,
  ReviewResponse,
  SellerProductReviewsResponse,
  SellerReviewProductItem,
} from "./review.types.js";

const toReviewResponse = async (
  review: IReview,
): Promise<ReviewResponse> => {
  const names = await findReviewUserNames([
    review.userId.toString(),
  ]);

  const user = names.get(
    review.userId.toString(),
  );

  return {
    id: review._id.toString(),
    userId: review.userId.toString(),
    userName: user?.name ?? "Unknown user",
    userAvatar: user?.avatarUrl ?? null,
    productId: review.productId.toString(),
    rating: review.rating,
    comment: review.comment ?? null,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
};

export const createProductReview = async (
  userId: string,
  input: unknown,
): Promise<ReviewResponse> => {
  const data: CreateReviewInput =
    createReviewSchema.parse(input);

  const eligible =
    await hasDeliveredOrderWithProduct(
      userId,
      data.productId,
    );

  if (!eligible) {
    throw new AppError(
      "You can only review a product after its order has been delivered",
      403,
      "NOT_ELIGIBLE_FOR_REVIEW",
    );
  }

  const existing =
    await findReviewByUserAndProduct(
      userId,
      data.productId,
    );

  if (existing) {
    throw new AppError(
      "You have already reviewed this product",
      409,
      "REVIEW_ALREADY_EXISTS",
    );
  }

  const review = await createReview({
    userId,
    productId: data.productId,
    rating: data.rating,
    comment: data.comment,
  });

  return toReviewResponse(review);
};

export const getProductReviews = async (
  productId: string,
  query: unknown,
): Promise<ProductReviewsResponse> => {
  const parsed: ListReviewsQuery =
    listReviewsQuerySchema.parse(query);

  const { items, total } =
    await listReviewsByProduct(
      productId,
      parsed.page,
      parsed.limit,
    );

  const { average, count } =
    await aggregateProductRating(productId);

  const userIds = Array.from(
    new Set(
      items.map((item) =>
        item.userId.toString(),
      ),
    ),
  );

  const names = await findReviewUserNames(
    userIds,
  );

  return {
    productId,
    averageRating: average,
    reviewCount: count,
    items: items.map((review) => {
      const user = names.get(
        review.userId.toString(),
      );

      return {
        id: review._id.toString(),
        userId: review.userId.toString(),
        userName: user?.name ?? "Unknown user",
        userAvatar: user?.avatarUrl ?? null,
        productId: review.productId.toString(),
        rating: review.rating,
        comment: review.comment ?? null,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
      };
    }),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

export const updateProductReview = async (
  userId: string,
  reviewId: string,
  input: unknown,
): Promise<ReviewResponse> => {
  const data: UpdateReviewInput =
    updateReviewSchema.parse(input);

  const review = await findReviewById(reviewId);

  if (!review) {
    throw new AppError(
      "Review not found",
      404,
      "REVIEW_NOT_FOUND",
    );
  }

  if (review.userId.toString() !== userId) {
    throw new AppError(
      "You can only update your own reviews",
      403,
      "FORBIDDEN",
    );
  }

  const updated = await updateReviewById(
    reviewId,
    data,
  );

  if (!updated) {
    throw new AppError(
      "Review not found",
      404,
      "REVIEW_NOT_FOUND",
    );
  }

  return toReviewResponse(updated);
};

export const deleteProductReview = async (
  userId: string,
  reviewId: string,
): Promise<void> => {
  const review = await findReviewById(reviewId);

  if (!review) {
    throw new AppError(
      "Review not found",
      404,
      "REVIEW_NOT_FOUND",
    );
  }

  if (review.userId.toString() !== userId) {
    throw new AppError(
      "You can only delete your own reviews",
      403,
      "FORBIDDEN",
    );
  }

  await deleteReviewById(reviewId);
};

export const getSellerReviews = async (
  userId: string,
): Promise<SellerProductReviewsResponse> => {
  const seller = await Seller.findOne({
    $or: [{ userId }, { _id: userId }],
  }).exec();

  const sellerIds: any[] = [userId];
  if (seller) {
    sellerIds.push(seller._id);
    sellerIds.push(seller.userId);
  }

  const products = await Product.find({
    sellerId: { $in: sellerIds },
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  const productIds = products.map((p) => p._id);
  const reviews = await Review.find({
    productId: { $in: productIds },
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  const userIds = Array.from(
    new Set(reviews.map((r) => r.userId.toString())),
  );
  const userNamesMap = await findReviewUserNames(userIds);

  const reviewsByProduct = new Map<string, typeof reviews>();
  for (const review of reviews) {
    const pid = review.productId.toString();
    const list = reviewsByProduct.get(pid) ?? [];
    list.push(review);
    reviewsByProduct.set(pid, list);
  }

  let totalReviewsCount = 0;
  let totalRatingSum = 0;

  const productItems: SellerReviewProductItem[] = products.map((p) => {
    const pid = p._id.toString();
    const pReviews = reviewsByProduct.get(pid) ?? [];
    const pReviewResponses: ReviewResponse[] = pReviews.map((r) => {
      const user = userNamesMap.get(r.userId.toString());
      return {
        id: r._id.toString(),
        userId: r.userId.toString(),
        userName: user?.name ?? "Buyer",
        userAvatar: user?.avatarUrl ?? null,
        productId: pid,
        rating: r.rating,
        comment: r.comment ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });

    const pReviewCount = pReviews.length;
    const pAvgRating =
      pReviewCount > 0
        ? Number(
            (
              pReviews.reduce((sum, r) => sum + r.rating, 0) /
              pReviewCount
            ).toFixed(1),
          )
        : 0;

    totalReviewsCount += pReviewCount;
    totalRatingSum += pReviews.reduce((sum, r) => sum + r.rating, 0);

    return {
      product: {
        id: pid,
        name: p.name,
        image: p.images?.[0]?.url ?? null,
        price: p.price,
        stock: p.stock,
      },
      reviews: pReviewResponses,
      reviewCount: pReviewCount,
      averageRating: pAvgRating,
    };
  });

  const overallAverage =
    totalReviewsCount > 0
      ? Number((totalRatingSum / totalReviewsCount).toFixed(1))
      : 0;

  return {
    products: productItems,
    totalReviews: totalReviewsCount,
    averageRating: overallAverage,
  };
};
