import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * COD delivery settles the payment: when an order flips to DELIVERED,
 * a cash-on-delivery order must flip to PAID in the SAME repository
 * update (one atomic write), while online (Razorpay) orders are never
 * touched by the delivery transition. These tests mock the persistence
 * layer, so they run without MongoDB — the integration suite covers
 * the real database round-trip.
 */

/*
 * The service import chain loads the validated env config; supply
 * test-only values before any module evaluates (hoisted above imports).
 */
vi.hoisted(() => {
  process.env.MONGODB_URI =
    "mongodb://localhost:27017/ecommerce_marketplace_unit";
  process.env.JWT_ACCESS_SECRET =
    "unit-test-access-secret-unit-test-access-secret";
  process.env.JWT_REFRESH_SECRET =
    "unit-test-refresh-secret-unit-test-refresh-secret";
  process.env.CLOUDINARY_CLOUD_NAME = "unit-test";
  process.env.CLOUDINARY_API_KEY = "unit-test";
  process.env.CLOUDINARY_API_SECRET = "unit-test";
});

vi.mock(
  "../../src/modules/orders/order.repository.js",
  () => ({
    createOrders: vi.fn(),
    findOrderById: vi.fn(),
    findSellerBusinessNames: vi.fn(
      async () => new Map<string, string>(),
    ),
    listOrdersBySeller: vi.fn(),
    listOrdersByUser: vi.fn(),
    resetOrderCoupon: vi.fn(),
    updateOrderPaymentStatusById: vi.fn(),
    updateOrderStatusById: vi.fn(),
  }),
);

vi.mock(
  "../../src/modules/notifications/notification.service.js",
  () => ({
    notifyOrderStatusChange: vi.fn(async () => {}),
    notifyPaymentReceived: vi.fn(async () => {}),
  }),
);

vi.mock("../../src/services/audit.service.js", () => ({
  logAudit: vi.fn(async () => {}),
}));

vi.mock(
  "../../src/modules/orders/orderTimeline.service.js",
  () => ({
    recordOrderTimeline: vi.fn(async () => {}),
    getOrderTimeline: vi.fn(async () => []),
  }),
);

import { updateOrderStatus } from "../../src/modules/orders/order.service.js";
import {
  findOrderById,
  updateOrderStatusById,
} from "../../src/modules/orders/order.repository.js";
import { notifyPaymentReceived } from "../../src/modules/notifications/notification.service.js";
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "../../src/constants/orderStatus.js";
import { UserRole } from "../../src/constants/roles.js";

const sellerUser = {
  id: "seller-1",
  role: UserRole.SELLER,
};

const makeOrder = (
  overrides: Record<string, unknown> = {},
) => ({
  _id: "order-id-1",
  orderNumber: "ORD-1",
  userId: "buyer-1",
  sellerId: "seller-1",
  items: [
    {
      productId: "prod-1",
      name: "Product",
      price: 100,
      quantity: 1,
      subtotal: 100,
      discountAmount: 0,
    },
  ],
  shippingAddress: {
    recipientName: "Buyer",
    phone: "9999999999",
    addressLine1: "1 Street",
    addressLine2: "",
    city: "City",
    state: "State",
    pincode: "110001",
  },
  itemsTotal: 100,
  discountTotal: 0,
  couponId: null,
  couponCode: null,
  couponDiscount: 0,
  total: 100,
  paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
  paymentStatus: PaymentStatus.PENDING,
  status: OrderStatus.SHIPPED,
  deliveredAt: null,
  returnedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("updateOrderStatus — COD payment status on delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("flips a COD order to PAID in the same atomic update as DELIVERED", async () => {
    const order = makeOrder();

    vi.mocked(findOrderById).mockResolvedValue(
      order as never,
    );
    vi.mocked(updateOrderStatusById).mockImplementation(
      async (_id, status, deliveredAt, paymentStatus) =>
        makeOrder({
          status,
          deliveredAt: deliveredAt ?? null,
          paymentStatus:
            paymentStatus ?? order.paymentStatus,
        }) as never,
    );

    const result = await updateOrderStatus(
      sellerUser,
      "order-id-1",
      { status: OrderStatus.DELIVERED },
    );

    /* One single repository write carries status, deliveredAt and
       paymentStatus together — never two separate updates. */
    expect(updateOrderStatusById).toHaveBeenCalledTimes(1);
    expect(updateOrderStatusById).toHaveBeenCalledWith(
      "order-id-1",
      OrderStatus.DELIVERED,
      expect.any(Date),
      PaymentStatus.PAID,
    );

    expect(result.status).toBe(OrderStatus.DELIVERED);
    expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    expect(notifyPaymentReceived).toHaveBeenCalledTimes(1);
  });

  it("never touches the payment status of an online (Razorpay) order on delivery", async () => {
    const order = makeOrder({
      paymentMethod: PaymentMethod.ONLINE,
      paymentStatus: PaymentStatus.PAID,
      paymentId: "pay_123",
    });

    vi.mocked(findOrderById).mockResolvedValue(
      order as never,
    );
    vi.mocked(updateOrderStatusById).mockImplementation(
      async (_id, status, deliveredAt, paymentStatus) =>
        makeOrder({
          paymentMethod: PaymentMethod.ONLINE,
          status,
          deliveredAt: deliveredAt ?? null,
          paymentStatus:
            paymentStatus ?? order.paymentStatus,
        }) as never,
    );

    const result = await updateOrderStatus(
      sellerUser,
      "order-id-1",
      { status: OrderStatus.DELIVERED },
    );

    expect(updateOrderStatusById).toHaveBeenCalledTimes(1);
    /* The payment-status argument must be absent for online orders. */
    expect(updateOrderStatusById).toHaveBeenCalledWith(
      "order-id-1",
      OrderStatus.DELIVERED,
      expect.any(Date),
      undefined,
    );

    expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    expect(notifyPaymentReceived).not.toHaveBeenCalled();
  });

  it("does not flip the payment status on non-delivery transitions", async () => {
    const order = makeOrder({
      status: OrderStatus.CONFIRMED,
    });

    vi.mocked(findOrderById).mockResolvedValue(
      order as never,
    );
    vi.mocked(updateOrderStatusById).mockImplementation(
      async (_id, status, deliveredAt, paymentStatus) =>
        makeOrder({
          status,
          deliveredAt: deliveredAt ?? null,
          paymentStatus:
            paymentStatus ?? order.paymentStatus,
        }) as never,
    );

    const result = await updateOrderStatus(
      sellerUser,
      "order-id-1",
      { status: OrderStatus.SHIPPED },
    );

    expect(updateOrderStatusById).toHaveBeenCalledWith(
      "order-id-1",
      OrderStatus.SHIPPED,
      undefined,
      undefined,
    );

    expect(result.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(notifyPaymentReceived).not.toHaveBeenCalled();
  });
});
