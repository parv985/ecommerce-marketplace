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

/*
 * Deterministic Google OAuth test credentials. The suite stubs the two
 * outbound calls to Google (token exchange + ID-token verification), so
 * no real client is ever needed - and forcing the values here keeps the
 * assertions independent of whatever a developer has in their local .env.
 */
process.env.GOOGLE_CLIENT_ID =
  "test-client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_REDIRECT_URI =
  "http://localhost:5000/api/v1/auth/google/callback";
process.env.CLIENT_URL = "http://localhost:3000";
