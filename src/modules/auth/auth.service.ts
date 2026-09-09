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
import { logAudit } from "../../services/audit.service.js";
import { hashToken } from "../../utils/tokenHash.js";

import {
    markPasswordResetTokenUsed,
    createPasswordResetToken,
    createRefreshToken,
    createUser,
    findPasswordResetToken,
    findUserByEmail,
    findUserById,
    findUserForTwoFactor,
    revokeRefreshToken
} from "./auth.repository.js";

import type {
    ForgotPasswordInput,
    LoginInput,
    RegisterInput,
    ResetPasswordInput,
    TwoFactorVerifyInput,
    TwoFactorCodeInput,
} from "./auth.schema.js";

import {
    generateTwoFactorToken,
    verifyTwoFactorToken,
    type TwoFactorPendingPayload,
} from "../../utils/jwt.js";
import {
    generateTotpSecret,
    generateTotpCode,
    verifyTotpCode,
    buildOtpauthUrl,
} from "../../utils/totp.js";
import {
    encryptSecret,
    decryptSecret,
} from "../../utils/secretCipher.js";
import type { UserDocument } from "../../models/User.js";
import { twoFactorCodeSchema } from "./auth.schema.js";


const SALT_ROUNDS = 12;

/*
 * Safe alphabet for recovery codes: uppercase letters and digits with
 * confusable characters (0/O, 1/I) removed so codes can be typed by
 * hand without errors.
 */
const RECOVERY_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateRecoveryCode = (): string => {
  const groups: string[] = [];

  for (let group = 0; group < 4; group += 1) {
    let chars = "";

    for (let i = 0; i < 4; i += 1) {
      chars +=
        RECOVERY_ALPHABET[
          crypto.randomInt(
            RECOVERY_ALPHABET.length,
          )
        ];
    }

    groups.push(chars);
  }

  return groups.join("-");
};

const generateRecoveryCodes = (
  count = 8,
): string[] =>
  Array.from(
    { length: count },
    () => generateRecoveryCode(),
  );

const normalizeRecoveryCode = (
  code: string,
): string =>
  code
    .toUpperCase()
    .replace(/[\s-]/g, "");

/*
 * Consumes a recovery code atomically. Returns true only when the
 * code existed and was removed in the same update, so two concurrent
 * requests can never both use the same code.
 */
const consumeRecoveryCode = async (
  user: UserDocument,
  rawCode: string,
): Promise<boolean> => {
  const normalized =
    normalizeRecoveryCode(rawCode);

  const result = await User.updateOne(
    {
      _id: user._id,
      recoveryCodes: hashToken(normalized),
    },
    {
      $pull: {
        recoveryCodes: hashToken(normalized),
      },
    },
  );

  return result.modifiedCount > 0;
};

/*
 * Issues access + refresh tokens and persists the refresh token. Used
 * by the normal login path and by the 2FA completion step - the two
 * flows must mint sessions identically.
 */
const issueSession = async (
  user: UserDocument,
) => {
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

  await createRefreshToken({
    userId: user._id.toString(),
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ),
  });

  /*
   * Audit every issued session (direct login and 2FA-completed
   * login). Never includes the tokens themselves.
   */
  await logAudit({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: "LOGIN",
    entityType: "USER",
    entityId: user._id.toString(),
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
      /*
       * Included so the frontend can show the saved profile photo
       * immediately after login (it persists in the database even
       * after logout) and knows the account status up front.
       */
      avatarUrl: user.avatarUrl ?? null,
      isActive: user.isActive,
    },
  };
};

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
        avatarUrl: user.avatarUrl ?? null,
        isActive: user.isActive,
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

    /*
     * Two-step login for sellers and admins with 2FA enabled: the
     * password step returns a short-lived login token instead of real
     * tokens. Only POST /auth/2fa/verify (TOTP or recovery code)
     * converts it into access/refresh tokens. Buyer accounts keep the
     * single-step flow.
     */
    if (
      user.twoFactorEnabled &&
      (user.role === UserRole.SELLER ||
        user.role === UserRole.SUPER_ADMIN)
    ) {
      const loginToken = generateTwoFactorToken({
        userId: user._id.toString(),
        role: user.role,
        type: "2fa_pending",
      });

      return {
        twoFactorRequired: true,
        loginToken,
      };
    }

    return issueSession(user);
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

/*
 * ---------------------------------------------------------------------
 * Two-factor authentication (TOTP) for sellers and admins
 * ---------------------------------------------------------------------
 */

/*
 * Completes a two-step login. Verifies the login token (proves the
 * password step) and then the TOTP code OR a recovery code. Recovery
 * codes are single-use and consumed atomically.
 */
export const verifyTwoFactorLogin = async (
  input: TwoFactorVerifyInput,
) => {
  let payload: TwoFactorPendingPayload;

  try {
    payload = verifyTwoFactorToken(
      input.loginToken,
    );
  } catch {
    throw new AppError(
      "Invalid or expired login token",
      401,
      "INVALID_LOGIN_TOKEN",
    );
  }

  const user =
    await findUserForTwoFactor(
      payload.userId,
    );

  if (!user || !user.isActive) {
    throw new AppError(
      "Invalid login token",
      401,
      "INVALID_LOGIN_TOKEN",
    );
  }

  if (
    !user.twoFactorEnabled ||
    !user.twoFactorSecretEncrypted
  ) {
    throw new AppError(
      "Two-factor authentication is not enabled for this account",
      400,
      "TWO_FACTOR_NOT_ENABLED",
    );
  }

  /*
   * Recovery codes are tried first (they are single-use; the atomic
   * consume ensures a code can never be replayed).
   */
  if (await consumeRecoveryCode(user, input.code)) {
    return issueSession(user);
  }

  const secret = decryptSecret(
    user.twoFactorSecretEncrypted,
  );

  if (!verifyTotpCode(secret, input.code)) {
    throw new AppError(
      "Invalid verification code",
      401,
      "INVALID_TWO_FACTOR_CODE",
    );
  }

  return issueSession(user);
};

