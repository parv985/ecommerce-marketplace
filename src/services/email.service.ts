import nodemailer from "nodemailer";

import { env } from "../config/env.js";

type Transporter = nodemailer.Transporter;

let transporterPromise: Transporter | undefined;

/*
 * SMTP configuration: uses real SMTP when SMTP_HOST is set,
 * otherwise falls back to Ethereal test accounts for development.
 */
const isSmtpConfigured = (): boolean => {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_PORT,
  );
};

const createRealTransporter = (): Transporter => {
  console.log("[EMAIL] Creating real SMTP transporter...");

  return nodemailer.createTransport({
    host: env.SMTP_HOST!,
    port: Number(env.SMTP_PORT),
    secure: env.SMTP_SECURE === "true",
    auth: {
      user: env.SMTP_USER ?? undefined,
      pass: env.SMTP_PASS ?? undefined,
    },
    tls: {
      rejectUnauthorized: env.NODE_ENV === "production",
    },
  });
};

const createTestTransporter = async (): Promise<Transporter> => {
  console.log("[EMAIL] Creating Ethereal test account...");

  const testAccount = await nodemailer.createTestAccount();

  console.log("[EMAIL] Ethereal account created");
  console.log("[EMAIL] Test email:", testAccount.user);

  return nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
};

/*
 * Shared transporter used by every email helper in this module.
 * Uses real SMTP when configured, otherwise Ethereal test accounts.
 */
const getTransporter = async (): Promise<Transporter> => {
  if (!transporterPromise) {
    transporterPromise = isSmtpConfigured()
      ? createRealTransporter()
      : await createTestTransporter();
  }

  return transporterPromise;
};

const logDelivery = (
  email: string,
  subject: string,
  info: nodemailer.SentMessageInfo,
): void => {
  console.log("[EMAIL] Sent:", subject, "->", email);

  const previewUrl =
    nodemailer.getTestMessageUrl(info);

  if (previewUrl) {
    console.log(`[EMAIL] Preview URL:\n${previewUrl}`);
  }
};

export const sendPasswordResetEmail = async (
  email: string,
  resetUrl: string,
): Promise<void> => {
  try {
    const transporter = await getTransporter();

    console.log("[EMAIL] Sending password reset email...");
    console.log("[EMAIL] Recipient:", email);

    const info = await transporter.sendMail({
      from: env.SMTP_FROM || '"E-Commerce Marketplace" <no-reply@example.com>',
      to: email,
      subject: "Password Reset",
      text: [
        "You requested a password reset.",
        "",
        `Reset your password using this link: ${resetUrl}`,
        "",
        "This link expires in 15 minutes.",
      ].join("\n"),
    });

    logDelivery(email, "Password Reset", info);
  } catch (error) {
    console.error(
      "[EMAIL] Failed to send password reset email:",
      error,
    );

    throw error;
  }
};

/*
 * Bounded retry for email delivery (V3.10). Emails are safely
 * retryable: a duplicate email is harmless, so we retry transient
 * failures twice with backoff before giving up. Callers treat email
 * as fire-and-forget anyway - a failed email must never break the
 * business flow that triggered it.
 */
const sendWithRetry = async (
  send: () => Promise<void>,
  maxRetries = 2,
): Promise<void> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await send();
      return;
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            500 * 2 ** attempt,
          ),
        );
      }
    }
  }

  throw lastError;
};

/*
 * Generic transactional / notification email. Used by the
 * notification service for order, payment and administrative
 * notifications. Ethereal test accounts in development; the preview
 * URL is logged so emails can be inspected locally. Retried twice
 * with backoff on transient failures.
 */
export const sendNotificationEmail = async (
  email: string,
  subject: string,
  text: string,
): Promise<void> => {
  await sendWithRetry(async () => {
    const transporter = await getTransporter();

    const info = await transporter.sendMail({
      from: env.SMTP_FROM || '"E-Commerce Marketplace" <no-reply@example.com>',
      to: email,
      subject,
      text,
    });

    logDelivery(email, subject, info);
  });
};