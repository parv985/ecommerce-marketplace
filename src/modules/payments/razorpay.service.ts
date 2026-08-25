import crypto from "crypto";

import { env } from "../../config/env.js";
import { AppError } from "../../errors/AppError.js";
import {
  PaymentGateway,
  RefundStatus,
} from "../../constants/payment.js";

/*
 * Gateway abstraction with two modes:
 *
 *  - RAZORPAY: real REST calls to Razorpay's API (key id/secret from
 *    the environment). Implemented with the native fetch + crypto
 *    HMAC instead of the SDK so no extra dependency is required.
 *  - MOCK: deterministic development/test mode used when no Razorpay
 *    credentials are configured. Signatures are computed over the same
 *    format Razorpay uses, but with a fixed dev-only secret, so the
 *    full server-side verification code path is exercised without
 *    real money. The mock secret is a fixture - never a production
 *    credential - and is documented in tests and Swagger.
 *
 * Client-supplied payment status is never trusted: the server always
 * re-derives the HMAC signature itself.
 */

const MOCK_SIGNING_SECRET =
  "mock-payment-signing-secret";

export const isRazorpayConfigured = (): boolean =>
  Boolean(
    env.RAZORPAY_KEY_ID &&
      env.RAZORPAY_KEY_SECRET,
  );

export const getGatewayMode = (): PaymentGateway =>
  isRazorpayConfigured()
    ? PaymentGateway.RAZORPAY
    : PaymentGateway.MOCK;

const razorpayFetch = async (
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> => {
  const res = await fetch(
    `https://api.razorpay.com${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
        ).toString("base64")}`,
        ...(init.headers ?? {}),
      },
    },
  );

  if (!res.ok) {
    /*
     * Never forward the provider's response body (it may contain
     * internal details); only the status class is surfaced.
     */
    throw new AppError(
      "Payment gateway error, please try again",
      502,
      "PAYMENT_GATEWAY_ERROR",
    );
  }

  return (await res.json()) as Record<
    string,
    unknown
  >;
};

const safeEqual = (
  a: string,
  b: string,
): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
};

export interface GatewayOrder {
  id: string;
  /* Amount in paise (Razorpay's unit). */
  amount: number;
  currency: string;
}

/*
 * Creates a payment order at the gateway for the exact order total.
 * Amounts are always derived server-side from the order document.
 */
export const createGatewayOrder = async (
  input: {
    /* Amount in rupees. */
    amount: number;
    receipt: string;
    notes?: Record<string, string>;
  },
): Promise<GatewayOrder> => {
  const amountPaise = Math.round(
    input.amount * 100,
  );

  if (
    getGatewayMode() === PaymentGateway.MOCK
  ) {
    return {
      id: `mock_order_${crypto
        .randomBytes(8)
        .toString("hex")}`,
      amount: amountPaise,
      currency: "INR",
    };
  }

  const data = await razorpayFetch(
    "/v1/orders",
    {
      method: "POST",
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: input.receipt,
        notes: input.notes ?? {},
      }),
    },
  );

  return {
    id: data.id as string,
    amount: data.amount as number,
    currency: data.currency as string,
  };
};

/*
 * Verifies the signature returned by the Razorpay checkout widget
 * (razorpay_signature). The payload signed is
 * "<gatewayOrderId>|<paymentId>" with the key secret. In mock mode
 * the same format is used with the fixture secret.
 */
export const verifyClientPaymentSignature =
  (input: {
    gatewayOrderId: string;
    paymentId: string;
    signature: string;
  }): boolean => {
    /*
     * Real mode is only reachable when the key secret is configured;
     * the fallback empty string makes the signature mismatch safely
     * instead of crashing.
     */
    const secret =
      getGatewayMode() === PaymentGateway.MOCK
        ? MOCK_SIGNING_SECRET
        : (env.RAZORPAY_KEY_SECRET ?? "");

    const expected = crypto
      .createHmac("sha256", secret)
      .update(
        `${input.gatewayOrderId}|${input.paymentId}`,
      )
      .digest("hex");

    return safeEqual(expected, input.signature);
  };

/*
 * Verifies the x-razorpay-signature header over the RAW webhook body
 * with the webhook secret. In mock mode the fixture secret is used so
 * the verification path runs end-to-end in development and tests.
 */
export const verifyWebhookSignature = (
  rawBody: string,
  signature: string,
): boolean => {
  const secret =
    env.RAZORPAY_WEBHOOK_SECRET ||
    (getGatewayMode() === PaymentGateway.MOCK
      ? MOCK_SIGNING_SECRET
      : "");

  if (!secret) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return safeEqual(expected, signature);
};

export interface GatewayRefund {
  id: string;
  status: RefundStatus;
}

/*
 * Requests a refund for the full paid amount. Razorpay refunds are
 * asynchronous (PENDING until the refund.processed webhook); the mock
 * gateway completes them immediately.
 */
export const createGatewayRefund = async (
  input: {
    paymentId: string;
    /* Amount in rupees. */
    amount: number;
    notes?: Record<string, string>;
  },
): Promise<GatewayRefund> => {
  if (
    getGatewayMode() === PaymentGateway.MOCK
  ) {
    return {
      id: `mock_refund_${crypto
        .randomBytes(8)
        .toString("hex")}`,
      status: RefundStatus.PROCESSED,
    };
  }

  const data = await razorpayFetch(
    `/v1/payments/${input.paymentId}/refunds`,
    {
      method: "POST",
      body: JSON.stringify({
        amount: Math.round(input.amount * 100),
        notes: input.notes ?? {},
      }),
    },
  );

  return {
    id: data.id as string,
    status: RefundStatus.PENDING,
  };
};
