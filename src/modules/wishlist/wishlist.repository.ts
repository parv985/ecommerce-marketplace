import {
  Wishlist,
  type IWishlist,
} from "../../models/Wishlist.js";
import type { Types } from "mongoose";

export const findWishlistByUserId = async (
  userId: string,
): Promise<IWishlist | null> => {
  return Wishlist.findOne({ userId }).exec();
};

export const createEmptyWishlist = async (
  userId: string,
): Promise<IWishlist> => {
  return Wishlist.create({ userId, items: [] });
};

export const addProductToWishlist = async (
  userId: string,
  productId: string,
): Promise<void> => {
  await Wishlist.updateOne(
    { userId },
    {
      $addToSet: {
        items: { productId, addedAt: new Date() },
      },
    },
  ).exec();
};

export const removeProductFromWishlist = async (
  userId: string,
  productId: string,
): Promise<void> => {
  await Wishlist.updateOne(
    { userId },
    {
      $pull: {
        items: { productId },
      },
    },
  ).exec();
};

export const isProductInWishlist = async (
  userId: string,
  productId: string,
): Promise<boolean> => {
  const wishlist = await Wishlist.findOne({
    userId,
    "items.productId": productId,
  }).exec();

  return wishlist !== null;
};

export const clearWishlistItems = async (
  userId: string,
): Promise<void> => {
  await Wishlist.updateOne(
    { userId },
    { $set: { items: [] } },
  ).exec();
};
