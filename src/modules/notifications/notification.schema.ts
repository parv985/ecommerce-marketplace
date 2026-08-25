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

export type ListNotificationsQuery =
  z.infer<typeof listNotificationsQuerySchema>;
export type UpdatePreferencesInput =
  z.infer<typeof updatePreferencesSchema>;
export type AdminBroadcastInput =
  z.infer<typeof adminBroadcastSchema>;
