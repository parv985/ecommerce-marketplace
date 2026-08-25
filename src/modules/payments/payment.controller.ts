import type { Request, Response } from "express";

import {
  initiatePayment,
  processPaymentWebhook,
  refundOrderPayment,
  verifyOrderPayment,
} from "./payment.service.js";

export const initiatePaymentController = async (
  req: Request<{ orderId: string }>,
  res: Response,
): Promise<void> => {
  const payment = await initiatePayment(
    req.user!,
    req.params.orderId,
  );

  res.status(201).json({
    success: true,
    message: "Payment initiated successfully",
    data: payment,
  });
};

export const verifyPaymentController = async (
  req: Request<{ orderId: string }>,
  res: Response,
): Promise<void> => {
  const payment = await verifyOrderPayment(
    req.user!,
    req.params.orderId,
    req.body,
  );

  res.status(200).json({
    success: true,
    message: "Payment verified successfully",
    data: payment,
  });
};

export const refundOrderPaymentController =
  async (
    req: Request<{ orderId: string }>,
    res: Response,
  ): Promise<void> => {
    const payment = await refundOrderPayment(
      req.user!,
      req.params.orderId,
    );

    res.status(200).json({
      success: true,
      message: "Refund issued successfully",
      data: payment,
    });
  };

/*
 * Public webhook endpoint. Authentication would break signature
 * verification, so this route is intentionally unauthenticated - the
 * x-razorpay-signature header IS the authentication.
 */
export const razorpayWebhookController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const rawBody =
    (
      req as Request & {
        rawBody?: Buffer;
      }
    ).rawBody?.toString("utf8") ?? "";

  const signature =
    (req.headers[
      "x-razorpay-signature"
    ] as string | undefined) ?? "";

  const result = await processPaymentWebhook({
    rawBody,
    signature,
  });

  res.status(200).json({
    success: true,
    data: result,
  });
};
