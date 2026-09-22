import {
  Cart,
  type ICart,
} from "../../models/Cart.js";
import { Types } from "mongoose";

export const findCartByUserId = async (
  userId: string,
): Promise<ICart | null> => {
  return Cart.findOne({ userId }).exec();
};

export const createEmptyCart = async (
  userId: string,
): Promise<ICart> => {
  return Cart.create({
    userId,
    items: [],
  });
};

export const setItemQuantity = async (
  cartId: Types.ObjectId,
  productId: string,
  quantity: number,
): Promise<void> => {
  await Cart.updateOne(
    {
      _id: cartId,
      "items.productId": productId,
    },
    {
      $set: {
        "items.$.quantity": quantity,
      },
    },
  ).exec();
};

export const pushCartItem = async (
  cartId: Types.ObjectId,
  productId: string,
  quantity: number,
): Promise<void> => {
  await Cart.updateOne(
    { _id: cartId },
    {
      $push: {
        items: {
          productId,
          quantity,
        },
      },
    },
  ).exec();
};

export const pullCartItem = async (
  cartId: Types.ObjectId,
  productId: string,
): Promise<void> => {
  await Cart.updateOne(
    { _id: cartId },
    {
      $pull: {
        items: {
          productId,
        },
      },
    },
  ).exec();
};

export const clearCartItems = async (
  cartId: Types.ObjectId,
): Promise<void> => {
  await Cart.updateOne(
    { _id: cartId },
    {
      $set: {
        items: [],
        checkoutLockedAt: null,
      },
    },
  ).exec();
};

export const removeProductsFromCart = async (
  userId: string | Types.ObjectId,
  productIds: Array<string | Types.ObjectId>,
): Promise<void> => {
  if (!productIds || productIds.length === 0) {
    return;
  }
  const objectIds = productIds.map((id) =>
    typeof id === "string" ? new Types.ObjectId(id) : id,
  );
  await Cart.updateOne(
    { userId },
    {
      $pull: {
        items: {
          productId: { $in: objectIds },
        },
      },
      $set: {
        checkoutLockedAt: null,
      },
    },
  ).exec();
};

/*
 * Atomically claims the cart for checkout. Returns false when another
 * checkout is already running (or the cart is empty), so a concurrent
 * double-submit can never both proceed. A claim older than 5 minutes
 * is considered stale (a crashed process) and can be re-claimed.
 */
export const claimCartForCheckout = async (
  cartId: Types.ObjectId,
): Promise<boolean> => {
  const result = await Cart.updateOne(
    {
      _id: cartId,
      "items.0": { $exists: true },
      $or: [
        { checkoutLockedAt: null },
        {
          checkoutLockedAt: {
            $lt: new Date(
              Date.now() - 5 * 60 * 1000,
            ),
          },
        },
      ],
    },
    {
      $set: { checkoutLockedAt: new Date() },
    },
  ).exec();

  return result.modifiedCount > 0;
};

export const releaseCartCheckoutLock = async (
  cartId: Types.ObjectId,
): Promise<void> => {
  await Cart.updateOne(
    { _id: cartId },
    {
      $set: { checkoutLockedAt: null },
    },
  ).exec();
};
