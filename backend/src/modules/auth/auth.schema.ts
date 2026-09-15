import { z } from "zod";

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters"),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address"),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters"),
});
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address"),

  password: z
    .string()
    .min(1, "Password is required"),
});
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address"),
});

export type ForgotPasswordInput =
  z.infer<typeof forgotPasswordSchema>;
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),

    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must not exceed 128 characters"),

    confirmPassword: z.string(),
  })
  .refine(
    (data) => data.password === data.confirmPassword,
    {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    },
  );

export type ResetPasswordInput =
  z.infer<typeof resetPasswordSchema>;

export const googleLoginSchema = z.object({
  idToken: z.string().min(1, "Google ID token is required"),
});

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

/*
 * Completes a login for a 2FA-enabled seller/admin: the loginToken
 * proves the password step, the code proves possession of the
 * authenticator app or a recovery code.
 */
export const twoFactorVerifySchema = z
  .object({
    loginToken: z
      .string()
      .min(1, "loginToken is required"),
    code: z
      .string()
      .trim()
      .min(1, "Verification code is required"),
  })
  .strict();

export type TwoFactorVerifyInput =
  z.infer<typeof twoFactorVerifySchema>;

export const twoFactorCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Verification code is required"),
  })
  .strict();

export type TwoFactorCodeInput =
  z.infer<typeof twoFactorCodeSchema>;