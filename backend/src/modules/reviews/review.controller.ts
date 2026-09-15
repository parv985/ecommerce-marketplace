import type {
  Request,
  Response,
} from "express";

import { sendSuccess } from "../../utils/apiResponse.js";

import {
  createProductReview,
  deleteProductReview,
  getProductReviews,
  updateProductReview,
} from "./review.service.js";

export const createReviewController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const review = await createProductReview(
    req.user!.id,
    req.body,
  );

  sendSuccess(
    res,
    "Review submitted successfully",
    review,
    201,
  );
};

export const listReviewsController = async (
  req: Request<{ productId: string }>,
  res: Response,
): Promise<void> => {
  const result = await getProductReviews(
    req.params.productId,
    req.query,
  );

  sendSuccess(
    res,
    "Reviews fetched successfully",
    result,
  );
};

export const updateReviewController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const review = await updateProductReview(
    req.user!.id,
    req.params.id,
    req.body,
  );

  sendSuccess(
    res,
    "Review updated successfully",
    review,
  );
};

export const deleteReviewController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  await deleteProductReview(
    req.user!.id,
    req.params.id,
  );

  sendSuccess(
    res,
    "Review deleted successfully",
    null,
  );
};
