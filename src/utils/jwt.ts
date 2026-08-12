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