import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { initializeWorkers } from "./services/queue/workers.js";
import { closeQueues } from "./services/queue/queue.config.js";
import { verifyCloudinaryConfig } from "./services/cloudinary.service.js";


const startServer = async (): Promise<void> => {
  await connectDatabase();

  // Verify Cloudinary configuration on startup
  verifyCloudinaryConfig();

  // Initialize background job workers
  initializeWorkers();

  app.listen(env.PORT, () => {
    logger.info(
      `Server running on http://localhost:${env.PORT}`,
    );
  });
};

const gracefulShutdown = async (): Promise<void> => {
  console.log("[SERVER] Shutting down gracefully...");
  await closeQueues();
  process.exit(0);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

startServer().catch((error: unknown) => {
  logger.error("Failed to start server", error);
  process.exit(1);
});