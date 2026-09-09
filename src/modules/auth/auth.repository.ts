import { User, type UserDocument } from "../../models/User.js";
import { RefreshToken } from "../../models/RefreshToken.js";

import {
  PasswordResetToken,
} from "../../models/PasswordResetToken.js";
export const findUserByEmail = async (
  email: string,
): Promise<UserDocument | null> => {
  return User.findOne({ email }).select("+passwordHash").exec();
};

export const findUserById = async (
  userId: string,
): Promise<UserDocument | null> => {
  return User.findById(userId).exec();
};

/*
 * Minimal projection used by the authenticate middleware on every
 * request: just enough to re-check the role and the active flag that
 * a Super Admin may have flipped since the access token was minted.
 */
export const findUserForAuth = async (
  userId: string,
): Promise<UserDocument | null> => {
  return User.findById(userId)
    .select("role isActive")
    .exec();
};

/*
 * Revokes every live refresh token of a user. Called when a Super
 * Admin deactivates an account so the user cannot mint new access
 * tokens from an existing session.
 */
export const revokeAllRefreshTokensForUser = async (
  userId: string,
): Promise<void> => {
  await RefreshToken.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
};

/*
 * Loads the select:false 2FA fields (encrypted secret, recovery code
 * hashes) - only called from the 2FA service functions.
 */
export const findUserForTwoFactor = async (
  userId: string,
): Promise<UserDocument | null> => {
  return User.findById(userId)
    .select(
      "+twoFactorSecretEncrypted +recoveryCodes",
    )
    .exec();
};

export const createUser = async (data: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<UserDocument> => {
  return User.create(data);
};
export const createRefreshToken = async (data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) => {
  return RefreshToken.create({
    userId: data.userId,
    tokenHash: data.tokenHash,
    expiresAt: data.expiresAt,
  });
};

export const consumeRefreshToken = async (
  tokenHash: string,
) => {
  return RefreshToken.findOneAndUpdate(
    {
      tokenHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: {
        revokedAt: new Date(),
      },
    },
    {
      new: false,
    },
  ).exec();
};
export const revokeRefreshToken = async (
  tokenHash: string,
) => {
  return RefreshToken.findOneAndUpdate(
    {
      tokenHash,
      revokedAt: null,
    },
    {
      $set: {
        revokedAt: new Date(),
      },
    },
  ).exec();
};

export const createPasswordResetToken = async (
  data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  },
) => {
  return PasswordResetToken.create({
    userId: data.userId,
    tokenHash: data.tokenHash,
    expiresAt: data.expiresAt,
  });
};

export const findPasswordResetToken = async (
  tokenHash: string,
) => {
  return PasswordResetToken.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).exec();
};

export const markPasswordResetTokenUsed =
  async (tokenId: string) => {
    return PasswordResetToken.findByIdAndUpdate(
      tokenId,
      {
        usedAt: new Date(),
      },
    ).exec();
  };