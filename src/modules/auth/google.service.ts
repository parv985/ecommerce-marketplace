import crypto from "node:crypto";
import { google } from "googleapis";

import { UserRole } from "../../constants/roles.js";
import { AppError } from "../../errors/AppError.js";
import { User } from "../../models/User.js";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt.js";
import { hashToken } from "../../utils/tokenHash.js";
import { createRefreshToken } from "./auth.repository.js";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI;

if (!googleClientId || !googleClientSecret || !googleRedirectUri) {
  throw new Error(
    "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in .env " +
      "(and make sure GOOGLE_REDIRECT_URI matches an Authorized redirect URI in the Google Cloud console).",
  );
}

const googleClient = new google.auth.OAuth2(
  googleClientId,
  googleClientSecret,
  googleRedirectUri,
);

export const loginWithGoogle = async (idToken: string) => {
  if (!idToken) {
    throw new AppError("Google ID token is required", 400, "MISSING_TOKEN");
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      ...(googleClientId ? { audience: googleClientId } : {}),
    });
    payload = ticket.getPayload();
  } catch (error) {
    throw new AppError(
      "Invalid Google ID token",
      401,
      "INVALID_GOOGLE_TOKEN",
    );
  }

  if (!payload || !payload.email) {
    throw new AppError(
      "Google token payload missing email",
      400,
      "INVALID_GOOGLE_PAYLOAD",
    );
  }

  const { email, sub: googleId, name, picture: avatar } = payload;

  let user = await User.findOne({
    $or: [{ googleId }, { email }],
  });

  const displayName: string = name || (email ? email.split("@")[0]! : "User");

  if (user) {
    if (!user.googleId) {
      user.googleId = googleId;
      user.authProvider = "GOOGLE";
    }
    if (avatar && !user.avatarUrl) {
      user.avatarUrl = avatar;
    }
    user.isEmailVerified = true;
    user.lastLoginAt = new Date();
    await user.save();
  } else {
    user = await User.create({
      name: displayName,
      email,
      googleId,
      authProvider: "GOOGLE",
      ...(avatar ? { avatarUrl: avatar } : {}),
      isEmailVerified: true,
      role: UserRole.BUYER,
      lastLoginAt: new Date(),
    });
  }

  if (!user.isActive) {
    throw new AppError("Your account is inactive", 403, "ACCOUNT_INACTIVE");
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
      avatarUrl: user.avatarUrl ?? null,
    },
  };
};

export const handleGoogleCallback = async (code: string) => {
  if (!code) {
    throw new AppError("Authorization code is required", 400, "MISSING_CODE");
  }

  let tokens;
  try {
    const { tokens: googleTokens } = await googleClient.getToken(code);
    tokens = googleTokens;
  } catch (error) {
    throw new AppError(
      "Failed to exchange authorization code for tokens",
      401,
      "INVALID_AUTH_CODE",
    );
  }

  if (!tokens.id_token) {
    throw new AppError(
      "No ID token received from Google",
      400,
      "MISSING_ID_TOKEN",
    );
  }

  return loginWithGoogle(tokens.id_token);
};

export const getGoogleAuthUrl = (): string => {
  const scopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];
  return googleClient.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });
};

export const getGoogleAuthorizationUrl = getGoogleAuthUrl;

