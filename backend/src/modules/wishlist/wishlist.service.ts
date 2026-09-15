import { AppError } from "../../errors/AppError.js";
import type { IProduct } from "../../models/Product.js";
import { ProductStatus } from "../../constants/productStatus.js";
import {
  findActiveProductsByIds,
} from "../products/product.repository.js";
import {
  addProductToWishlist,
  clearWishlistItems,
  createEmptyWishlist,
  findWishlistByUserId,
  isProductInWishlist,
  removeProductFromWishlist,
} from "./wishlist.repository.js";
import {
  addWishlistItemSchema,
  type AddWishlistItemInput,
} from "./wishlist.schema.js";
import type {
  WishlistItemResponse,
  WishlistProductSummary,
  WishlistResponse,
} from "./wishlist.types.js";

const toProductSummary = (
  product: IProduct,
): WishlistProductSummary => {
  return {
    id: product._id.toString(),
    sellerId: product.sellerId.toString(),
    name: product.name,
    price: product.price,
    stock: product.stock,
    images: product.images ?? [],
    status: product.status,
  };
};

const buildWishlistResponse = async (
  wishlist: { items: Array<{ productId: { toString(): string }; addedAt: Date }> },
): Promise<WishlistResponse> => {
  const ids = wishlist.items.map((item) =>
    item.productId.toString(),
  );

  const products =
    ids.length > 0
      ? await findActiveProductsByIds(ids)
      : [];

  const productMap = new Map<string, IProduct>();

  for (const product of products) {
    productMap.set(
      product._id.toString(),
      product,
    );
  }

  const items: WishlistItemResponse[] =
    wishlist.items.map((item) => {
      const product = productMap.get(
        item.productId.toString(),
      );

      return {
        productId: item.productId.toString(),
        addedAt: item.addedAt,
        product: product
          ? toProductSummary(product)
          : null,
      };
    });

  return {
    id: (wishlist as unknown as { _id: { toString(): string } })._id.toString(),
    items,
    totalItems: items.length,
  };
};

export const getWishlist = async (
  userId: string,
): Promise<WishlistResponse> => {
  const wishlist =
    (await findWishlistByUserId(userId)) ??
    (await createEmptyWishlist(userId));

  return buildWishlistResponse(wishlist);
};

export const addToWishlist = async (
  userId: string,
  input: unknown,
): Promise<WishlistResponse> => {
  const data: AddWishlistItemInput =
    addWishlistItemSchema.parse(input);

  /* Verify the product exists and is active */
  const products = await findActiveProductsByIds([
    data.productId,
  ]);

  const product = products[0];

  if (!product) {
    throw new AppError(
      "Product not found or inactive",
      404,
      "PRODUCT_NOT_FOUND",
    );
  }

  /* Check if already in wishlist */
  const exists = await isProductInWishlist(
    userId,
    data.productId,
  );

  if (exists) {
    throw new AppError(
      "Product is already in your wishlist",
      409,
      "ALREADY_IN_WISHLIST",
    );
  }

  /* Ensure wishlist exists */
  const existingWishlist =
    await findWishlistByUserId(userId);

  if (!existingWishlist) {
    await createEmptyWishlist(userId);
  }

  await addProductToWishlist(userId, data.productId);

  return getWishlist(userId);
};

export const removeFromWishlist = async (
  userId: string,
  productId: string,
): Promise<WishlistResponse> => {
  const wishlist = await findWishlistByUserId(userId);

  if (
    !wishlist ||
    !wishlist.items.some(
      (item) =>
        item.productId.toString() === productId,
    )
  ) {
    throw new AppError(
      "Item not found in wishlist",
      404,
      "WISHLIST_ITEM_NOT_FOUND",
    );
  }

  await removeProductFromWishlist(
    userId,
    productId,
  );

  return getWishlist(userId);
};

export const clearWishlist = async (
  userId: string,
): Promise<WishlistResponse> => {
  const wishlist =
    (await findWishlistByUserId(userId)) ??
    (await createEmptyWishlist(userId));

  await clearWishlistItems(userId);

  return getWishlist(userId);
};

export const checkWishlistItem = async (
  userId: string,
  productId: string,
): Promise<{ inWishlist: boolean }> => {
  return {
    inWishlist: await isProductInWishlist(
      userId,
      productId,
    ),
  };
};
