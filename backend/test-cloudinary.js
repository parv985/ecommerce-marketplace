/**
 * Cloudinary credentials diagnostic script.
 * Run: node test-cloudinary.js
 *
 * This script reads your .env file and tests the Cloudinary connection
 * without exposing your API secret in the output.
 */

import { config } from "dotenv";
config();

import { v2 as cloudinary } from "cloudinary";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

console.log("=== Cloudinary Credentials Diagnostic ===\n");

console.log(`Cloud name : ${cloudName}`);
console.log(`API key    : ${apiKey}`);
console.log(`API secret : ${apiSecret ? "SET (" + apiSecret.length + " chars)" : "MISSING"}`);
console.log(`API secret first 4 chars: ${apiSecret ? apiSecret.substring(0, 4) + "****" : "N/A"}`);
console.log("");

// Configure Cloudinary
cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

// Test 1: Try a simple API call (list resources)
console.log("--- Test 1: Ping Cloudinary API (list resources) ---");
try {
  const result = await cloudinary.api.resources({
    type: "upload",
    max_results: 1,
  });
  console.log("SUCCESS: API call worked!");
  console.log(`Total resources found: ${result.rate_count ?? "N/A"}`);
  console.log(`Resources returned: ${result.resources?.length ?? 0}`);
} catch (err) {
  console.log("FAILED:");
  console.log(`  Error message: ${err.message}`);
  console.log(`  HTTP code: ${err.http_code}`);
  if (err.error) {
    console.log(`  Error details: ${JSON.stringify(err.error, null, 2)}`);
  }
}

console.log("");

// Test 2: Try uploading a small test file
console.log("--- Test 2: Test upload (small text buffer) ---");
try {
  const testBuffer = Buffer.from("test file content");
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "test-uploads",
        public_id: "diagnostic-test-" + Date.now(),
        resource_type: "raw",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );
    stream.end(testBuffer);
  });

  console.log("SUCCESS: Upload worked!");
  console.log(`  URL: ${result.secure_url}`);
  console.log(`  Public ID: ${result.public_id}`);

  // Clean up: delete the test file
  try {
    await cloudinary.uploader.destroy(result.public_id, { resource_type: "raw" });
    console.log("  Cleanup: test file deleted");
  } catch (delErr) {
    console.log(`  Cleanup warning: ${delErr.message}`);
  }
} catch (err) {
  console.log("FAILED:");
  console.log(`  Error message: ${err.message}`);
  console.log(`  HTTP code: ${err.http_code}`);

  // Try to parse the signature info from the error
  const msg = err.message || "";
  if (msg.includes("String to sign")) {
    console.log("\n  >>> SIGNATURE MISMATCH — This means your API SECRET is wrong.");
    console.log("  >>> The Cloudinary SDK signed the request with the secret from your .env,");
    console.log("  >>> but Cloudinary's server has a different secret for this API key.");
    console.log("  >>>");
    console.log("  >>> FIX: Go to https://console.cloudinary.com/app/settings/api-keys");
    console.log("  >>> Click the 3-dot menu next to your API key → View API Secret");
    console.log("  >>> Update CLOUDINARY_API_SECRET in your .env file");
  }
  if (msg.includes("Invalid cloud_name")) {
    console.log("\n  >>> WRONG CLOUD NAME — Check CLOUDINARY_CLOUD_NAME in .env");
    console.log("  >>> From your dashboard, the cloud name is: dtwv1kwzo");
  }
  if (msg.includes("Invalid api_key") || msg.includes("Unknown api_key")) {
    console.log("\n  >>> WRONG API KEY — Check CLOUDINARY_API_KEY in .env");
  }
}

console.log("\n=== End Diagnostic ===");
