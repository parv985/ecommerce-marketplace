import { User, type UserDocument } from "../../models/User.js";
import {
  Seller,
  type ISeller,
} from "../../models/Seller.js";
import {
  Product,
  type IProduct,
} from "../../models/Product.js";
import {
  Order,
  type IOrder,
} from "../../models/Order.js";
import {
  AuditLog,
  type IAuditLog,
} from "../../models/AuditLog.js";

export const listUsers = async (
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: UserDocument[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    User.countDocuments(filter).exec(),
  ]);

  return { items, total };
};

export const findUserById = async (
  id: string,
): Promise<UserDocument | null> => {
  return User.findById(id).exec();
};

export const updateUserById = async (
  id: string,
  data: Record<string, unknown>,
): Promise<UserDocument | null> => {
  return User.findByIdAndUpdate(
    id,
    {
      $set: data,
    },
    {
      new: true,
    },
  ).exec();
};

export const listSellers = async (
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: ISeller[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    Seller.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Seller.countDocuments(filter).exec(),
  ]);

  return { items, total };
};

export const findSellerById = async (
  id: string,
): Promise<ISeller | null> => {
  return Seller.findById(id).exec();
};

export const updateSellerById = async (
  id: string,
  data: Record<string, unknown>,
): Promise<ISeller | null> => {
  return Seller.findByIdAndUpdate(
    id,
    {
      $set: data,
    },
    {
      new: true,
    },
  ).exec();
};

export const listAllProducts = async (
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: IProduct[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Product.countDocuments(filter).exec(),
  ]);

  return { items, total };
};

export const updateProductStatusById = async (
  id: string,
  status: string,
): Promise<IProduct | null> => {
  return Product.findByIdAndUpdate(
    id,
    {
      $set: { status },
    },
    {
      new: true,
    },
  ).exec();
};

export const listAllOrders = async (
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: IOrder[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Order.countDocuments(filter).exec(),
  ]);

  return { items, total };
};

/*
 * Audit log listing for the Super Admin console. The ledger is
 * append-only, so this is a pure read: filter + sort + paginate.
 * Sorted reads are backed by the { actorId: 1, createdAt: -1 } and
 * single-field indexes declared on the AuditLog model.
 */
export const listAuditLogs = async (
  filter: Record<string, unknown>,
  sort: Record<string, 1 | -1>,
  page: number,
  limit: number,
): Promise<{
  items: IAuditLog[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    AuditLog.countDocuments(filter).exec(),
  ]);

  return { items, total };
};