/*
 * Generates a new TOTP secret and recovery codes. The secret is
 * encrypted at rest and returned in plain text exactly once, together
 * with the otpauth:// URL the frontend renders as a QR code. 2FA is
 * not active until enableTwoFactor confirms a code.
 */
export const setupTwoFactor = async (
  userId: string,
) => {
  const user = await findUserById(userId);

  if (!user) {
    throw new AppError(
      "User not found",
      404,
      "USER_NOT_FOUND",
    );
  }

  if (user.twoFactorEnabled) {
    throw new AppError(
      "Two-factor authentication is already enabled. Disable it first to rotate the secret.",
      409,
      "TWO_FACTOR_ALREADY_ENABLED",
    );
  }

  const secret = generateTotpSecret();
  const recoveryCodes =
    generateRecoveryCodes();

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        twoFactorSecretEncrypted:
          encryptSecret(secret),
        /*
         * Codes are normalized (dashes stripped) before hashing so
         * the hash matches the verification path exactly.
         */
        recoveryCodes: recoveryCodes.map(
          (code) =>
            hashToken(
              normalizeRecoveryCode(code),
            ),
        ),
        twoFactorEnabled: false,
      },
    },
  );

  return {
    secret,
    otpauthUrl: buildOtpauthUrl(
      secret,
      user.email,
    ),
    recoveryCodes,
  };
};

/*
 * Activates 2FA after the user confirms they can generate codes with
 * their authenticator app. Idempotent when already enabled.
 */
export const enableTwoFactor = async (
  userId: string,
  input: unknown,
) => {
  const data: TwoFactorCodeInput =
    twoFactorCodeSchema.parse(input);

  const user =
    await findUserForTwoFactor(userId);

  if (!user) {
    throw new AppError(
      "User not found",
      404,
      "USER_NOT_FOUND",
    );
  }

  if (user.twoFactorEnabled) {
    return { enabled: true };
  }

  if (!user.twoFactorSecretEncrypted) {
    throw new AppError(
      "Run the 2FA setup first",
      400,
      "TWO_FACTOR_SETUP_REQUIRED",
    );
  }

  const secret = decryptSecret(
    user.twoFactorSecretEncrypted,
  );

  if (!verifyTotpCode(secret, data.code)) {
    throw new AppError(
      "Invalid verification code",
      400,
      "INVALID_TWO_FACTOR_CODE",
    );
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { twoFactorEnabled: true } },
  );

  return { enabled: true };
};

/*
 * Disables 2FA. Requires a valid TOTP code or a recovery code so a
 * stolen session cannot silently strip the account's protection.
 * Clears the stored secret and all recovery codes.
 */
export const disableTwoFactor = async (
  userId: string,
  input: unknown,
) => {
  const data: TwoFactorCodeInput =
    twoFactorCodeSchema.parse(input);

  const user =
    await findUserForTwoFactor(userId);

  if (!user) {
    throw new AppError(
      "User not found",
      404,
      "USER_NOT_FOUND",
    );
  }

  if (!user.twoFactorEnabled) {
    throw new AppError(
      "Two-factor authentication is not enabled",
      400,
      "TWO_FACTOR_NOT_ENABLED",
    );
  }

  const viaRecovery = await consumeRecoveryCode(
    user,
    data.code,
  );

  const secretValid =
    !viaRecovery &&
    user.twoFactorSecretEncrypted
      ? verifyTotpCode(
          decryptSecret(
            user.twoFactorSecretEncrypted,
          ),
          data.code,
        )
      : false;

  if (!viaRecovery && !secretValid) {
    throw new AppError(
      "Invalid verification code",
      400,
      "INVALID_TWO_FACTOR_CODE",
    );
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        twoFactorEnabled: false,
        twoFactorSecretEncrypted: null,
        recoveryCodes: [],
      },
    },
  );

  return { disabled: true };
};

/*
 * Rotates the recovery codes. Requires a TOTP code (never a recovery
 * code) so a lost authenticator cannot be leveraged to mint new
 * recovery codes.
 */
export const regenerateRecoveryCodes = async (
  userId: string,
  input: unknown,
) => {
  const data: TwoFactorCodeInput =
    twoFactorCodeSchema.parse(input);

  const user =
    await findUserForTwoFactor(userId);

  if (!user) {
    throw new AppError(
      "User not found",
      404,
      "USER_NOT_FOUND",
    );
  }

  if (
    !user.twoFactorEnabled ||
    !user.twoFactorSecretEncrypted
  ) {
    throw new AppError(
      "Two-factor authentication is not enabled",
      400,
      "TWO_FACTOR_NOT_ENABLED",
    );
  }

  if (
    !verifyTotpCode(
      decryptSecret(
        user.twoFactorSecretEncrypted,
      ),
      data.code,
    )
  ) {
    throw new AppError(
      "Invalid verification code",
      400,
      "INVALID_TWO_FACTOR_CODE",
    );
  }

  const recoveryCodes =
    generateRecoveryCodes();

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        recoveryCodes: recoveryCodes.map(
          (code) =>
            hashToken(
              normalizeRecoveryCode(code),
            ),
        ),
      },
    },
  );

  return { recoveryCodes };
};

