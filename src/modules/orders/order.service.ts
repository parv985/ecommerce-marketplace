import type { Types } from "mongoose";

import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "../../constants/orderStatus.js";
import { UserRole } from "../../constants/roles.js";
import { AppError } from "../../errors/AppError.js";
import type { IOrder } from "../../models/Order.js";
import type { IProduct } from "../../models/Product.js";
import type { ICart } from "../../models/Cart.js";
import { findAddressByIdAndUser } from "../users/user.repository.js";
import {
  claimCartForCheckout,
  clearCartItems,
  findCartByUserId,
  releaseCartCheckoutLock,
} from "../cart/cart.repository.js";
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
  resetOrderCoupon,
  updateOrderPaymentStatusById,
  updateOrderStatusById,
} from "./order.repository.js";
import {
  resolveDiscountsForProducts,
  roundMoney,
} from "../discounts/discount.pricing.js";
import {
  assertCouponNotExpiredOrExhausted,
  evaluateCouponForOrder,
  recordCouponUsage,
  releaseCouponSlotOnly,
  reserveCouponSlot,
} from "../coupons/coupon.service.js";
import {
  notifyOrderStatusChange,
  notifyPaymentReceived,
} from "../notifications/notification.service.js";
import { refundPaidOrderInternal } from "../payments/payment.service.js";
import { logAudit } from "../../services/audit.service.js";
import { InventoryTransactionType } from "../../models/InventoryTransaction.js";
import { recordStockChange } from "../inventory/inventory.service.js";
import { recordOrderTimeline, getOrderTimeline } from "./orderTimeline.service.js";
import {
  findCouponByCode,
  releaseCouponUsage,
} from "../coupons/coupon.repository.js";
import {
  createOrderSchema,
  listOrdersQuerySchema,
  previewOrderSchema,
  updateOrderStatusSchema,
  type CreateOrderInput,
  type ListOrdersQuery,
  type PreviewOrderInput,
  type UpdateOrderStatusInput,
} from "./order.schema.js";
import type {
  CheckoutPreviewResponse,
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
  /*
   * RETURNED is terminal and unreachable through this endpoint: only
   * the return flow (approve a return) may close an order this way,
   * because that is what issues the refund and the rollbacks.
   */
  [OrderStatus.RETURNED]: [],
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
      discountAmount: item.discountAmount,
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
    discountTotal: order.discountTotal,
    couponId: order.couponId
      ? order.couponId.toString()
      : null,
    couponCode: order.couponCode ?? null,
    couponDiscount: order.couponDiscount,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    paymentId: order.paymentId
      ? order.paymentId.toString()
      : null,
    status: order.status,
    deliveredAt: order.deliveredAt ?? null,
    returnedAt: order.returnedAt ?? null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

/* ---------------------------------------------------------------------
 * Checkout computation shared by order creation and the no-side-effect
 * checkout preview (POST /orders/preview).
 *
 * Both paths MUST agree exactly on the money:
 *  - prices come from the database, never from the client;
 *  - live sales discounts are resolved once through the shared pricing
 *    service (product discount beats category discount, highest
 *    percentage wins, never stacked);
 *  - cart lines are grouped per seller (one order per seller);
 *  - an optional coupon is applied AFTER the sales discount, only to the
 *    order of the seller that owns the coupon.
 * ---------------------------------------------------------------------
 */

interface SellerOrderDraftItem {
  productId: Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  discountAmount: number;
  categoryId?: string | null;
}

interface SellerOrderDraft {
  items: SellerOrderDraftItem[];
  itemsTotal: number;
  discountTotal: number;
}

interface CheckoutCouponPlan {
  couponId: string;
  couponCode: string;
  discountAmount: number;
  sellerId: string;
}

/**
 * Builds the per-seller order drafts (with live sales discounts) and the
 * coupon plan for a cart. Pure computation - performs no writes, claims
 * no coupon usage slots and decrements no stock. Throws the same
 * errors as checkout for unavailable products, insufficient stock or an
 * unusable coupon.
 */
const buildCheckoutPlan = async (
  cart: ICart,
  couponCode: string | null | undefined,
  userId: string,
): Promise<{
  productMap: Map<string, IProduct>;
  orderDrafts: Map<string, SellerOrderDraft>;
  couponPlan: CheckoutCouponPlan | null;
}> => {
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
   * Validate every line before anything else so a partially unavailable
   * cart fails fast with a clear message.
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

  const discountMap =
    await resolveDiscountsForProducts(
      cart.items.map((item) => {
        const product = productMap.get(
          item.productId.toString(),
        )!;

        return {
          id: product._id.toString(),
          categoryId: product.category
            ? product.category.toString()
            : null,
          price: product.price,
        };
      }),
    );

  /*
   * Group cart lines by seller so each order belongs to exactly one
   * seller (a marketplace checkout can produce several orders).
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

    const lines = bySeller.get(sellerId) ?? [];

    lines.push({
      product,
      quantity: item.quantity,
    });

    bySeller.set(sellerId, lines);
  }

  const orderDrafts = new Map<
    string,
    SellerOrderDraft
  >();

  for (const [sellerId, lines] of bySeller) {
    const items = lines.map(
      (line): SellerOrderDraftItem => {
        const discount = discountMap.get(
          line.product._id.toString(),
        );

        const subtotal = roundMoney(
          line.product.price * line.quantity,
        );

        const discountAmount = discount
          ? roundMoney(
              discount.discountAmount *
                line.quantity,
            )
          : 0;

        return {
          productId: line.product._id,
          name: line.product.name,
          price: line.product.price,
          quantity: line.quantity,
          subtotal,
          discountAmount,
          categoryId: line.product.category
            ? line.product.category.toString()
            : null,
        };
      },
    );

    const itemsTotal = items.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );

    const discountTotal = items.reduce(
      (sum, item) => sum + item.discountAmount,
      0,
    );

    orderDrafts.set(sellerId, {
      items,
      itemsTotal,
      discountTotal,
    });
  }

  /*
   * Coupon evaluation (no side effects - the usage slot is reserved by
   * the caller only when an actual order is about to be persisted). The
   * code must belong to one of the sellers in the cart; it applies to
   * that seller's order AFTER the sales discount.
   */
  let couponPlan: CheckoutCouponPlan | null =
    null;

  if (couponCode) {
    const coupon =
      await findCouponByCode(couponCode);

    if (!coupon) {
      throw new AppError(
        "Coupon is not valid for the items in your cart",
        400,
        "COUPON_NOT_APPLICABLE",
      );
    }

    /*
     * An expired or fully-used coupon reports its real state BEFORE
     * the applicability check, so the buyer always gets
     * "Coupon code expired" instead of a generic error.
     */
    assertCouponNotExpiredOrExhausted(coupon);

    if (
      !bySeller.has(
        coupon.sellerId.toString(),
      )
    ) {
      throw new AppError(
        "Coupon is not valid for the items in your cart",
        400,
        "COUPON_NOT_APPLICABLE",
      );
    }

    const couponSellerId =
      coupon.sellerId.toString();
    const draft = orderDrafts.get(
      couponSellerId,
    )!;

    const evaluation =
      await evaluateCouponForOrder({
        code: couponCode,
        userId,
        itemsTotal: draft.itemsTotal,
        discountTotal: draft.discountTotal,
        items: draft.items.map((item) => ({
          productId:
            item.productId.toString(),
          categoryId:
            item.categoryId ?? null,
        })),
      });

    couponPlan = {
      couponId: evaluation.coupon._id.toString(),
      couponCode,
      discountAmount: evaluation.discountAmount,
      sellerId: evaluation.sellerId,
    };
  }

  return {
    productMap,
    orderDrafts,
    couponPlan,
  };
};

export const createOrderFromCart = async (
  user: { id: string; role: UserRole },
  input: unknown,
): Promise<OrderResponse[]> => {
  const userId = user.id;
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

  /*
   * Claim the cart before any side effects. A double-submit (two
   * concurrent checkouts) can never create duplicate orders: the
   * second request fails the atomic claim and is rejected. The lock
   * is released on any failure below and cleared with the items on
   * success. Stale claims (crashed process) expire after 5 minutes.
   */
  const claimed = await claimCartForCheckout(
    cart._id,
  );

  if (!claimed) {
    throw new AppError(
      "Checkout is already in progress for your cart",
      409,
      "CART_CHECKOUT_IN_PROGRESS",
    );
  }

  let created: IOrder[] = [];

  try {
    const { productMap, orderDrafts, couponPlan } =
      await buildCheckoutPlan(
        cart,
        data.couponCode,
        userId,
      );

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
        const product = productMap.get(
          item.productId.toString(),
        )!;

        const previousStock = product.stock;

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

        await recordStockChange({
          productId: item.productId.toString(),
          sellerId: product.sellerId.toString(),
          type: InventoryTransactionType.STOCK_DECREMENT,
          quantity: -item.quantity,
          previousStock,
          actorId: user.id,
          actorRole: user.role,
          reason: "Order placed",
        });

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
     * Reserve the coupon usage slot atomically before persisting the
     * order so an exhausted coupon can never be applied. Reservation
     * happens only after every stock decrement succeeded.
     */
    let reservedPerUserLimit: number | null = null;

    if (couponPlan) {
      const claimed = await reserveCouponSlot(
        couponPlan.couponId,
      );

      reservedPerUserLimit =
        claimed.perUserLimit ?? null;
    }

    const ordersToCreate: Array<
      Record<string, unknown>
    > = [];

    for (const [sellerId, draft] of orderDrafts) {
      const isCouponOrder =
        couponPlan !== null &&
        couponPlan.sellerId === sellerId;

      const couponDiscount = isCouponOrder
        ? couponPlan!.discountAmount
        : 0;

      const total = roundMoney(
        draft.itemsTotal -
          draft.discountTotal -
          couponDiscount,
      );

      ordersToCreate.push({
        orderNumber: generateOrderNumber(),
        userId,
        sellerId,
        items: draft.items.map(
          ({ categoryId: _categoryId, ...item }) =>
            item,
        ),
        shippingAddress:
          toAddressSnapshot(address),
        itemsTotal: draft.itemsTotal,
        discountTotal: draft.discountTotal,
        couponId: isCouponOrder
          ? couponPlan!.couponId
          : null,
        couponCode: isCouponOrder
          ? couponPlan!.couponCode
          : null,
        couponDiscount,
        total,
        paymentMethod:
          data.paymentMethod ??
          PaymentMethod.CASH_ON_DELIVERY,
        paymentStatus: PaymentStatus.PENDING,
        status: OrderStatus.PENDING,
      });
    }

    try {
      created = await createOrders(ordersToCreate);
    } catch (error) {
      if (couponPlan) {
        await releaseCouponSlotOnly(
          couponPlan.couponId,
        );
      }

      throw error;
    }

  /*
   * Record the coupon usage against the created order. If recording
   * fails (rare concurrent per-user duplicate), the reserved slot is
   * released and the order's coupon fields are reset so no discount is
   * leaked without a usage record.
   */
  if (couponPlan) {
    const couponOrder = created.find(
      (order) =>
        order.sellerId.toString() ===
        couponPlan!.sellerId,
    );

    if (couponOrder) {
      try {
        await recordCouponUsage({
          couponId: couponPlan.couponId,
          userId,
          orderId: couponOrder._id.toString(),
          discountAmount:
            couponPlan.discountAmount,
          perUserLimit:
            reservedPerUserLimit,
        });
      } catch (error) {
        await resetOrderCoupon(
          couponOrder._id.toString(),
        );
        throw error;
      }
    }
  }

  await clearCartItems(cart._id);
  } catch (error) {
    /*
     * Release the checkout claim so the buyer can fix whatever went
     * wrong and retry - a failed checkout must never leave the cart
     * permanently locked.
     */
    await releaseCartCheckoutLock(cart._id);
    throw error;
  }

  for (const order of created) {
    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "ORDER_CREATED",
      entityType: "ORDER",
      entityId: order._id.toString(),
      metadata: {
        orderNumber: order.orderNumber,
        total: order.total,
      },
    });
  }

  return Promise.all(
    created.map((order) =>
      toOrderResponse(order),
    ),
  );
};

