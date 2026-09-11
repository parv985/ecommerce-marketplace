import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AdminOrdersPage } from "./AdminOrdersPage";
import { AdminOrderDetailPage } from "./AdminOrderDetailPage";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/stores/authStore";
import type { AdminOrder, Invoice, Order } from "@/types/api";

/*
 * Route-level coverage for the Super Admin order navigation:
 *
 *   Orders (All Orders) → click an order → that order's details
 *
 * Regression guard: clicking an order must open `/admin/orders/:id`
 * with the clicked order's own data — never redirect to the admin
 * dashboard (this used to happen because the cards linked to the
 * buyer-only `/orders/:id` route, whose role guard bounces
 * SUPER_ADMIN users to `/admin/dashboard`).
 */

const getOrders = vi.hoisted(() => vi.fn());
const getOrderById = vi.hoisted(() => vi.fn());
const getTracking = vi.hoisted(() => vi.fn());
const getInvoice = vi.hoisted(() => vi.fn());
const listReturns = vi.hoisted(() => vi.fn());

vi.mock("@/services/admin.service", () => ({
  adminService: {
    getOrders: (...args: unknown[]) => getOrders(...args),
  },
}));

vi.mock("@/services/order.service", () => ({
  orderService: {
    getById: (...args: unknown[]) => getOrderById(...args),
    getTracking: (...args: unknown[]) => getTracking(...args),
    getInvoice: (...args: unknown[]) => getInvoice(...args),
  },
}));

vi.mock("@/services/return.service", () => ({
  returnService: {
    list: (...args: unknown[]) => listReturns(...args),
  },
}));

vi.mock("@/services/review.service", () => ({
  reviewService: {
    getProductReviews: vi.fn().mockResolvedValue({ items: [] }),
  },
}));

const ADMIN_ID = "65f1c2b0a1b2c3d4e5f60717";
const BUYER_ID = "65f1c2b0a1b2c3d4e5f60801";
const SELLER_ID = "65f1c2b0a1b2c3d4e5f60902";
const ORDER_A_ID = "64a000000000000000000001";
const ORDER_B_ID = "64a000000000000000000002";

const adminOrder = (overrides: Partial<AdminOrder>): AdminOrder => ({
  id: ORDER_A_ID,
  orderNumber: "ORD-1001",
  userId: BUYER_ID,
  sellerId: SELLER_ID,
  itemCount: 2,
  total: 1598,
  paymentStatus: "PENDING",
  status: "CONFIRMED",
  createdAt: "2026-03-01T10:00:00.000Z",
  ...overrides,
});

const LIST_ITEMS: AdminOrder[] = [
  adminOrder({ id: ORDER_A_ID, orderNumber: "ORD-1001" }),
  adminOrder({
    id: ORDER_B_ID,
    orderNumber: "ORD-2002",
    itemCount: 1,
    total: 499,
    status: "DELIVERED",
    paymentStatus: "PAID",
  }),
];

const fullOrder = (overrides: Partial<Order>): Order => ({
  id: ORDER_A_ID,
  orderNumber: "ORD-1001",
  userId: BUYER_ID,
  sellerId: SELLER_ID,
  sellerBusinessName: "Acme Traders",
  items: [
    {
      productId: "64b0000000000000000000p1",
      name: "Wireless Mouse",
      price: 799,
      quantity: 2,
      subtotal: 1598,
      discountAmount: 0,
    },
  ],
  shippingAddress: {
    recipientName: "Riya Sharma",
    phone: "9876543210",
    addressLine1: "12 MG Road",
    addressLine2: null,
    city: "Pune",
    state: "Maharashtra",
    pincode: "411001",
  },
  itemsTotal: 1598,
  discountTotal: 0,
  couponId: null,
  couponCode: null,
  couponDiscount: 0,
  total: 1598,
  paymentMethod: "CASH_ON_DELIVERY",
  paymentStatus: "PENDING",
  paymentId: null,
  status: "CONFIRMED",
  deliveredAt: null,
  returnedAt: null,
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:05:00.000Z",
  ...overrides,
});

const ORDERS: Record<string, Order> = {
  [ORDER_A_ID]: fullOrder({ id: ORDER_A_ID, orderNumber: "ORD-1001" }),
  [ORDER_B_ID]: fullOrder({
    id: ORDER_B_ID,
    orderNumber: "ORD-2002",
    items: [
      {
        productId: "64b0000000000000000000p2",
        name: "USB-C Cable",
        price: 499,
        quantity: 1,
        subtotal: 499,
        discountAmount: 0,
      },
    ],
    itemsTotal: 499,
    total: 499,
    status: "DELIVERED",
    paymentStatus: "PAID",
    deliveredAt: "2026-03-05T08:00:00.000Z",
  }),
};

const invoiceFor = (order: Order): Invoice => ({
  invoiceNumber: `INV-${order.orderNumber}`,
  orderNumber: order.orderNumber,
  orderId: order.id,
  orderDate: order.createdAt,
  buyer: { name: "Riya Sharma", email: "riya@buyer.test" },
  seller: {
    businessName: "Acme Traders",
    gstin: "27AAAAA0000A1Z5",
    pan: "AAAAA0000A",
    address: {
      addressLine1: "5 Industrial Estate",
      addressLine2: null,
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
    },
  },
  items: order.items,
  shippingAddress: order.shippingAddress,
  itemsTotal: order.itemsTotal,
  discountTotal: order.discountTotal,
  couponDiscount: order.couponDiscount,
  taxRate: 18,
  taxAmount: 287.64,
  total: order.total + 287.64,
  paymentMethod: order.paymentMethod,
  paymentStatus: order.paymentStatus,
  status: order.status,
  deliveredAt: order.deliveredAt,
  createdAt: order.createdAt,
});

