/*
 * Dev/ops utility: creates (or updates) a SUPER_ADMIN user.
 * Usage:
 *   npx tsx tests/seed-admin.ts
 *   npm run seed:admin
 *   npx tsx tests/seed-admin.ts custom.admin@example.com MyPassword@123 "Custom Admin"
 */
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import { connectDatabase } from "../src/config/database.js";
import { UserRole } from "../src/constants/roles.js";
import { User } from "../src/models/User.js";

// Salt rounds: 12 matches auth.service.ts
const SALT_ROUNDS = 12;

export interface AdminSeedConfig {
  email: string;
  password: string;
  name: string;
}

export const seedAdminUser = async (config: AdminSeedConfig) => {
  const normalizedEmail = config.email.trim().toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail }).select(
    "+passwordHash +twoFactorSecretEncrypted +recoveryCodes",
  );

  const passwordHash = await bcrypt.hash(config.password, SALT_ROUNDS);

  if (existingUser) {
    existingUser.name = config.name || existingUser.name;
    existingUser.passwordHash = passwordHash;
    existingUser.role = UserRole.SUPER_ADMIN;
    existingUser.isEmailVerified = true;
    existingUser.isActive = true;
    existingUser.twoFactorEnabled = false;
    existingUser.twoFactorSecretEncrypted = null as unknown as string;
    existingUser.recoveryCodes = [];
    await existingUser.save();

    console.log(
      `[EXISTING] Super Admin updated: ${existingUser.email} (role=${existingUser.role}) id=${existingUser._id.toString()}`,
    );
    return { user: existingUser, newlyCreated: false };
  } else {
    const newUser = await User.create({
      name: config.name,
      email: normalizedEmail,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isEmailVerified: true,
      isActive: true,
      authProvider: "LOCAL",
      twoFactorEnabled: false,
    });

    console.log(
      `[NEW] Super Admin created: ${newUser.email} (role=${newUser.role}) id=${newUser._id.toString()}`,
    );
    return { user: newUser, newlyCreated: true };
  }
};

const main = async (): Promise<void> => {
  await connectDatabase();

  const customEmail = process.argv[2] || process.env.ADMIN_EMAIL;
  const customPassword = process.argv[3] || process.env.ADMIN_PASSWORD;
  const customName = process.argv[4] || process.env.ADMIN_NAME;

  if (customEmail && customPassword) {
    await seedAdminUser({
      email: customEmail,
      password: customPassword,
      name: customName || "Super Admin",
    });
  } else {
    // Seed the primary super admin requested
    await seedAdminUser({
      email: "admin.test@example.com",
      password: "AdminTest@123",
      name: "Super Admin",
    });
  }

  await mongoose.disconnect();
  console.log("Database disconnected. Seed completed successfully.");
};

main().catch((error: unknown) => {
  console.error("Failed to seed admin:", error);
  process.exit(1);
});
