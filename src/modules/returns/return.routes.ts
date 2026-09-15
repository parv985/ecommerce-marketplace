import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  cancelReturnController,
  getReturnController,
  listReturnsController,
  requestReturnController,
  updateReturnStatusController,
} from "./return.controller.js";
import {
  createReturnSchema,
  listReturnsQuerySchema,
  returnIdParamsSchema,
  updateReturnStatusSchema,
} from "./return.schema.js";

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/v1/returns:
 *   post:
 *     tags:
 *       - Returns
 *     summary: Request a return
 *     description: Requests a return for a DELIVERED order within 7 days of delivery. Only the buyer who owns the order can request; one active return per order. No return can be requested while one is in progress.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId, reason]
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: Delivered order ObjectId
 *               reason:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: Return request submitted
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
 *                   $ref: "#/components/schemas/ReturnRequest"
 *       400:
 *         description: Order not delivered, window expired or validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your order
 *       404:
 *         description: Order not found
 *       409:
 *         description: A return request is already in progress
 *   get:
 *     tags:
 *       - Returns
 *     summary: List my return requests
 *     description: Buyers see their own return requests; sellers see requests for their orders. Supports status filtering and pagination.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         description: Filter by return status
 *         schema:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED, CANCELLED, COMPLETED]
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
 *         description: Return requests fetched successfully
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
 *                   $ref: "#/components/schemas/PaginatedReturns"
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Not authenticated
 */
router.post(
  "/",
  validate(createReturnSchema),
  asyncHandler(requestReturnController),
);

router.get(
  "/",
  validate(listReturnsQuerySchema, "query"),
  asyncHandler(listReturnsController),
);

/**
 * @openapi
 * /api/v1/returns/{id}:
 *   get:
 *     tags:
 *       - Returns
 *     summary: Get a return request
 *     description: Returns a single return request. The owning buyer, the order's seller, and admins can view it.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Return request ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Return request fetched successfully
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
 *                   $ref: "#/components/schemas/ReturnRequest"
 *       400:
 *         description: Invalid return id
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your return request
 *       404:
 *         description: Return request not found
 *
 * /api/v1/returns/{id}/status:
 *   patch:
 *     tags:
 *       - Returns
 *     summary: Update a return request status
 *     description: |
 *       Advances a return through PENDING -> APPROVED -> COMPLETED or rejects it (a reason is required for rejection). Only the order's seller or an admin can update.
 *
 *       **Approving a return processes the refund and every rollback atomically:**
 *       - the eligible amount (`order.total`, i.e. net of discounts and coupons) is refunded to the buyer - through the payment gateway for online orders, or recorded as an offline COD refund on the return;
 *       - the order becomes `RETURNED` and its payment status `REFUNDED`;
 *       - the returned units are credited back to the seller's inventory (with inventory transactions);
 *       - any coupon usage is released and the coupon's usage counter is decremented;
 *       - the order is reversed out of the seller's settlement, giving back the platform commission and the seller payable;
 *       - the refund, the order timeline and the audit log are written in the same transaction.
 *
 *       The call is idempotent: approving twice (or retrying after a partial failure) never issues a second refund. COMPLETED only records that the goods are back with the seller - it never restores stock a second time.
 *
 *       On success the buyer receives the notification "Your return has been approved and your refund has been processed successfully."
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Return request ObjectId
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
 *                 enum: [APPROVED, REJECTED, COMPLETED]
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *                 description: Required when rejecting
 *     responses:
 *       200:
 *         description: |
 *           Return request updated. On APPROVED the response carries the
 *           `refund` block (amount, status, method, gateway refund id,
 *           timestamps) plus `approvedAt` and `stockRestoredAt`.
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
 *                   $ref: "#/components/schemas/ReturnRequest"
 *       400:
 *         description: Invalid transition, missing rejection reason, or the payment could not be refunded
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your order's return request
 *       404:
 *         description: Return request not found
 *       409:
 *         description: The order was cancelled, or another approval of the same return is already in progress
 *       502:
 *         description: The payment gateway rejected the refund (the return is left PENDING so it can be retried)
 *
 * /api/v1/returns/{id}/cancel:
 *   post:
 *     tags:
 *       - Returns
 *     summary: Cancel a pending return request
 *     description: Cancels the buyer's own return request while it is still PENDING.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Return request ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Return request cancelled
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
 *                   $ref: "#/components/schemas/ReturnRequest"
 *       400:
 *         description: Return cannot be cancelled in its current state
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your return request
 *       404:
 *         description: Return request not found
 */
router.get(
  "/:id",
  validate(returnIdParamsSchema, "params"),
  asyncHandler(getReturnController),
);

router.patch(
  "/:id/status",
  validate(returnIdParamsSchema, "params"),
  validate(updateReturnStatusSchema),
  asyncHandler(updateReturnStatusController),
);

router.post(
  "/:id/cancel",
  validate(returnIdParamsSchema, "params"),
  asyncHandler(cancelReturnController),
);

export default router;
