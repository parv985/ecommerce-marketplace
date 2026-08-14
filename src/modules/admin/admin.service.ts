import { AppError } from "../../errors/AppError.js";
import type { UserDocument } from "../../models/User.js";
import type { ISeller } from "../../models/Seller.js";
import type { IProduct } from "../../models/Product.js";
import type { IOrder } from "../../models/Order.js";
import {
  findSellerById,
  findUserById,
  listAllOrders,
  listAllProducts,
  listSellers,
  listUsers,
  updateProductStatusById,
  updateSellerById,
  updateUserById,
} from "./admin.repository.js";
import {
  listAdminOrdersQuerySchema,
  listAdminProductsQuerySchema,
  listSellersQuerySchema,
  listUsersQuerySchema,
  updateProductStatusSchema,
  updateSellerStatusSchema,
  updateUserStatusSchema,
  type ListAdminOrdersQuery,
  type ListAdminProductsQuery,
  type ListSellersQuery,
  type ListUsersQuery,
  type UpdateProductStatusInput,
  type UpdateSellerStatusInput,
  type UpdateUserStatusInput,
} from "./admin.schema.js";
import type {
  AdminListResponse,
  AdminOrderResponse,
  AdminProductResponse,
  AdminSellerResponse,
  AdminUserResponse,
} from "./admin.types.js";

const toAdminUserResponse = (
  user: UserDocument,
): AdminUserResponse => {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    authProvider: user.authProvider ?? "LOCAL",
    isEmailVerified: user.isEmailVerified,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
};

const toAdminSellerResponse = (
  seller: ISeller,
): AdminSellerResponse => {
  return {
    id: seller._id.toString(),
    userId: seller.userId.toString(),
    businessName: seller.businessName,
    phone: seller.phone ?? null,
    gstin: seller.gstin,
    pan: seller.pan,
    status: seller.status,
    statusReason: seller.statusReason ?? null,
    createdAt: seller.createdAt,
  };
};

const toAdminProductResponse = (
  product: IProduct,
): AdminProductResponse => {
  return {
    id: product._id.toString(),
    sellerId: product.sellerId.toString(),
    name: product.name,
    price: product.price,
    stock: product.stock,
    status: product.status,
    createdAt: product.createdAt,
  };
};

const toAdminOrderResponse = (
  order: IOrder,
): AdminOrderResponse => {
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    userId: order.userId.toString(),
    sellerId: order.sellerId.toString(),
    itemCount: order.items.length,
    total: order.total,
    paymentStatus: order.paymentStatus,
    status: order.status,
    createdAt: order.createdAt,
  };
};

export const getUsersList = async (
  query: unknown,
): Promise<AdminListResponse<AdminUserResponse>> => {
  const parsed: ListUsersQuery =
    listUsersQuerySchema.parse(query);

  const filter: Record<string, unknown> = {};

  if (parsed.role) {
    filter.role = parsed.role;
  }

  const { items, total } = await listUsers(
    filter,
    parsed.page,
    parsed.limit,
  );

  return {
    items: items.map(toAdminUserResponse),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

export const setUserActiveStatus = async (
  userId: string,
  input: unknown,
): Promise<AdminUserResponse> => {
  const data: UpdateUserStatusInput =
    updateUserStatusSchema.parse(input);

  const user = await findUserById(userId);

  if (!user) {
    throw new AppError(
      "User not found",
      404,
      "USER_NOT_FOUND",
    );
  }

  const updated = await updateUserById(
    userId,
    { isActive: data.isActive },
  );

  if (!updated) {
    throw new AppError(
      "User not found",
      404,
      "USER_NOT_FOUND",
    );
  }

  return toAdminUserResponse(updated);
};

export const getSellersList = async (
  query: unknown,
): Promise<AdminListResponse<AdminSellerResponse>> => {
  const parsed: ListSellersQuery =
    listSellersQuerySchema.parse(query);

  const filter: Record<string, unknown> = {};

  if (parsed.status) {
    filter.status = parsed.status;
  }

  const { items, total } = await listSellers(
    filter,
    parsed.page,
    parsed.limit,
  );

  return {
    items: items.map(toAdminSellerResponse),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

export const setSellerStatus = async (
  sellerId: string,
  input: unknown,
): Promise<AdminSellerResponse> => {
  const data: UpdateSellerStatusInput =
    updateSellerStatusSchema.parse(input);

  const seller = await findSellerById(sellerId);

  if (!seller) {
    throw new AppError(
      "Seller not found",
      404,
      "SELLER_NOT_FOUND",
    );
  }

  const updated = await updateSellerById(
    sellerId,
    {
      status: data.status,
      statusReason: data.reason ?? null,
    },
  );

  if (!updated) {
    throw new AppError(
      "Seller not found",
      404,
      "SELLER_NOT_FOUND",
    );
  }

  return toAdminSellerResponse(updated);
};

export const getAdminProductsList = async (
  query: unknown,
): Promise<AdminListResponse<AdminProductResponse>> => {
  const parsed: ListAdminProductsQuery =
    listAdminProductsQuerySchema.parse(query);

  const filter: Record<string, unknown> = {};

  if (parsed.status) {
    filter.status = parsed.status;
  }

  const { items, total } = await listAllProducts(
    filter,
    parsed.page,
    parsed.limit,
  );

  return {
    items: items.map(toAdminProductResponse),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

export const setProductStatus = async (
  productId: string,
  input: unknown,
): Promise<AdminProductResponse> => {
  const data: UpdateProductStatusInput =
    updateProductStatusSchema.parse(input);

  const updated = await updateProductStatusById(
    productId,
    data.status,
  );

  if (!updated) {
    throw new AppError(
      "Product not found",
      404,
      "PRODUCT_NOT_FOUND",
    );
  }

  return toAdminProductResponse(updated);
};

export const getAdminOrdersList = async (
  query: unknown,
): Promise<AdminListResponse<AdminOrderResponse>> => {
  const parsed: ListAdminOrdersQuery =
    listAdminOrdersQuerySchema.parse(query);

  const filter: Record<string, unknown> = {};

  if (parsed.status) {
    filter.status = parsed.status;
  }

  const { items, total } = await listAllOrders(
    filter,
    parsed.page,
    parsed.limit,
  );

  return {
    items: items.map(toAdminOrderResponse),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};
