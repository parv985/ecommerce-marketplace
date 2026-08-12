import { UserRole } from "../constants/roles.js";

export interface IUser {
  name: string;
  email: string;
  passwordHash?: string;
  role: UserRole;
  googleId?: string;
  avatar?: string;
  isEmailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}