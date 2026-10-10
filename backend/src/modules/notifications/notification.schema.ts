import { z } from "zod";

import { NotificationChannel } from "../../constants/notificationTypes.js";

const objectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ObjectId",
  );
export const listNotificationsQuerySchema = z
  .object({
    unread: z
      .enum(["true", "false"])
      .optional(),
    page: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20),
  })
  .strict();

export const notificationIdParamsSchema = z
  .object({
    id: objectId,
  })
  .strict();

export const updatePreferencesSchema = z
  .object({
    emailOrderUpdates: z.boolean().optional(),
    emailPaymentUpdates: z.boolean().optional(),
    emailPromotional: z.boolean().optional(),
    inApp: z.boolean().optional(),
  })
  .strict();

export const adminBroadcastSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title cannot exceed 200 characters"),
    message: z
      .string()
      .trim()
      .min(5, "Message must be at least 5 characters")
      .max(2000, "Message cannot exceed 2000 characters"),
    channel: z
      .nativeEnum(NotificationChannel)
      .optional()
      .default(NotificationChannel.BOTH),
    recipientIds: z
      .array(objectId)
      .max(500, "At most 500 explicit recipients")
      .optional(),
    audience: z
      .enum(["SELLERS", "USERS"])
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.recipientIds && value.audience) {
      ctx.addIssue({
        code: "custom",
        path: ["recipientIds"],
        message:
          "Provide either recipientIds or audience, not both",
      });
    }

    if (!value.recipientIds && !value.audience) {
      ctx.addIssue({
        code: "custom",
        path: ["audience"],
        message:
          "Either recipientIds or audience is required",
      });
    }
  });

/*
 * Seller-sent custom notification. The target is exactly one of:
 * - `buyerIds`: the buyers picked in the Seller Customers broadcast
 *   multi-select (one, several, or every buyer the seller lists).
 * - `buyerId`: a single buyer, kept as the legacy/point-to-point form.
 * - `audience: "ALL_BUYERS"`: every registered buyer in the marketplace.
 *
 * `requestId` is an optional client-generated idempotency token. The
 * frontend stamps one per compose-dialog submission, so re-sending the
 * same broadcast after a timeout or a double click resolves to the
 * already-delivered notifications instead of messaging every buyer twice.
 */
export const sellerNotificationSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title cannot exceed 200 characters"),
    message: z
      .string()
      .trim()
      .min(5, "Message must be at least 5 characters")
      .max(2000, "Message cannot exceed 2000 characters"),
    channel: z
      .nativeEnum(NotificationChannel)
      .optional()
      .default(NotificationChannel.BOTH),
    buyerId: objectId.optional(),
    buyerIds: z
      .array(objectId)
      .min(1, "Select at least one buyer")
      /*
       * Same ceiling as the admin broadcast, and it keeps a single
       * request's fan-out (and its SMTP load) bounded.
       */
      .max(500, "At most 500 buyers per notification")
      .optional(),
    audience: z.enum(["ALL_BUYERS"]).optional(),
    requestId: z
      .string()
      .trim()
      .min(8, "requestId is too short")
      .max(64, "requestId is too long")
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const targets = [
      value.buyerId !== undefined,
      value.buyerIds !== undefined,
      value.audience !== undefined,
    ].filter(Boolean).length;

    if (targets > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["buyerIds"],
        message:
          "Provide exactly one target: buyerIds, buyerId or audience",
      });
    }

    if (targets === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["buyerIds"],
        message:
          "Select at least one buyer (or set audience to ALL_BUYERS)",
      });
    }
  });

/*
 * Manual retry of the email copies that failed for already-persisted
 * notifications (admin only). The limit bounds one request's work; the
 * remaining backlog is picked up by the next call.
 */
export const retryFailedEmailsSchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(25),
  })
  .strict();

export type ListNotificationsQuery =
  z.infer<typeof listNotificationsQuerySchema>;
export type UpdatePreferencesInput =
  z.infer<typeof updatePreferencesSchema>;
export type AdminBroadcastInput =
  z.infer<typeof adminBroadcastSchema>;
export type SellerNotificationInput =
  z.infer<typeof sellerNotificationSchema>;
export type RetryFailedEmailsInput =
  z.infer<typeof retryFailedEmailsSchema>;
