import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  initiatePaymentController,
  razorpayWebhookController,
  refundOrderPaymentController,
  verifyPaymentController,
} from "./payment.controller.js";
import {
  paymentOrderIdParamsSchema,
  verifyPaymentSchema,
} from "./payment.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/payments/webhook/razorpay:
 *   post:
 *     tags:
 *       - Payments
 *     summary: Razorpay webhook
 *     description: Processes Razorpay webhook events (payment.captured, order.paid, refund.processed). Authenticated by the X-Razorpay-Signature header over the raw body - no bearer token is used. Duplicate deliveries are safely ignored via an idempotency key per event.
 *     requestBody:
 *       required: true
 *       description: Raw Razorpay webhook payload
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     parameters:
 *       - name: X-Razorpay-Signature
 *         in: header
 *         required: true
 *         description: HMAC-SHA256 signature of the raw body
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook accepted (processed or safely ignored as duplicate)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     processed:
 *                       type: boolean
 *       400:
 *         description: Invalid webhook signature
 */
router.post(
  "/webhook/razorpay",
  asyncHandler(razorpayWebhookController),
);

router.use(authenticate);

/**
 * @openapi
 * /api/v1/payments/orders/{orderId}/initiate:
 *   post:
 *     tags:
 *       - Payments
 *     summary: Initiate payment for an order
 *     description: Creates a gateway payment order for an ONLINE order owned by the authenticated buyer. The amount is always the server-side order total. Idempotent - calling it again returns the existing payment instead of creating a duplicate gateway order.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orderId
 *         in: path
 *         required: true
 *         description: Order ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Payment initiated
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
 *                   $ref: "#/components/schemas/Payment"
 *       400:
 *         description: Order is not online, not pending, or already has a payment
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your order
 *       404:
 *         description: Order not found
 *
 * /api/v1/payments/orders/{orderId}/verify:
 *   post:
 *     tags:
 *       - Payments
 *     summary: Verify payment
 *     description: Verifies the payment signature returned by the Razorpay checkout. The server re-derives the HMAC signature from the stored gateway order id and the supplied payment id - client-supplied payment status is never trusted. Idempotent once paid.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orderId
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
 *             required: [paymentId, signature]
 *             properties:
 *               paymentId:
 *                 type: string
 *                 description: Razorpay payment id from the checkout widget
 *               signature:
 *                 type: string
 *                 description: Razorpay signature from the checkout widget
 *     responses:
 *       200:
 *         description: Payment verified
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
 *                   $ref: "#/components/schemas/Payment"
 *       400:
 *         description: Invalid signature, payment not initiated, or invalid state
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your order
 *       404:
 *         description: Order not found
 *
 * /api/v1/payments/orders/{orderId}/refund:
 *   post:
 *     tags:
 *       - Payments
 *     summary: Refund a paid online order
 *     description: Refunds the full paid amount of an ONLINE order. Only the order's seller or an admin may issue a refund. The refund amount is always the paid order total - never client-supplied. Idempotent - a second refund on the same payment returns the current state. Buyer-triggered refunds happen automatically through order cancellation.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orderId
 *         in: path
 *         required: true
 *         description: Order ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Refund issued
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
 *                   $ref: "#/components/schemas/Payment"
 *       400:
 *         description: Order was not paid online, not paid, or already refunded
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your order
 *       404:
 *         description: Order not found
 */
router.post(
  "/orders/:orderId/initiate",
  validate(
    paymentOrderIdParamsSchema,
    "params",
  ),
  asyncHandler(initiatePaymentController),
);

router.post(
  "/orders/:orderId/verify",
  validate(
    paymentOrderIdParamsSchema,
    "params",
  ),
  validate(verifyPaymentSchema),
  asyncHandler(verifyPaymentController),
);

router.post(
  "/orders/:orderId/refund",
  validate(
    paymentOrderIdParamsSchema,
    "params",
  ),
  asyncHandler(refundOrderPaymentController),
);

export default router;
