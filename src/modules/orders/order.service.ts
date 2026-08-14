import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "../../constants/orderStatus.js";
import { UserRole } from "../../constants/roles.js";
import { AppError } from "../../errors/AppError.js";
import type { IOrder } from "../../models/Order.js";
import type { IProduct } from "../../models/Product.js";
import { findAddressByIdAndUser } from "../users/user.repository.js";
import { clearCartItems, findCartByUserId } from "../cart/cart.repository.js";
import {
  decrementProductStock,
  findActiveProductsByIds,
  incrementProductStock,
} from "../products/product.repository.js";
import {
  createOrders,
  findOrderById,
  findSellerBusinessNames,
  listOrdersBySeller,
  listOrdersByUser,
  updateOrderPaymentStatusById,
  updateOrderStatusById,
} from "./order.repository.js";
import {
  createOrderSchema,
  listOrdersQuerySchema,
  updateOrderStatusSchema,
  type CreateOrderInput,
  type ListOrdersQuery,
  type UpdateOrderStatusInput,
} from "./order.schema.js";
import type {
  OrderResponse,
  PaginatedOrders,
} from "./order.types.js";

/*
 * Allowed status transitions. Anything not listed here is rejected,
 * so an order can never jump backwards (e.g. DELIVERED -> PENDING).
 */
const TRANSITIONS: Record<
  OrderStatus,
  OrderStatus[]
