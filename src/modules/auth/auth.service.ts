import crypto from "node:crypto";
import bcrypt from "bcryptjs";

import { env } from "../../config/env.js";
import { UserRole } from "../../constants/roles.js";
import { AppError } from "../../errors/AppError.js";
import { User } from "../../models/User.js";

import {
    generateAccessToken,
    generateRefreshToken,
} from "../../utils/jwt.js";
import { sendPasswordResetEmail } from "../../services/email.service.js";
import { hashToken } from "../../utils/tokenHash.js";

import {
    markPasswordResetTokenUsed,
    createPasswordResetToken,
    createRefreshToken,
    createUser,
    findPasswordResetToken,
    findUserByEmail,
    revokeRefreshToken
} from "./auth.repository.js";

import type {
    ForgotPasswordInput,
    LoginInput,
    RegisterInput,
    ResetPasswordInput,
} from "./auth.schema.js";


const SALT_ROUNDS = 12;

export const registerUser = async (
    input: RegisterInput,
) => {
    const existing = await findUserByEmail(input.email);

    if (existing) {
        throw new AppError(
            "Email already in use",
            409,
            "EMAIL_TAKEN",
        );
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    const user = await createUser({
        name: input.name,
        email: input.email,
        passwordHash,
    });

    return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
    };
};

export const loginUser = async (
    input: LoginInput,
) => {
    const user = await findUserByEmail(input.email);

    if (!user || !user.passwordHash) {
        throw new AppError(
            "Invalid email or password",
            401,
            "INVALID_CREDENTIALS",
        );
    }

    if (!user.isActive) {
        throw new AppError(
            "Your account is inactive",
            403,
            "ACCOUNT_INACTIVE",
        );
    }

    const isPasswordValid = await bcrypt.compare(
        input.password,
        user.passwordHash,
    );

    if (!isPasswordValid) {
        throw new AppError(
            "Invalid email or password",
            401,
            "INVALID_CREDENTIALS",
        );
    }

    const tokenId = crypto.randomUUID();

    const accessToken = generateAccessToken({
        userId: user._id.toString(),
        role: user.role,
        type: "access",
    });

    const refreshToken = generateRefreshToken({
        userId: user._id.toString(),
        role: user.role,
        type: "refresh",
        tokenId,
    });

    const refreshTokenExpiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
    );

    await createRefreshToken({
        userId: user._id.toString(),
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
    });

    return {
        accessToken,
        refreshToken,
        user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isEmailVerified,
        },
    };
};
export const logoutUser = async (
  refreshToken: string,
): Promise<void> => {
  await revokeRefreshToken(
    hashToken(refreshToken),
  );
};
export const forgotPassword = async (
  input: ForgotPasswordInput,
): Promise<void> => {
  const user = await User.findOne({
    email: input.email,
  });

  if (!user) {
    return;
  }

  const rawToken =
    crypto.randomBytes(32).toString("hex");

  const tokenHash = hashToken(rawToken);

  const expiresAt = new Date(
    Date.now() + 15 * 60 * 1000,
  );

  await createPasswordResetToken({
    userId: user._id.toString(),
    tokenHash,
    expiresAt,
  });

  const resetUrl =
    `${env.CLIENT_URL}/reset-password?token=${rawToken}`;

  await sendPasswordResetEmail(
    user.email,
    resetUrl,
  );
};

interface PasswordResetToken {
  _id: { toString(): string };
  userId: string;
}

export const resetPassword = async (
  input: ResetPasswordInput,
): Promise<void> => {
  const tokenHash = hashToken(input.token);

  const resetToken = await findPasswordResetToken(
    tokenHash,
  ) as PasswordResetToken | null;

  if (!resetToken) {
    throw new AppError(
      "Invalid or expired reset token",
      400,
      "INVALID_RESET_TOKEN",
    );
  }

  const passwordHash = await bcrypt.hash(
    input.password,
    SALT_ROUNDS,
  );

  await User.findByIdAndUpdate(
    resetToken.userId,
    {
      passwordHash,
    },
  );

  await markPasswordResetTokenUsed(
    resetToken._id.toString(),
  );
};
