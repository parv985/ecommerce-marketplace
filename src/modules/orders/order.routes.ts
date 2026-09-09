import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authorize } from "../../middlewares/role.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { UserRole } from "../../constants/roles.js";
import {
  cancelOrderController,
  createOrderController,
  getInvoiceController,
  getOrderController,
  getOrderTrackingController,
  listOrdersController,
  markOrderPaidController,
  previewOrderController,
  updateOrderStatusController,
} from "./order.controller.js";
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderIdParamsSchema,
  previewOrderSchema,
  updateOrderStatusSchema,
} from "./order.schema.js";

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/v1/orders:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Checkout cart and create orders
 *     description: Creates one order per seller from the authenticated user's cart, atomically decrements product stock, snapshots the shipping address, and clears the cart. Prices come from the database, never from the client.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CreateOrderInput"
 *     responses:
 *       201:
 *         description: Order(s) created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/Order"
 *       400:
 *         description: Validation error, empty cart, insufficient stock or unavailable product
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Shipping address not found
 *
 *   get:
 *     tags:
 *       - Orders
 *     summary: List my orders
 *     description: Returns the authenticated user's orders. Buyers see their own orders; sellers see orders for their products. Supports status filtering and pagination.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         description: Filter by order status
 *         schema:
 *           type: string
 *           enum: [PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED]
 *       - name: page
 *         in: query
 *         description: Page number
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - name: limit
 *         in: query
 *         description: Items per page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: "#/components/schemas/PaginatedOrders"
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Not authenticated
 */
router.post(
  "/",
  validate(createOrderSchema),
  asyncHandler(createOrderController),
);

/**
 * @openapi
 * /api/v1/orders/preview:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Preview checkout totals (no side effects)
 *     description: Validates the authenticated user's cart and an optional coupon code and returns the exact totals checkout will charge - items subtotal, product/category sales discounts, coupon discount and final payable - without placing an order, claiming the coupon or decrementing stock. Coupons are evaluated server-side with the same rules used when the order is actually placed.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               couponCode:
 *                 type: string
 *                 maxLength: 30
 *                 description: Optional coupon code to validate and apply
 *     responses:
 *       200:
 *         description: Checkout preview fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     itemsTotal:
 *                       type: number
 *                     discountTotal:
 *                       type: number
 *                     couponCode:
 *                       type: string
 *                       nullable: true
 *                     couponDiscount:
 *                       type: number
 *                     total:
 *                       type: number
 *                     orders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sellerId:
 *                             type: string
 *                           itemsTotal:
 *                             type: number
 *                           discountTotal:
 *                             type: number
 *                           couponDiscount:
 *                             type: number
 *                           total:
 *                             type: number
 *       400:
 *         description: Empty cart, unavailable product, insufficient stock, invalid/expired coupon or coupon not applicable to the cart
 *       401:
 *         description: Not authenticated
 */
router.post(
  "/preview",
  validate(previewOrderSchema),
  asyncHandler(previewOrderController),
);

router.get(
  "/",
  validate(listOrdersQuerySchema, "query"),
  asyncHandler(listOrdersController),
);

/**
 * @openapi
 * /api/v1/orders/{id}:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get order by id
 *     description: Returns a single order. Buyers can only access their own orders, sellers only orders for their products, admins any order.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: "#/components/schemas/Order"
 *       400:
 *         description: Invalid order id
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your order
 *       404:
 *         description: Order not found
 *
 * /api/v1/orders/{id}/status:
 *   patch:
 *     tags:
 *       - Orders
 *     summary: Update order status
 *     description: Advances an order through its lifecycle (PENDING -> CONFIRMED -> SHIPPED -> DELIVERED) or cancels it. Only the order's seller or an admin may update status. Invalid transitions are rejected.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ObjectId
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED]
 *     responses:
 *       200:
 *         description: Order status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: "#/components/schemas/Order"
 *       400:
 *         description: Invalid transition or validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your order
 *       404:
 *         description: Order not found
 */
router.get(
  "/:id",
  validate(orderIdParamsSchema, "params"),
  asyncHandler(getOrderController),
);

router.patch(
  "/:id/status",
  validate(orderIdParamsSchema, "params"),
  validate(updateOrderStatusSchema),
  asyncHandler(updateOrderStatusController),
);

/**
 * @openapi
 * /api/v1/orders/{id}/cancel:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Cancel an order
 *     description: Cancels an order that has not been delivered yet. The buyer, the order's seller, or an admin may cancel. Committed stock is restored to the seller's inventory.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: "#/components/schemas/Order"
 *       400:
 *         description: Order cannot be cancelled in its current state
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your order
 *       404:
 *         description: Order not found
 *
 * /api/v1/orders/{id}/pay:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Mark payment as received
 *     description: Marks a cash-on-delivery order as paid. Only the order's seller or an admin can do this, and only after the order has been delivered. Client-supplied payment status is never trusted.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment marked as received
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: "#/components/schemas/Order"
 *       400:
 *         description: Order not delivered yet
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your order
 *       404:
 *         description: Order not found
 */
router.post(
  "/:id/cancel",
  validate(orderIdParamsSchema, "params"),
  asyncHandler(cancelOrderController),
);

router.post(
  "/:id/pay",
  validate(orderIdParamsSchema, "params"),
  asyncHandler(markOrderPaidController),
);

/**
 * @openapi
 * /api/v1/orders/{id}/invoice:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get order invoice
 *     description: Returns structured invoice data for the order including buyer, seller, items, quantities, prices, discounts, taxes, and totals. Buyers can only view their own invoices, sellers only for their orders, admins any order.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoiceNumber:
 *                       type: string
 *                     orderNumber:
 *                       type: string
 *                     orderDate:
 *                       type: string
 *                       format: date-time
 *                     buyer:
 *                       type: object
 *                     seller:
 *                       type: object
 *                     items:
 *                       type: array
 *                     itemsTotal:
 *                       type: number
 *                     discountTotal:
 *                       type: number
 *                     taxAmount:
 *                       type: number
 *                     total:
 *                       type: number
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your order
 *       404:
 *         description: Order not found
 */
router.get(
  "/:id/invoice",
  validate(orderIdParamsSchema, "params"),
  asyncHandler(getInvoiceController),
);

/**
 * @openapi
 * /api/v1/orders/{id}/tracking:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get order tracking timeline
 *     description: Returns the chronological order-status timeline with timestamps, actors, and reasons. Buyers can only view their own orders, sellers only for their orders, admins any order.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order tracking fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderNumber:
 *                       type: string
 *                     status:
 *                       type: string
 *                     timeline:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                           actorId:
 *                             type: string
 *                           actorRole:
 *                             type: string
 *                           reason:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     deliveredAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your order
 *       404:
 *         description: Order not found
 */
router.get(
  "/:id/tracking",
  validate(orderIdParamsSchema, "params"),
  asyncHandler(getOrderTrackingController),
);

export default router;
