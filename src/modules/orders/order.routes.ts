import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authorize } from "../../middlewares/roel.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { UserRole } from "../../constants/roles.js";
import {
  cancelOrderController,
  createOrderController,
  getOrderController,
  listOrdersController,
  markOrderPaidController,
  updateOrderStatusController,
} from "./order.controller.js";
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderIdParamsSchema,
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

export default router;