/*
 * No-side-effect checkout preview. Validates the buyer's cart and (when
 * supplied) a coupon code, and returns the exact totals that would be
 * charged when the order is placed - subtotal, product/category sales
 * discounts, coupon discount and final payable. Used by the checkout
 * page to show real discount amounts before the order is submitted.
 */
export const previewCheckoutFromCart = async (
  user: { id: string; role: UserRole },
  input: unknown,
): Promise<CheckoutPreviewResponse> => {
  const userId = user.id;
  const data: PreviewOrderInput =
    previewOrderSchema.parse(input);

  const cart = await findCartByUserId(userId);

  if (!cart || cart.items.length === 0) {
    throw new AppError(
      "Cart is empty",
      400,
      "EMPTY_CART",
    );
  }

  const { orderDrafts, couponPlan } =
    await buildCheckoutPlan(
      cart,
      data.couponCode,
      userId,
    );

  const orders = Array.from(
    orderDrafts.entries(),
  ).map(([sellerId, draft]) => {
    const isCouponOrder =
      couponPlan !== null &&
      couponPlan.sellerId === sellerId;

    const couponDiscount = isCouponOrder
      ? couponPlan!.discountAmount
      : 0;

    return {
      sellerId,
      itemsTotal: draft.itemsTotal,
      discountTotal: draft.discountTotal,
      couponDiscount,
      total: roundMoney(
        draft.itemsTotal -
          draft.discountTotal -
          couponDiscount,
      ),
    };
  });

  return {
    itemsTotal: orders.reduce(
      (sum, order) => sum + order.itemsTotal,
      0,
    ),
    discountTotal: orders.reduce(
      (sum, order) => sum + order.discountTotal,
      0,
    ),
    couponCode: couponPlan
      ? couponPlan.couponCode
      : null,
    couponDiscount: orders.reduce(
      (sum, order) => sum + order.couponDiscount,
      0,
    ),
    total: orders.reduce(
      (sum, order) => sum + order.total,
      0,
    ),
    orders,
  };
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
   * stock back to the seller's inventory and releases any coupon
   * usage so cancelled orders never consume coupons. A paid online
   * order is refunded first; if the gateway rejects the refund the
   * cancellation aborts so money and state never diverge.
   */
  if (data.status === OrderStatus.CANCELLED) {
    if (
      order.paymentMethod === PaymentMethod.ONLINE &&
      order.paymentStatus === PaymentStatus.PAID
    ) {
      await refundPaidOrderInternal(order, user);
    }

    for (const item of order.items) {
      await incrementProductStock(
        item.productId.toString(),
        item.quantity,
      );
    }

    await releaseCouponUsage(orderId);
  }

  /*
   * Cash-on-delivery orders are settled in cash at the doorstep: the
   * moment the order is marked DELIVERED the payment has been
   * collected, so the same atomic update flips the payment status to
   * PAID. The database can never hold DELIVERED + PENDING for a COD
   * order. Online (Razorpay) payments are untouched — they settle
   * through the payment gateway verification flow.
   */
  const codPaidOnDelivery =
    data.status === OrderStatus.DELIVERED &&
    order.paymentMethod ===
      PaymentMethod.CASH_ON_DELIVERY &&
    order.paymentStatus !== PaymentStatus.PAID;

  const updated = await updateOrderStatusById(
    orderId,
    data.status,
    data.status === OrderStatus.DELIVERED
      ? new Date()
      : undefined,
    codPaidOnDelivery
      ? PaymentStatus.PAID
      : undefined,
  );

  if (!updated) {
    throw new AppError(
      "Order not found",
      404,
      "ORDER_NOT_FOUND",
    );
  }

  await recordOrderTimeline({
    orderId,
    status: updated.status,
    actorId: user.id,
    actorRole: user.role,
  });

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "ORDER_STATUS_CHANGED",
    entityType: "ORDER",
    entityId: orderId,
    before: { status: order.status },
    after: {
      status: updated.status,
      ...(codPaidOnDelivery && {
        paymentStatus: updated.paymentStatus,
      }),
    },
  });

  await notifyOrderStatusChange(
    updated,
    updated.status,
  );

  if (codPaidOnDelivery) {
    await notifyPaymentReceived(updated);
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

  /*
   * Paid online orders are refunded as part of cancellation so a
   * buyer never loses money by cancelling (see updateOrderStatus).
   */
  if (
    order.paymentMethod === PaymentMethod.ONLINE &&
    order.paymentStatus === PaymentStatus.PAID
  ) {
    await refundPaidOrderInternal(order, user);
  }

  for (const item of order.items) {
    await incrementProductStock(
      item.productId.toString(),
      item.quantity,
    );
  }

  await releaseCouponUsage(orderId);

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

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "ORDER_CANCELLED",
    entityType: "ORDER",
    entityId: orderId,
    before: { status: order.status },
    after: { status: updated.status },
  });

  await notifyOrderStatusChange(
    updated,
    updated.status,
  );

  return toOrderResponse(updated);
};

