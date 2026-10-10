import nodemailer from "nodemailer";

import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

type Transporter = nodemailer.Transporter;

let transporterPromise: Transporter | undefined;

/*
 * Email delivery supports any real inbox (Gmail, Outlook, corporate
 * mail, ...) and disposable test inboxes such as YOPmail
 * (e.g. buyer123@yopmail.com - readable at https://yopmail.com):
 * recipient addresses are never restricted by domain. To exercise
 * real delivery against YOPmail, configure a real SMTP relay via the
 * SMTP_* environment variables (development otherwise falls back to
 * Ethereal, whose messages are only previewable via the logged URL
 * and are never actually delivered to an external inbox).
 */

/*
 * Pragmatic address check used before anything is handed to SMTP.
 * Deliberately permissive: it rejects structurally broken input
 * (missing "@", spaces, a domain without a dot, injected header/
 * recipient lists) and accepts every real mailbox, including the
 * disposable test inboxes used for manual verification. Final
 * deliverability is the relay's decision, and a rejection there is
 * reported back through the notification's emailStatus.
 */
const EMAIL_SHAPE = /^[^\s@,;<>()[\]\\]+@[^\s@,;<>()[\]\\.]+(\.[^\s@,;<>()[\]\\.]+)+$/;

export const isValidEmailAddress = (
  value: unknown,
): value is string => {
  if (typeof value !== "string") {
    return false;
  }

  const candidate = value.trim();

  return (
    candidate.length > 0 &&
    candidate.length <= 320 &&
    EMAIL_SHAPE.test(candidate)
  );
};

/*
 * Minimal escaping so a notification body (seller-authored text) can
 * never inject markup into the HTML alternative part.
 */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const toHtml = (text: string): string =>
  `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#191816">` +
  text
    .split(/\r?\n/)
    .map(
      (line) =>
        `<p style="margin:0 0 12px">${escapeHtml(line) || "&nbsp;"}</p>`,
    )
    .join("") +
  `</div>`;


/*
 * SMTP configuration: uses real SMTP when SMTP_HOST is set,
 * otherwise falls back to Ethereal test accounts for development.
 */
const isSmtpConfigured = (): boolean => {
  /*
   * Read the validated config rather than process.env: SMTP_PORT has a
   * default, so "a host is set" is the whole signal that a real relay was
   * configured (and the port came from the fallback).
   */
  return Boolean(env.SMTP_HOST && env.SMTP_PORT);
};

/*
 * The integration test suite must never touch a real (or Ethereal)
 * SMTP server: tests mock this module when they assert on email
 * behavior. Unmocked calls are logged no-ops in the test environment.
 */
const isDeliveryDisabled = (): boolean =>
  process.env.NODE_ENV === "test";

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

  /*
   * Ethereal swallows messages: they are only readable through the logged
   * preview URL and never reach a real inbox. That is the right default
   * for local development and a serious trap in production, where buyers
   * would silently stop receiving their notification emails.
   */
  if (env.NODE_ENV === "production") {
    console.warn(
      "[EMAIL] SMTP_HOST is not configured in production: notification "
      + "emails will NOT be delivered. Set SMTP_HOST/SMTP_PORT/SMTP_USER/"
      + "SMTP_PASS to the real provider (e.g. smtp.gmail.com:465).",
    );
  }

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

  /*
   * The provider message id is the only handle that lets a support
   * request be traced in the relay's own logs, so it is logged
   * alongside the recipient (never the credentials).
   */
  if (info?.messageId) {
    console.log("[EMAIL] Provider message id:", info.messageId);
  }

  const previewUrl =
    nodemailer.getTestMessageUrl(info);

  if (previewUrl) {
    console.log(`[EMAIL] Preview URL:\n${previewUrl}`);
  }
};

/*
 * Some relays answer 250 for the DATA phase and only then refuse the
 * single recipient - nodemailer reports that in `info.rejected`
 * without throwing. Treat it as a failure so the notification's
 * emailStatus reflects reality instead of a false SENT.
 */
const assertAccepted = (
  info: nodemailer.SentMessageInfo,
  email: string,
): void => {
  const rejected = Array.isArray(info?.rejected)
    ? info.rejected
    : [];

  if (rejected.length === 0) {
    return;
  }

  throw new AppError(
    `Email recipient rejected by the mail relay: ${rejected.join(", ")}`,
    502,
    "EMAIL_RECIPIENT_REJECTED",
  );
};

export const sendPasswordResetEmail = async (
  email: string,
  resetUrl: string,
): Promise<void> => {
  if (isDeliveryDisabled()) {
    console.log(
      "[EMAIL] Test environment - password reset email skipped:",
      email,
    );

    return;
  }

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
 * notification service for order, payment, seller and administrative
 * notifications. Ethereal test accounts in development; the preview
 * URL is logged so emails can be inspected locally. Real SMTP (and
 * therefore delivery to any real inbox or YOPmail) when SMTP_HOST is
 * configured. Retried twice with backoff on transient failures.
 *
 * Callers persist the in-app notification BEFORE calling this and
 * treat delivery as fire-and-forget - a failed email must never break
 * the business flow that triggered it.
 */
export const sendNotificationEmail = async (
  email: string,
  subject: string,
  text: string,
): Promise<void> => {
  /*
   * Validated here as the last line of defence: every caller resolves
   * the address from the recipient's registered account, so an invalid
   * value means the stored profile is unusable. Throwing (instead of
   * silently dropping) is what lets the notification record mark the
   * copy INVALID_ADDRESS / FAILED rather than pretending it went out.
   */
  if (!isValidEmailAddress(email)) {
    console.warn(
      "[EMAIL] Refusing to send - recipient address is not deliverable:",
      subject,
    );

    throw new AppError(
      "The recipient does not have a valid email address",
      400,
      "INVALID_EMAIL_ADDRESS",
    );
  }

  const recipient = email.trim();

  if (isDeliveryDisabled()) {
    console.log(
      "[EMAIL] Test environment - notification email skipped:",
      subject,
      "->",
      recipient,
    );

    return;
  }

  /*
   * The footer points back at the in-app list, which is the same content:
   * the email is a mirror of the notification, not a second message.
   */
  const body = [
    text,
    "",
    "- E-Commerce Marketplace",
    env.CLIENT_URL
      ? `View all your notifications: ${env.CLIENT_URL.replace(/\/+$/, "")}/notifications`
      : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  await sendWithRetry(async () => {
    const transporter = await getTransporter();

    const info = await transporter.sendMail({
      from:
        env.SMTP_FROM || '"E-Commerce Marketplace" <no-reply@example.com>',
      to: recipient,
      subject,
      text: body,
      html: toHtml(body),
    });

    assertAccepted(info, recipient);

    logDelivery(recipient, subject, info);
  });
};