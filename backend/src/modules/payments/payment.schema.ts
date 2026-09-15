import { z } from "zod";

const objectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ObjectId",
  );

export const paymentOrderIdParamsSchema = z
  .object({
    orderId: objectId,
  })
  .strict();

/*
 * Client-side payment verification input. The signature is checked
 * server-side against the stored gateway order id, so a client can
 * never claim a payment for an order it did not pay.
 */
export const verifyPaymentSchema = z
  .object({
    paymentId: z
      .string()
      .trim()
      .min(1, "paymentId is required"),
    signature: z
      .string()
      .trim()
      .min(1, "signature is required"),
  })
  .strict();

export type PaymentOrderIdParams =
  z.infer<typeof paymentOrderIdParamsSchema>;
export type VerifyPaymentInput =
  z.infer<typeof verifyPaymentSchema>;
