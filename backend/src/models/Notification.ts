import { Schema, model, type Types } from "mongoose";

import { NotificationType } from "../constants/notificationTypes.js";

/*
 * Delivery status of the email copy of this notification. In-app
 * notifications are always persisted first; the email is a mirror of
 * the same record, so its delivery state lives here:
 * - NOT_REQUIRED: no email was due (channel/preference/recipient rules).
 * - PENDING:      email dispatch started (or about to start).
 * - SENT:         handed to the SMTP transport successfully.
 * - FAILED:       every attempt failed - the in-app record survives.
 */
export enum NotificationEmailStatus {
  NOT_REQUIRED = "NOT_REQUIRED",
  PENDING = "PENDING",
  SENT = "SENT",
  FAILED = "FAILED",
}

export interface INotification {
  _id: Types.ObjectId;
  recipientId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: Types.ObjectId | null;
  isRead: boolean;
  /*
   * Idempotency key for event-driven notifications (e.g.
   * "order:<id>:status:SHIPPED"). When present it is unique across the
   * collection, so a re-fired event can never create a second
   * notification - or a second email.
   */
  dedupeKey?: string;
  emailStatus: NotificationEmailStatus;
  emailSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    entityType: {
      type: String,
      trim: true,
      maxlength: 50,
      default: null,
    },

    entityId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    dedupeKey: {
      type: String,
    },

    emailStatus: {
      type: String,
      enum: Object.values(NotificationEmailStatus),
      default: NotificationEmailStatus.NOT_REQUIRED,
    },

    emailSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

notificationSchema.index({
  recipientId: 1,
  isRead: 1,
  createdAt: -1,
});

/*
 * Duplicate-email prevention: a dedupeKey identifies one business
 * event (order X shipped, return Y refunded, ...). The unique partial
 * index guarantees at most one notification - and therefore at most
 * one email - per event, even if the event is re-fired concurrently
 * (double-clicked seller action, webhook replay, retry after a
 * timeout). Partial so documents without a key (seller/admin custom
 * messages) are unconstrained.
 */
notificationSchema.index(
  { dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: "string" } },
  },
);

export const Notification = model<INotification>(
  "Notification",
  notificationSchema,
);
