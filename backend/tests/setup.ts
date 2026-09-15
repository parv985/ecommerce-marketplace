/*
 * Runs before any test file is imported. Points the application at a
 * dedicated test database (derived from MONGODB_URI) so integration
 * tests never touch development data, and disables the API rate
 * limiters that would otherwise throttle test traffic.
 */
import { config } from "dotenv";

config();

const devUri = process.env.MONGODB_URI;

if (!devUri) {
  throw new Error(
    "MONGODB_URI is required to run integration tests",
  );
}

const base = devUri.split("?")[0].replace(/\/$/, "");
const query = devUri.includes("?")
  ? `?${devUri.split("?")[1]}`
  : "";

process.env.MONGODB_URI =
  `${base}/ecommerce_marketplace_test${query}`;
process.env.NODE_ENV = "test";