let queryClient: QueryClient;

/** Same admin route tree shape as App.tsx (layout chrome replaced by an Outlet). */
function renderAt(initialPath: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={["SUPER_ADMIN"]}>
                <Outlet />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<div>Admin Dashboard</div>} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="orders/:id" element={<AdminOrderDetailPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Super Admin individual order navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    getOrders.mockResolvedValue({
      items: LIST_ITEMS,
      page: 1,
      totalPages: 1,
      total: LIST_ITEMS.length,
    });
    getOrderById.mockImplementation((id: string) =>
      Promise.resolve(ORDERS[id]),
    );
    getTracking.mockImplementation((id: string) =>
      Promise.resolve({
        orderNumber: ORDERS[id].orderNumber,
        status: ORDERS[id].status,
        timeline: [
          {
            status: "PENDING",
            actorId: BUYER_ID,
            actorRole: "BUYER",
            reason: null,
            createdAt: ORDERS[id].createdAt,
          },
        ],
        createdAt: ORDERS[id].createdAt,
        deliveredAt: ORDERS[id].deliveredAt ?? undefined,
      }),
    );
    getInvoice.mockImplementation((id: string) =>
      Promise.resolve(invoiceFor(ORDERS[id])),
    );
    listReturns.mockResolvedValue({ items: [], total: 0, totalPages: 1 });

    useAuthStore.setState({
      user: {
        id: ADMIN_ID,
        name: "Super Admin",
        email: "admin@nexcart.test",
        role: "SUPER_ADMIN",
      },
      isAuthenticated: true,
      isLoading: false,
      accountInactive: false,
    });
  });

  it("opens the clicked order's details instead of the dashboard", async () => {
    const user = userEvent.setup();
    renderAt("/admin/orders");

    // All Orders list rendered
    expect(await screen.findByText("#ORD-1001")).toBeInTheDocument();
    expect(screen.getByText("#ORD-2002")).toBeInTheDocument();
    expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument();

    // Click the first order card
    await user.click(screen.getByText("#ORD-1001"));

    // Order details for THAT order render — not the dashboard
    expect(
      await screen.findByText("Order #ORD-1001"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument();
    expect(getOrderById).toHaveBeenCalledWith(ORDER_A_ID);

    // Admin detail extras: buyer/seller identity resolved for this order
    expect(screen.getByText("riya@buyer.test")).toBeInTheDocument();
    expect(screen.getByText("Acme Traders")).toBeInTheDocument();
    expect(screen.getByText(`Order ID: ${ORDER_A_ID}`)).toBeInTheDocument();
  });

  it("opens the correct details for each respective order", async () => {
    const user = userEvent.setup();
    renderAt("/admin/orders");

    await user.click(await screen.findByText("#ORD-2002"));
    expect(await screen.findByText("Order #ORD-2002")).toBeInTheDocument();
    expect(getOrderById).toHaveBeenCalledWith(ORDER_B_ID);
    expect(screen.getByText("USB-C Cable")).toBeInTheDocument();
    expect(screen.queryByText(/Order #ORD-1001/)).not.toBeInTheDocument();
  });

  it("links every order card to its admin detail route (never the buyer route)", async () => {
    renderAt("/admin/orders");

    const linkA = await screen.findByRole("link", { name: /ORD-1001/ });
    const linkB = screen.getByRole("link", { name: /ORD-2002/ });
    expect(linkA).toHaveAttribute("href", `/admin/orders/${ORDER_A_ID}`);
    expect(linkB).toHaveAttribute("href", `/admin/orders/${ORDER_B_ID}`);
  });

  it("renders the right order when the detail URL is opened directly (refresh)", async () => {
    renderAt(`/admin/orders/${ORDER_B_ID}`);

    expect(
      await screen.findByText("Order #ORD-2002"),
    ).toBeInTheDocument();
    expect(getOrderById).toHaveBeenCalledWith(ORDER_B_ID);
    expect(screen.getByText("USB-C Cable")).toBeInTheDocument();
    expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument();

    // Back navigation returns to the admin All Orders page
    await userEvent.click(screen.getByRole("link", { name: /Back to orders/ }));
    expect(await screen.findByText("#ORD-1001")).toBeInTheDocument();
  });

  it("keeps the buyer variant unchanged (shared-component regression guard)", async () => {
    const { OrderDetailPage } = await import("@/pages/OrderDetailPage");

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/orders/${ORDER_A_ID}`]}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Buyer still gets the marketplace route and behavior…
    expect(await screen.findByText("Order #ORD-1001")).toBeInTheDocument();

    // …an un-delivered buyer order fetches no invoice…
    await waitFor(() => {
      expect(getOrderById).toHaveBeenCalledWith(ORDER_A_ID);
    });
    expect(getInvoice).not.toHaveBeenCalled();

    // …and no admin-only cards appear.
    expect(screen.queryByText(/Customer & Seller/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Back to orders/)).toHaveAttribute(
      "href",
      "/orders",
    );
  });
});
