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

try {
  const parsed = new URL(devUri);
  parsed.pathname = "/ecommerce_marketplace_test";
  process.env.MONGODB_URI = parsed.toString();
} catch {
  const baseWithoutPath = devUri.split("?")[0].replace(/\/[^/]*$/, "");
  const query = devUri.includes("?") ? `?${devUri.split("?")[1]}` : "";
  process.env.MONGODB_URI = `${baseWithoutPath}/ecommerce_marketplace_test${query}`;
}
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
process.env.CLIENT_URL = "http://localhost:3000";

/*
 * Keep payments deterministic and offline in integration tests (MOCK mode).
 */
process.env.RAZORPAY_KEY_ID = "";
process.env.RAZORPAY_KEY_SECRET = "";
process.env.RAZORPAY_WEBHOOK_SECRET = "";
