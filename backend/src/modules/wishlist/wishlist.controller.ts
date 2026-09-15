import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/apiResponse.js";
import {
  addToWishlist,
  checkWishlistItem,
  clearWishlist,
  getWishlist,
  removeFromWishlist,
} from "./wishlist.service.js";

export const getWishlistController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = await getWishlist(req.user!.id);

  sendSuccess(
    res,
    "Wishlist fetched successfully",
    result,
  );
};

export const addItemToWishlistController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const result = await addToWishlist(
      req.user!.id,
      req.body,
    );

    sendSuccess(
      res,
      "Item added to wishlist",
      result,
      201,
    );
  };

export const removeItemFromWishlistController =
  async (
    req: Request<{ productId: string }>,
    res: Response,
  ): Promise<void> => {
    const result = await removeFromWishlist(
      req.user!.id,
      req.params.productId,
    );

    sendSuccess(
      res,
      "Item removed from wishlist",
      result,
    );
  };

export const clearWishlistController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = await clearWishlist(req.user!.id);

  sendSuccess(
    res,
    "Wishlist cleared",
    result,
  );
};

export const checkWishlistItemController =
  async (
    req: Request<{ productId: string }>,
    res: Response,
  ): Promise<void> => {
    const result = await checkWishlistItem(
      req.user!.id,
      req.params.productId,
    );

    sendSuccess(
      res,
      "Wishlist check completed",
      result,
    );
  };
