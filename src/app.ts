import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import routes from "./routes/index.js";
import { notFoundMiddleware } from "./middlewares/notFound.middleware.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

app.use(express.json());
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