> = {
  [OrderStatus.PENDING]: [
    OrderStatus.CONFIRMED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.CONFIRMED]: [
    OrderStatus.SHIPPED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.SHIPPED]: [
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

const canManageOrder = (
  user: { id: string; role: UserRole },
  order: IOrder,
): boolean => {
  if (user.role === UserRole.SUPER_ADMIN) {
    return true;
  }

  if (
    user.role === UserRole.SELLER &&
    order.sellerId.toString() === user.id
  ) {
    return true;
  }

  return (
    user.role === UserRole.BUYER &&
    order.userId.toString() === user.id
  );
};

const canUpdateStatus = (
  user: { id: string; role: UserRole },
  order: IOrder,
): boolean => {
  if (user.role === UserRole.SUPER_ADMIN) {
    return true;
  }

  return (
    user.role === UserRole.SELLER &&
    order.sellerId.toString() === user.id
  );
};

const generateOrderNumber = (): string => {
  const suffix = Math.floor(
    Math.random() * 10000,
  );
  return `ORD-${Date.now()}-${suffix}`;
};

const toAddressSnapshot = (
  address: {
    recipientName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
  },
) => {
  return {
    recipientName: address.recipientName,
    phone: address.phone,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 ?? "",
    city: address.city,
    state: address.state,
    pincode: address.pincode,
  };
};

const toOrderResponse = async (
  order: IOrder,
  names?: Map<string, string>,
): Promise<OrderResponse> => {
  const nameMap =
    names ??
    (await findSellerBusinessNames([
      order.sellerId.toString(),
    ]));

  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    userId: order.userId.toString(),
    sellerId: order.sellerId.toString(),
    sellerBusinessName:
      nameMap.get(
        order.sellerId.toString(),
      ) ?? null,
    items: order.items.map((item) => ({
      productId: item.productId.toString(),
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
    shippingAddress: {
      recipientName:
        order.shippingAddress.recipientName,
      phone: order.shippingAddress.phone,
      addressLine1:
        order.shippingAddress.addressLine1,
      addressLine2:
        order.shippingAddress.addressLine2 ??
        null,
      city: order.shippingAddress.city,
      state: order.shippingAddress.state,
      pincode: order.shippingAddress.pincode,
    },
    itemsTotal: order.itemsTotal,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

export const createOrderFromCart = async (
  userId: string,
  input: unknown,
): Promise<OrderResponse[]> => {
  const data: CreateOrderInput =
    createOrderSchema.parse(input);

  const address =
    await findAddressByIdAndUser(
      data.shippingAddressId,
      userId,
    );

  if (!address) {
    throw new AppError(
      "Address not found",
      404,
      "ADDRESS_NOT_FOUND",
    );
  }

  const cart = await findCartByUserId(userId);

  if (!cart || cart.items.length === 0) {
    throw new AppError(
      "Cart is empty",
      400,
      "EMPTY_CART",
    );
  }

  const productIds = cart.items.map((item) =>
    item.productId.toString(),
  );

  const products =
    await findActiveProductsByIds(productIds);

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

  /*
   * Validate every line before touching any stock so a partially
   * unavailable cart fails fast with a clear message.
   */
  for (const item of cart.items) {
    const product = productMap.get(
      item.productId.toString(),
    );

    if (!product) {
      throw new AppError(
        "Some products in your cart are no longer available",
        400,
        "PRODUCT_UNAVAILABLE",
      );
    }

    if (item.quantity > product.stock) {
      throw new AppError(
        `Insufficient stock for ${product.name}`,
        400,
        "INSUFFICIENT_STOCK",
      );
    }
  }

  /*
   * Atomic stock decrement with a $gte guard for every line.
   * If any decrement fails (race/oversell), roll back the ones
   * already applied so a failed checkout never leaks inventory.
   */
  const applied: Array<{
    productId: string;
    quantity: number;
  }> = [];

  try {
    for (const item of cart.items) {
      const ok =
        await decrementProductStock(
          item.productId.toString(),
          item.quantity,
        );

      if (!ok) {
        throw new AppError(
          "Insufficient stock for one or more products",
          400,
          "INSUFFICIENT_STOCK",
        );
      }

      applied.push({
        productId: item.productId.toString(),
        quantity: item.quantity,
      });
    }
  } catch (error) {
    for (const entry of applied) {
      await incrementProductStock(
        entry.productId,
        entry.quantity,
      );
    }

    throw error;
  }

  /*
   * Group cart lines by seller so each order belongs to exactly
   * one seller (a marketplace checkout can produce several orders).
   */
  const bySeller = new Map<
    string,
    Array<{
      product: IProduct;
      quantity: number;
    }>
  >();

  for (const item of cart.items) {
    const product = productMap.get(
      item.productId.toString(),
    )!;

    const sellerId =
      product.sellerId.toString();

    const lines =
      bySeller.get(sellerId) ?? [];

    lines.push({
      product,
      quantity: item.quantity,
    });

    bySeller.set(sellerId, lines);
  }

  const ordersToCreate: Array<
    Record<string, unknown>
  > = [];

  for (const [sellerId, lines] of bySeller) {
    const items = lines.map((line) => {
      const subtotal =
        line.product.price * line.quantity;

      return {
        productId: line.product._id,
        name: line.product.name,
        price: line.product.price,
        quantity: line.quantity,
        subtotal,
      };
    });

    const itemsTotal = items.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );

    ordersToCreate.push({
      orderNumber: generateOrderNumber(),
      userId,
      sellerId,
      items,
      shippingAddress:
        toAddressSnapshot(address),
      itemsTotal,
      total: itemsTotal,
      paymentMethod:
        PaymentMethod.CASH_ON_DELIVERY,
      paymentStatus: PaymentStatus.PENDING,
      status: OrderStatus.PENDING,
    });
  }

  const created =
    await createOrders(ordersToCreate);

  await clearCartItems(cart._id);

  return Promise.all(
    created.map((order) =>
      toOrderResponse(order),
    ),
  );
};

export const getOrderDetails = async (
  user: { id: string; role: UserRole },
  orderId: string,
): Promise<OrderResponse> => {
  const order = await findOrderById(orderId);

  if (!order) {
    throw new AppError(
      "Order not found",
      404,
      "ORDER_NOT_FOUND",
    );
  }

  if (!canManageOrder(user, order)) {
    throw new AppError(
      "You do not have permission to view this order",
      403,
      "FORBIDDEN",
    );
  }

  return toOrderResponse(order);
};

export const listMyOrders = async (
  user: { id: string; role: UserRole },
  query: unknown,
): Promise<PaginatedOrders> => {
  const parsed: ListOrdersQuery =
    listOrdersQuerySchema.parse(query);

  const filter: Record<string, unknown> = {};

  if (parsed.status) {
    filter.status = parsed.status;
  }

  const { items, total } =
    user.role === UserRole.SELLER
      ? await listOrdersBySeller(
          user.id,
          filter,
          parsed.page,
          parsed.limit,
        )
      : await listOrdersByUser(
          user.id,
          filter,
          parsed.page,
          parsed.limit,
        );

  /*
   * Resolve seller business names in a single batched query
   * instead of one lookup per order (avoids N+1).
   */
  const sellerIds = Array.from(
    new Set(
      items.map((order) =>
        order.sellerId.toString(),
      ),
    ),
  );

  const names = await findSellerBusinessNames(
    sellerIds,
  );

  const orderResponses = await Promise.all(
    items.map((order) =>
      toOrderResponse(order, names),
    ),
  );

  return {
    items: orderResponses,
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

export const updateOrderStatus = async (
  user: { id: string; role: UserRole },
  orderId: string,
  input: unknown,
): Promise<OrderResponse> => {
  const data: UpdateOrderStatusInput =
    updateOrderStatusSchema.parse(input);

  const order = await findOrderById(orderId);

  if (!order) {
    throw new AppError(
      "Order not found",
      404,
      "ORDER_NOT_FOUND",
    );
  }

  if (!canUpdateStatus(user, order)) {
    throw new AppError(
      "You do not have permission to update this order",
      403,
      "FORBIDDEN",
    );
  }

  if (data.status === order.status) {
    return toOrderResponse(order);
  }

  const allowed = TRANSITIONS[order.status];

  if (!allowed.includes(data.status)) {
    throw new AppError(
      `Cannot transition order from ${order.status} to ${data.status}`,
      400,
      "INVALID_STATUS_TRANSITION",
    );
  }

  /*
   * A cancellation through this endpoint restores the committed
   * stock back to the seller's inventory.
   */
  if (data.status === OrderStatus.CANCELLED) {
    for (const item of order.items) {
      await incrementProductStock(
        item.productId.toString(),
        item.quantity,
      );
    }
  }

  const updated = await updateOrderStatusById(
    orderId,
    data.status,
  );

  if (!updated) {
    throw new AppError(
      "Order not found",
      404,
      "ORDER_NOT_FOUND",
    );
  }

  return toOrderResponse(updated);
};

export const cancelOrder = async (
  user: { id: string; role: UserRole },
  orderId: string,
): Promise<OrderResponse> => {
  const order = await findOrderById(orderId);

  if (!order) {
    throw new AppError(
      "Order not found",
      404,
      "ORDER_NOT_FOUND",
    );
  }

  if (!canManageOrder(user, order)) {
    throw new AppError(
      "You do not have permission to cancel this order",
      403,
      "FORBIDDEN",
    );
  }

  if (order.status === OrderStatus.CANCELLED) {
    return toOrderResponse(order);
  }

  const allowed = TRANSITIONS[order.status];

  if (!allowed.includes(OrderStatus.CANCELLED)) {
    throw new AppError(
      `Order in ${order.status} state cannot be cancelled`,
      400,
      "INVALID_STATUS_TRANSITION",
    );
  }

  for (const item of order.items) {
    await incrementProductStock(
      item.productId.toString(),
      item.quantity,
    );
  }

  const updated = await updateOrderStatusById(
    orderId,
    OrderStatus.CANCELLED,
  );

  if (!updated) {
    throw new AppError(
      "Order not found",
      404,
      "ORDER_NOT_FOUND",
    );
  }

  return toOrderResponse(updated);
};

/*
 * Cash-on-delivery payment marker. Only the seller of the order or
 * an admin may mark payment as received, and only after delivery.
 * The client can never set payment status directly.
 */
export const markOrderPaid = async (
  user: { id: string; role: UserRole },
  orderId: string,
): Promise<OrderResponse> => {
  const order = await findOrderById(orderId);

  if (!order) {
    throw new AppError(
      "Order not found",
      404,
      "ORDER_NOT_FOUND",
    );
  }

  if (!canUpdateStatus(user, order)) {
    throw new AppError(
      "You do not have permission to update this order",
      403,
      "FORBIDDEN",
    );
  }

  if (order.status !== OrderStatus.DELIVERED) {
    throw new AppError(
      "Payment can only be marked as received after delivery",
      400,
      "INVALID_PAYMENT_STATE",
    );
  }

  if (order.paymentStatus === PaymentStatus.PAID) {
    return toOrderResponse(order);
  }

  const updated =
    await updateOrderPaymentStatusById(
      orderId,
      PaymentStatus.PAID,
    );

  if (!updated) {
    throw new AppError(
      "Order not found",
      404,
      "ORDER_NOT_FOUND",
    );
  }

  return toOrderResponse(updated);
};
