import { Schema, model, type HydratedDocument } from "mongoose";
import { UserRole } from "../constants/roles.js";
import type { IUser } from "../types/user.types.js";

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    passwordHash: {
      type: String,
      select: false,
    },

    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.BUYER,
      required: true,
      index: true,
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    authProvider: {
      type: String,
      enum: ["LOCAL", "GOOGLE"],
      default: "LOCAL",
    },

    avatarUrl: {
      type: String,
    },

    avatarPublicId: {
      type: String,
      select: false,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastLoginAt: {
      type: Date,
    },

    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },

    /*
     * Encrypted at rest (see src/utils/secretCipher.ts). select:false
     * keeps it out of every response unless explicitly requested.
     */
    twoFactorSecretEncrypted: {
      type: String,
      select: false,
      default: null,
    },

    /* Hashed recovery codes (never the raw values). */
    recoveryCodes: {
      type: [String],
      select: false,
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export type UserDocument = HydratedDocument<IUser>;

export const User = model<IUser>("User", userSchema);