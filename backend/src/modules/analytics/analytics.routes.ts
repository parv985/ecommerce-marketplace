import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authorize } from "../../middlewares/role.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { UserRole } from "../../constants/roles.js";
import {
  categoryPerformanceController,
  customersController,
  dashboardController,
  revenueController,
  salesSeriesController,
  topProductsController,
} from "./analytics.controller.js";
import {
  customersQuerySchema,
  revenueQuerySchema,
  salesSeriesQuerySchema,
  topProductsQuerySchema,
} from "./analytics.schema.js";

const router = Router();

router.use(authenticate, authorize(UserRole.SELLER));

/**
 * @openapi
 * /api/v1/sellers/dashboard:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Seller dashboard overview
 *     description: Aggregated snapshot for the authenticated seller - order counts by status, collected revenue, product counts (active / low stock), pending returns and marketing asset counts.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard fetched successfully
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
 *                   $ref: "#/components/schemas/Dashboard"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *
 * /api/v1/sellers/analytics/sales:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Sales over time
 *     description: Order count and collected revenue bucketed by day or month within an optional date range.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: from
 *         in: query
 *         description: Start date (ISO 8601)
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: to
 *         in: query
 *         description: End date (ISO 8601)
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: groupBy
 *         in: query
 *         description: Bucket size
 *         schema:
 *           type: string
 *           enum: [day, month]
 *           default: day
 *     responses:
 *       200:
 *         description: Sales analytics fetched successfully
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
 *                     $ref: "#/components/schemas/SalesPoint"
 *       400:
 *         description: Invalid date range
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *
 * /api/v1/sellers/analytics/top-products:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Top-selling products
 *     description: Products ranked by units sold, with units, order count and collected revenue. Coupon discounts are not attributed per item.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         description: Number of products to return
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *     responses:
 *       200:
 *         description: Top products fetched successfully
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
 *                     $ref: "#/components/schemas/TopProduct"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *
 * /api/v1/sellers/analytics/categories:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Category performance
 *     description: Units sold and collected revenue grouped by product category.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Category performance fetched successfully
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
 *                     $ref: "#/components/schemas/CategoryPerformance"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *
 * /api/v1/sellers/customers:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Seller customer list
 *     description: Distinct customers who have ordered from this seller, with order count and total spent (only PAID orders count as spent). Supports search on name/email and pagination.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: search
 *         in: query
 *         description: Search by customer name or email
 *         schema:
 *           type: string
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
 *         description: Customers fetched successfully
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
 *                   $ref: "#/components/schemas/PaginatedCustomers"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *
 * /api/v1/sellers/revenue:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Revenue statistics
 *     description: Collected revenue, order counts (delivered / cancelled / returned) and the sales series within an optional date range. Cancelled orders never count as revenue.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: from
 *         in: query
 *         description: Start date (ISO 8601)
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: to
 *         in: query
 *         description: End date (ISO 8601)
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: groupBy
 *         in: query
 *         description: Bucket size for the series
 *         schema:
 *           type: string
 *           enum: [day, month]
 *           default: day
 *     responses:
 *       200:
 *         description: Revenue statistics fetched successfully
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
 *                   $ref: "#/components/schemas/RevenueResponse"
 *       400:
 *         description: Invalid date range
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 */
router.get(
  "/dashboard",
  asyncHandler(dashboardController),
);

router.get(
  "/analytics/sales",
  validate(salesSeriesQuerySchema, "query"),
  asyncHandler(salesSeriesController),
);

router.get(
  "/analytics/top-products",
  validate(topProductsQuerySchema, "query"),
  asyncHandler(topProductsController),
);

router.get(
  "/analytics/categories",
  asyncHandler(categoryPerformanceController),
);

router.get(
  "/customers",
  validate(customersQuerySchema, "query"),
  asyncHandler(customersController),
);

router.get(
  "/revenue",
  validate(revenueQuerySchema, "query"),
  asyncHandler(revenueController),
);

export default router;
