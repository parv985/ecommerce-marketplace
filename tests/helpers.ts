import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import request from "supertest";

import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { UserRole } from "../src/constants/roles.js";

export const api = request(app);

const PASSWORD = "Password123!";

export const connect = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI!);

    /*
     * Build indexes (unique constraints, etc.) before assertions run
     * so duplicate-key behavior is deterministic.
     */
    await Promise.all(
      Object.values(mongoose.models).map(
        (model) => model.init(),
      ),
    );
  }
};

export const disconnect = async (): Promise<void> => {
  await mongoose.disconnect();
};

export const clearDb = async (): Promise<void> => {
  const collections =
    mongoose.connection.collections;

  await Promise.all(
    Object.values(collections).map((collection) =>
      collection.deleteMany({}),
    ),
  );
};

export const registerUser = (
  email: string,
  name = "Test User",
) => {
  return api.post("/api/v1/auth/register").send({
    name,
    email,
    password: PASSWORD,
  });
};

export const login = async (
  email: string,
): Promise<{ token: string; cookie: string }> => {
  const res = await api
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });

  const token =
    res.body?.data?.accessToken as string;

  const cookie =
    res.headers["set-cookie"]?.[0]?.split(";")[0] ??
    "";

  return { token, cookie };
};

let uniqueCounter = 0;

/*
 * Returns 4 numeric characters unique enough per run to satisfy the
 * GSTIN/PAN unique constraints without colliding across tests.
 */
const uniqueDigits = (): string => {
  uniqueCounter += 1;
  return String(
    (Date.now() + uniqueCounter) % 10000,
  ).padStart(4, "0");
};

export const registerSeller = (
  email: string,
  letters = "ABCDE",
  digits?: string,
) => {
  const d = digits ?? uniqueDigits();

  return api.post("/api/v1/sellers/register").send({
    name: "Test Seller",
    email,
    password: PASSWORD,
    businessName: "Test Traders",
    gstin: `27${letters}${d}F1ZV`,
    pan: `${letters}${d}F`,
    bankAccountHolderName: "Test Seller",
    bankAccountNumber: "123456789012",
    ifscCode: "HDFC0001234",
    addressLine1: "1 Main Road",
    city: "Pune",
    state: "MH",
    pincode: "411001",
  });
};

export const createAdmin = async (): Promise<void> => {
  const passwordHash = await bcrypt.hash(
    "Admin@1234",
    10,
  );

  await User.create({
    name: "Test Admin",
    email: `admin${Date.now()}@test.com`,
    passwordHash,
    role: UserRole.SUPER_ADMIN,
    isEmailVerified: true,
    isActive: true,
  });
};

export const adminLogin = async (): Promise<string> => {
  const email = `admin${Date.now()}@test.com`;
  const passwordHash = await bcrypt.hash(
    "Admin@1234",
    10,
  );

  await User.create({
    name: "Test Admin",
    email,
    passwordHash,
    role: UserRole.SUPER_ADMIN,
    isEmailVerified: true,
    isActive: true,
  });

  const res = await api
    .post("/api/v1/auth/login")
    .send({ email, password: "Admin@1234" });

  return res.body?.data?.accessToken as string;
};

export const createApprovedSeller = async (): Promise<{
  email: string;
  token: string;
  profileId: string;
}> => {
  const email = `seller${Date.now()}@test.com`;
  await registerSeller(email);
  const adminToken = await adminLogin();

  const loginRes = await api
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });

  const token =
    loginRes.body?.data?.accessToken as string;

  const sellers = await api
    .get("/api/v1/admin/sellers?status=PENDING")
    .set("Authorization", `Bearer ${adminToken}`);

  const seller = (
    sellers.body.data.items as Array<{
      id: string;
      email?: string;
    }>
  ).find((item) => item.id);

  const profileId = seller!.id;

  await api
    .patch(
      `/api/v1/admin/sellers/${profileId}/status`,
    )
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ status: "APPROVED" });

  return { email, token, profileId };
};

export const createProduct = (
  token: string,
  overrides: Record<string, unknown> = {},
) => {
  return api
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Test Product",
      price: 100,
      stock: 10,
      ...overrides,
    });
};

export const createAddress = async (
  token: string,
): Promise<string> => {
  const res = await api
    .post("/api/v1/users/me/addresses")
    .set("Authorization", `Bearer ${token}`)
    .send({
      recipientName: "Test Buyer",
      phone: "9876543210",
      addressLine1: "10 Lake View",
      city: "Pune",
      state: "MH",
      pincode: "411001",
    });

  return res.body.data.id as string;
};
