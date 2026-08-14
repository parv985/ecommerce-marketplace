import { UserRole } from "../constants/roles.js";

export interface IUser {
  name: string;
  email: string;
  passwordHash?: string | null;
  role: UserRole;
  googleId?: string | null;
  authProvider?: "LOCAL" | "GOOGLE";
  avatar?: string | null;
  isEmailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}