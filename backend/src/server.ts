import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { initializeWorkers } from "./services/queue/workers.js";
import { closeQueues } from "./services/queue/queue.config.js";
import { verifyCloudinaryConfig } from "./services/cloudinary.service.js";
import { describeGoogleOAuthConfig } from "./modules/auth/google.service.js";
import { describeEncryptionKeys } from "./utils/secretCipher.js";

const startServer = async (): Promise<void> => {
  await connectDatabase();

  // Verify Cloudinary configuration on startup
  verifyCloudinaryConfig();

  // Initialize background job workers
  initializeWorkers();

  /*
   * Print the effective auth configuration once at boot. A wrong
   * GOOGLE_REDIRECT_URI or CLIENT_URL is the single most common cause of
   * "Google sign-in lands on a 404", and it is only diagnosable from the
   * deployed logs (Render > Logs), so make it explicit.
   */
  logger.info(`Client URL (frontend): ${env.CLIENT_URL}`);
  logger.info(`CORS origin(s): ${env.CORS_ORIGIN}`);

  /*
   * Which environment variable new TOTP secrets are encrypted with (the
   * variable name only - never the key). Secrets encrypted with the
   * legacy JWT_ACCESS_SECRET derivation stop authenticating the moment
   * that variable is rotated, so make the source visible in the logs.
   */
  logger.info(
    `TOTP secret encryption keys (first one encrypts new secrets): ${describeEncryptionKeys()}`,
  );

  for (const line of describeGoogleOAuthConfig()) {
    logger.info(line);
  }

  app.listen(env.PORT, () => {
    logger.info(`Server running on http://localhost:${env.PORT}`);
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
