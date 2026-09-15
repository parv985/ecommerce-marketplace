import { Router } from "express";

import { sendSuccess } from "../utils/apiResponse.js";
import authRoutes from "../modules/auth/auth.routes.js";
import sellerRoutes from "../modules/sellers/seller.routes.js";
import productRoutes from "../modules/products/product.routes.js";
import categoryRoutes from "../modules/categories/category.routes.js";
import userRoutes from "../modules/users/user.routes.js";
import cartRoutes from "../modules/cart/cart.routes.js";
import orderRoutes from "../modules/orders/order.routes.js";
import reviewRoutes from "../modules/reviews/review.routes.js";
import discountRoutes from "../modules/discounts/discount.routes.js";
import couponRoutes from "../modules/coupons/coupon.routes.js";
import returnRoutes from "../modules/returns/return.routes.js";
import analyticsRoutes from "../modules/analytics/analytics.routes.js";
import settlementRoutes from "../modules/settlements/settlement.routes.js";
import notificationRoutes from "../modules/notifications/notification.routes.js";
import paymentRoutes from "../modules/payments/payment.routes.js";
import adminRoutes from "../modules/admin/admin.routes.js";
import wishlistRoutes from "../modules/wishlist/wishlist.routes.js";
import inventoryRoutes from "../modules/inventory/inventory.routes.js";

const router = Router();

/**
 * @openapi
 * /api/v1/health:
 *   get:
 *     tags:
 *       - System
 *     summary: Health check
 *     description: Returns the API status and current server timestamp.
 *     responses:
 *       200:
 *         description: API is healthy
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
 *                     status:
 *                       type: string
 *                       example: UP
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 */
router.get("/health", (_req, res) => {
  return sendSuccess(res, "API is healthy", {
    status: "UP",
    timestamp: new Date().toISOString(),
  });
});

router.use("/auth", authRoutes);
router.use(
  "/sellers",
  sellerRoutes,
);

router.use(
  "/products",
  productRoutes,
);

router.use(
  "/categories",
  categoryRoutes,
);

router.use(
  "/users",
  userRoutes,
);

router.use(
  "/cart",
  cartRoutes,
);

router.use(
  "/orders",
  orderRoutes,
);

router.use(
  "/reviews",
  reviewRoutes,
);

router.use(
  "/discounts",
  discountRoutes,
);

router.use(
  "/coupons",
  couponRoutes,
);

router.use(
  "/returns",
  returnRoutes,
);

/*
 * Seller dashboard / analytics / customers / revenue. Mounted on the
 * same prefix as sellerRoutes; Express composes both routers.
 */
router.use(
  "/sellers",
  analyticsRoutes,
);

router.use(
  "/sellers",
  settlementRoutes,
);

router.use(
  "/notifications",
  notificationRoutes,
);

router.use(
  "/payments",
  paymentRoutes,
);

router.use(
  "/admin",
  adminRoutes,
);

router.use(
  "/wishlist",
  wishlistRoutes,
);

router.use(
  "/inventory",
  inventoryRoutes,
);

export default router;