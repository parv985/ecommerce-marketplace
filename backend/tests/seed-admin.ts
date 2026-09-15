/*
 * Dev utility: creates (or resets the password of) a SUPER_ADMIN user.
 * Usage: npx tsx tests/seed-admin.ts
 * Credentials: admin@example.com / Admin@1234
 */
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import { connectDatabase } from "../src/config/database.js";
import { UserRole } from "../src/constants/roles.js";
import { User } from "../src/models/User.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "Admin@1234";

const main = async (): Promise<void> => {
  await connectDatabase();

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await User.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    {
      $set: {
        name: "Super Admin",
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        isEmailVerified: true,
        isActive: true,
      },
      $setOnInsert: {
        authProvider: "LOCAL",
      },
    },
    {
      upsert: true,
      new: true,
    },
  );

  console.log(
    `Admin ready: ${admin.email} (${admin.role}) id=${admin._id.toString()}`,
  );

  await mongoose.disconnect();
};

main().catch((error: unknown) => {
  console.error("Failed to seed admin:", error);
  process.exit(1);
});
