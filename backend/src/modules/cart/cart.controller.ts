import type {
  Request,
  Response,
} from "express";

import { sendSuccess } from "../../utils/apiResponse.js";

import {
  addItemToCart,
  clearCart,
  getCart,
  removeItemFromCart,
  updateCartItemQuantity,
} from "./cart.service.js";

export const getCartController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const cart = await getCart(req.user!.id);

  sendSuccess(
    res,
    "Cart fetched successfully",
    cart,
  );
};

export const addItemController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const cart = await addItemToCart(
    req.user!.id,
    req.body,
  );

  sendSuccess(
    res,
    "Item added to cart",
    cart,
    201,
  );
};

export const updateItemController = async (
  req: Request<{ productId: string }>,
  res: Response,
): Promise<void> => {
  const cart = await updateCartItemQuantity(
    req.user!.id,
    req.params.productId,
    req.body,
  );

  sendSuccess(
    res,
    "Cart item updated",
    cart,
  );
};

export const removeItemController = async (
  req: Request<{ productId: string }>,
  res: Response,
): Promise<void> => {
  const cart = await removeItemFromCart(
    req.user!.id,
    req.params.productId,
  );

  sendSuccess(
    res,
    "Item removed from cart",
    cart,
  );
};

export const clearCartController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const cart = await clearCart(
    req.user!.id,
  );

  sendSuccess(
    res,
    "Cart cleared",
    cart,
  );
};
