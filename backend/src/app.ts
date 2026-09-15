import express, { type Request } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";

import { corsOrigins, env } from "./config/env.js";
import routes from "./routes/index.js";
import { notFoundMiddleware } from "./middlewares/notFound.middleware.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./docs/swagger.js";

const app = express();

/*
 * The API runs behind Render's proxy (and the Vite dev proxy locally).
 * Trusting one hop keeps req.protocol === "https" and the original Host
 * header intact, which is what the Google OAuth callback uses to derive
 * its redirect URI when GOOGLE_REDIRECT_URI is not set explicitly.
 */
app.set("trust proxy", 1);

app.use(helmet());

/*
 * Baseline API rate limit. The strict auth limiter below protects
 * brute-force-sensitive endpoints (login, register, password reset).
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later",
    code: "RATE_LIMITED",
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts, please try again later",
    code: "RATE_LIMITED",
  },
});

if (env.NODE_ENV !== "test") {
  app.use("/api", apiLimiter);
  app.use("/api/v1/auth", authLimiter);
}

app.use(
  cors({
    /*
     * CORS_ORIGIN may list several comma-separated origins (production
     * frontend + a preview origin). The refresh-token cookie is
     * SameSite=None in production, so credentialed cross-origin calls
     * only work when the requesting origin is allowed here.
     */
    origin: (origin, callback) => {
      // Same-origin/curl/server-to-server requests have no Origin header.
      if (!origin || corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      /*
       * Unknown origin: answer without CORS headers (the browser blocks
       * the response) exactly like a single-origin allowlist would.
       */
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
/*
 * The verify callback captures the raw request body for the Razorpay
 * webhook, whose signature is computed over the exact bytes received.
 */
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "E-commerce Marketplace API",
  });
});

app.use("/api/v1", routes);

app.use(notFoundMiddleware);

app.use(errorMiddleware);

export default app;