/*
 * ---------------------------------------------------------------------
 * Invoice generation
 * ---------------------------------------------------------------------
 */

export interface InvoiceItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  discountAmount: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  orderNumber: string;
  orderId: string;
  orderDate: Date;
  buyer: {
    name: string;
    email: string;
  };
  seller: {
    businessName: string;
    gstin: string;
    pan: string;
    address: {
      addressLine1: string;
      addressLine2: string | null;
      city: string;
      state: string;
      pincode: string;
    };
  };
  items: InvoiceItem[];
  shippingAddress: {
    recipientName: string;
    phone: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    pincode: string;
  };
  itemsTotal: number;
  discountTotal: number;
  couponDiscount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  deliveredAt: Date | null;
  createdAt: Date;
}

const generateInvoiceNumber = (): string => {
  const suffix = Math.floor(Math.random() * 10000);
  return `INV-${Date.now()}-${suffix}`;
};

export const generateOrderInvoice = async (
  user: { id: string; role: UserRole },
  orderId: string,
): Promise<InvoiceData> => {
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

  /* Resolve buyer and seller details */
  const buyer = await import("../../models/User.js").then(m => m.User.findById(order.userId).select("name email").exec());
  const seller = await import("../../models/Seller.js").then(m => m.Seller.findOne({ userId: order.sellerId }).exec());

  if (!buyer || !seller) {
    throw new AppError(
      "Could not resolve buyer or seller details",
      500,
      "INTERNAL_ERROR",
    );
  }

  /*
   * GST calculation: 18% GST is applied to the pre-discount subtotal
   * for invoice purposes. This is a display-only calculation and does
   * not affect the order total stored in the database.
   */
  const taxRate = 0.18;
  const preDiscountTotal = order.itemsTotal;
  const taxAmount = roundMoney(preDiscountTotal * taxRate);

  return {
    invoiceNumber: generateInvoiceNumber(),
    orderNumber: order.orderNumber,
    orderId: order._id.toString(),
    orderDate: order.createdAt,
    buyer: {
      name: buyer.name,
      email: buyer.email,
    },
    seller: {
      businessName: seller.businessName,
      gstin: seller.gstin,
      pan: seller.pan,
      address: {
        addressLine1: seller.addressLine1,
        addressLine2: seller.addressLine2 ?? null,
        city: seller.city,
        state: seller.state,
        pincode: seller.pincode,
      },
    },
    items: order.items.map((item) => ({
      productId: item.productId.toString(),
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
      discountAmount: item.discountAmount,
    })),
    shippingAddress: {
      recipientName: order.shippingAddress.recipientName,
      phone: order.shippingAddress.phone,
      addressLine1: order.shippingAddress.addressLine1,
      addressLine2: order.shippingAddress.addressLine2 ?? null,
      city: order.shippingAddress.city,
      state: order.shippingAddress.state,
      pincode: order.shippingAddress.pincode,
    },
    itemsTotal: order.itemsTotal,
    discountTotal: order.discountTotal,
    couponDiscount: order.couponDiscount,
    taxRate: taxRate * 100,
    taxAmount,
    total: roundMoney(order.total + taxAmount),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    deliveredAt: order.deliveredAt ?? null,
    createdAt: order.createdAt,
  };
};

/*
 * Cash-on-delivery payment marker. Only the seller of the order or
 * an admin may mark payment as received, and only after delivery.
 * The client can never set payment status directly.
 */
export const getOrderTracking = async (
  user: { id: string; role: UserRole },
  orderId: string,
): Promise<{
  orderNumber: string;
  status: OrderStatus;
  timeline: Array<{
    status: OrderStatus;
    actorId: string;
    actorRole: string;
    reason: string | null;
    createdAt: Date;
  }>;  createdAt: Date;
  deliveredAt: Date | null;
}> => {
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

  const timeline = await getOrderTimeline(orderId);

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    timeline,
    createdAt: order.createdAt,
    deliveredAt: order.deliveredAt ?? null,
  };
};

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

  if (order.paymentMethod === PaymentMethod.ONLINE) {
    throw new AppError(
      "Online payments are settled through the payment gateway",
      400,
      "PAYMENT_METHOD_NOT_ONLINE",
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

  await notifyPaymentReceived(updated);

  return toOrderResponse(updated);
};
