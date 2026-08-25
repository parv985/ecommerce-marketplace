import { UserRole } from "../constants/roles.js";

export interface IUser {
  name: string;
  email: string;
  passwordHash?: string | null;
  role: UserRole;
  googleId?: string | null;
  authProvider?: "LOCAL" | "GOOGLE";
  avatarUrl?: string | null;
  avatarPublicId?: string | null;
  isEmailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date | null;

  /*
   * TOTP 2FA for sellers and admins. The secret is encrypted at rest
   * (AES-256-GCM) and never returned by any API. Recovery codes are
   * stored hashed and shown in plain text exactly once at setup.
   */
  twoFactorEnabled?: boolean;
  twoFactorSecretEncrypted?: string | null;
  recoveryCodes?: string[];
  createdAt: Date;
  updatedAt: Date;
}