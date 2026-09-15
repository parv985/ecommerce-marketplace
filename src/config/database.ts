import mongoose from "mongoose";

import { env } from "./env.js";

export const connectDatabase = async (): Promise<void> => {
  try {
    /*
     * Propagates the active transaction session (see
     * src/config/transaction.ts) to every Mongoose operation executed
     * inside `runInTransaction`, so multi-document money flows stay
     * atomic without threading a session through each repository call.
     */
    mongoose.set("transactionAsyncLocalStorage", true);

    await mongoose.connect(env.MONGODB_URI);

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
};
