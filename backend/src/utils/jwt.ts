import jwt, {
  type JwtPayload,
  type SignOptions,
} from "jsonwebtoken";

import { env } from "../config/env.js";
import { UserRole } from "../constants/roles.js";

export interface AccessTokenPayload {
  userId: string;
  role: UserRole;
  type: "access";
}

export interface RefreshTokenPayload {
  userId: string;
  role: UserRole;
  type: "refresh";
  tokenId: string;
}

/*
 * Short-lived proof that the password was verified but 2FA is still
 * required. Issued by login, consumed by POST /auth/2fa/verify.
 * Never grants access on its own - only the 2FA step converts it
 * into real access/refresh tokens.
 */
export interface TwoFactorPendingPayload {
  userId: string;
  role: UserRole;
  type: "2fa_pending";
}

export const generateAccessToken = (
  payload: AccessTokenPayload,
): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as Exclude<SignOptions["expiresIn"], undefined>,
  };

  return jwt.sign(
    payload,
    env.JWT_ACCESS_SECRET as jwt.Secret,
    options,
  );
};

export const generateRefreshToken = (
  payload: RefreshTokenPayload,
): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as Exclude<SignOptions["expiresIn"], undefined>,
  };

  return jwt.sign(
    payload,
    env.JWT_REFRESH_SECRET as jwt.Secret,
    options,
  );
};

export const generateTwoFactorToken = (
  payload: TwoFactorPendingPayload,
): string => {
  return jwt.sign(
    payload,
    env.JWT_ACCESS_SECRET as jwt.Secret,
    { expiresIn: "5m" },
  );
};

export const verifyTwoFactorToken = (
  token: string,
): TwoFactorPendingPayload => {
  const decoded = jwt.verify(
    token,
    env.JWT_ACCESS_SECRET,
  ) as JwtPayload;

  if (
    typeof decoded.userId !== "string" ||
    typeof decoded.role !== "string" ||
    decoded.type !== "2fa_pending"
  ) {
    throw new Error("Invalid 2FA token payload");
  }

  return {
    userId: decoded.userId,
    role: decoded.role as UserRole,
    type: "2fa_pending",
  };
};

export const verifyAccessToken = (
  token: string,
): AccessTokenPayload => {
  const decoded = jwt.verify(
    token,
    env.JWT_ACCESS_SECRET,
  ) as JwtPayload;

  if (
    typeof decoded.userId !== "string" ||
    typeof decoded.role !== "string" ||
    decoded.type !== "access"
  ) {
    throw new Error("Invalid access token payload");
  }

  return {
    userId: decoded.userId,
    role: decoded.role as UserRole,
    type: "access",
  };
};

export const verifyRefreshToken = (
  token: string,
): RefreshTokenPayload => {
  const decoded = jwt.verify(
    token,
    env.JWT_REFRESH_SECRET,
  ) as JwtPayload;

  if (
    typeof decoded.userId !== "string" ||
    typeof decoded.role !== "string" ||
    typeof decoded.type !== "string" ||
    typeof decoded.tokenId !== "string" ||
    decoded.type !== "refresh"
  ) {
    throw new Error("Invalid refresh token payload");
  }

  return {
    userId: decoded.userId,
    role: decoded.role as UserRole,
    type: "refresh",
    tokenId: decoded.tokenId,
  };
};