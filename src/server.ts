import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";


const startServer = async (): Promise<void> => {
  await connectDatabase();

  app.listen(env.PORT, () => {
    logger.info(
      `Server running on http://localhost:${env.PORT}`,
    );
  });
};

startServer().catch((error: unknown) => {
  logger.error("Failed to start server", error);
  process.exit(1);
});