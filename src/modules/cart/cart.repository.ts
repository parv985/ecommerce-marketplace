import {
  Cart,
  type ICart,
} from "../../models/Cart.js";
import type { Types } from "mongoose";

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
      },
    },
  ).exec();
};
