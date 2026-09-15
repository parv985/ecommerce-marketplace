import { AppError } from "../../errors/AppError.js";
import type { IProduct } from "../../models/Product.js";
import type { ICart } from "../../models/Cart.js";
import { findActiveProductsByIds } from "../products/product.repository.js";
import {
  addCartItemSchema,
  updateCartItemSchema,
  type AddCartItemInput,
  type UpdateCartItemInput,
} from "./cart.schema.js";
import type {
  CartItemResponse,
  CartProductSummary,
  CartResponse,
} from "./cart.types.js";
import {
  clearCartItems,
  createEmptyCart,
  findCartByUserId,
  pullCartItem,
  pushCartItem,
  setItemQuantity,
} from "./cart.repository.js";

/*
 * All prices are resolved live from the database. The client never
 * supplies prices for cart operations.
 */
const toProductSummary = (
  product: IProduct,
): CartProductSummary => {
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

export const getCart = async (
  userId: string,
): Promise<CartResponse> => {
  const cart =
    (await findCartByUserId(userId)) ??
    (await createEmptyCart(userId));

  return buildCartResponse(cart);
};

const buildCartResponse = async (
  cart: ICart,
): Promise<CartResponse> => {
  const ids = cart.items.map((item) =>
    item.productId.toString(),
  );

  const products =
    ids.length > 0
      ? await findActiveProductsByIds(ids)
      : [];

  const productMap = new Map<
    string,
    IProduct
  >();

  for (const product of products) {
    productMap.set(
      product._id.toString(),
      product,
    );
  }

  const items: CartItemResponse[] =
    cart.items.map((item) => {
      const product = productMap.get(
        item.productId.toString(),
      );

      return {
        productId:
          item.productId.toString(),
        quantity: item.quantity,
        product: product
          ? toProductSummary(product)
          : null,
        subtotal: product
          ? product.price * item.quantity
          : 0,
      };
    });

  return {
    id: cart._id.toString(),
    items,
    totalItems: items.length,
    totalQuantity: items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    ),
    totalPrice: items.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    ),
  };
};

const requireActiveProduct = async (
  productId: string,
): Promise<IProduct> => {
  const products =
    await findActiveProductsByIds([
      productId,
    ]);

  const product = products[0];

  if (!product) {
    throw new AppError(
      "Product not found or inactive",
      404,
      "PRODUCT_NOT_FOUND",
    );
  }

  return product;
};

export const addItemToCart = async (
  userId: string,
  input: unknown,
): Promise<CartResponse> => {
  const data: AddCartItemInput =
    addCartItemSchema.parse(input);

  const product =
    await requireActiveProduct(
      data.productId,
    );

  const cart =
    (await findCartByUserId(userId)) ??
    (await createEmptyCart(userId));

  const existing = cart.items.find(
    (item) =>
      item.productId.toString() ===
      data.productId,
  );

  const newQuantity =
    (existing?.quantity ?? 0) +
    data.quantity;

  if (newQuantity > product.stock) {
    throw new AppError(
      `Only ${product.stock} units of this product are available`,
      400,
      "INSUFFICIENT_STOCK",
    );
  }

  if (existing) {
    await setItemQuantity(
      cart._id,
      data.productId,
      newQuantity,
    );
  } else {
    await pushCartItem(
      cart._id,
      data.productId,
      data.quantity,
    );
  }

  return getCart(userId);
};

export const updateCartItemQuantity = async (
  userId: string,
  productId: string,
  input: unknown,
): Promise<CartResponse> => {
  const data: UpdateCartItemInput =
    updateCartItemSchema.parse(input);

  const product =
    await requireActiveProduct(
      productId,
    );

  if (data.quantity > product.stock) {
    throw new AppError(
      `Only ${product.stock} units of this product are available`,
      400,
      "INSUFFICIENT_STOCK",
    );
  }

  const cart = await findCartByUserId(
    userId,
  );

  if (
    !cart ||
    !cart.items.some(
      (item) =>
        item.productId.toString() ===
        productId,
    )
  ) {
    throw new AppError(
      "Item not found in cart",
      404,
      "CART_ITEM_NOT_FOUND",
    );
  }

  await setItemQuantity(
    cart._id,
    productId,
    data.quantity,
  );

  return getCart(userId);
};

export const removeItemFromCart = async (
  userId: string,
  productId: string,
): Promise<CartResponse> => {
  const cart = await findCartByUserId(
    userId,
  );

  if (
    !cart ||
    !cart.items.some(
      (item) =>
        item.productId.toString() ===
        productId,
    )
  ) {
    throw new AppError(
      "Item not found in cart",
      404,
      "CART_ITEM_NOT_FOUND",
    );
  }

  await pullCartItem(
    cart._id,
    productId,
  );

  return getCart(userId);
};

export const clearCart = async (
  userId: string,
): Promise<CartResponse> => {
  const cart =
    (await findCartByUserId(userId)) ??
    (await createEmptyCart(userId));

  await clearCartItems(cart._id);

  return getCart(userId);
};
