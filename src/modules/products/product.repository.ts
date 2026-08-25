import {
  Product,
  type IProduct,
} from "../../models/Product.js";
import { Category } from "../../models/Category.js";
import { ProductStatus } from "../../constants/productStatus.js";

export const createProduct = async (
  data: Record<string, unknown>,
): Promise<IProduct> => {
  return Product.create(data);
};

export const findProductById = async (
  id: string,
): Promise<IProduct | null> => {
  return Product.findById(id).exec();
};

/*
 * Ownership-scoped lookup: returns the product only when it
 * belongs to the given seller. Used by all seller write APIs
 * so that a seller can never touch another seller's product
 * (prevents IDOR-style access).
 */
export const findProductByIdAndSeller = async (
  id: string,
  sellerId: string,
): Promise<IProduct | null> => {
  return Product.findOne({
    _id: id,
    sellerId,
  }).exec();
};

export const findProductsBySeller = async (
  sellerId: string,
): Promise<IProduct[]> => {
  return Product.find({ sellerId })
    .sort({ createdAt: -1 })
    .exec();
};

export const updateProductById = async (
  id: string,
  data: Record<string, unknown>,
): Promise<IProduct | null> => {
  return Product.findByIdAndUpdate(
    id,
    {
      $set: data,
    },
    {
      new: true,
    },
  ).exec();
};

export const listProducts = async (
  filter: Record<string, unknown>,
  sort: Record<string, 1 | -1>,
  page: number,
  limit: number,
): Promise<{
  items: IProduct[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Product.countDocuments(filter).exec(),
  ]);

  return { items, total };
};

/*
 * Returns true when the category exists and is active.
 * Used to validate category references on products.
 */
export const findActiveCategoryById = async (
  id: string,
): Promise<boolean> => {
  const count = await Category.countDocuments({
    _id: id,
    isActive: true,
  }).exec();

  return count > 0;
};

/*
 * Batch lookup of ACTIVE products by ids. Used by the cart to
 * resolve live authoritative prices and stock.
 */
export const findActiveProductsByIds = async (
  ids: string[],
): Promise<IProduct[]> => {
  return Product.find({
    _id: { $in: ids },
    status: ProductStatus.ACTIVE,
  }).exec();
};

/*
 * Atomic stock decrement guarded by a $gte filter: the update only
 * applies when enough stock remains, so concurrent checkouts can
 * never drive stock negative or oversell a product.
 * Returns true when the decrement applied.
 */
export const decrementProductStock = async (
  productId: string,
  quantity: number,
): Promise<boolean> => {
  const result = await Product.updateOne(
    {
      _id: productId,
      status: ProductStatus.ACTIVE,
      stock: { $gte: quantity },
    },
    {
      $inc: { stock: -quantity },
    },
  ).exec();

  return result.modifiedCount > 0;
};

/*
 * Restores stock after a failed checkout or an order cancellation.
 */
export const incrementProductStock = async (
  productId: string,
  quantity: number,
): Promise<void> => {
  await Product.updateOne(
    { _id: productId },
    {
      $inc: { stock: quantity },
    },
  ).exec();
};

/*
 * Returns how many of the given product ids are owned by the seller.
 * Used to validate coupon product restrictions (ownership check).
 */
export const countProductsOwnedBySeller = async (
  ids: string[],
  sellerId: string,
): Promise<number> => {
  return Product.countDocuments({
    _id: { $in: ids },
    sellerId,
  }).exec();
};

export const findCategoryNames = async (
  ids: string[],
): Promise<Map<string, string>> => {
  const categories = await Category.find({
    _id: { $in: ids },
  })
    .select("_id name")
    .exec();

  const map = new Map<string, string>();

  for (const category of categories) {
    map.set(
      category._id.toString(),
      category.name,
    );
  }

  return map;
};
