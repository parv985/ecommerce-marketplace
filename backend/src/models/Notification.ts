import { Schema, model, type Types } from "mongoose";

import { NotificationType } from "../constants/notificationTypes.js";

/*
 * Delivery status of the email copy of this notification. In-app
 * notifications are always persisted first; the email is a mirror of
 * the same record, so its delivery state lives here:
 * - NOT_REQUIRED:    no email was due (channel/preference/recipient rules).
 * - PENDING:         email dispatch started (or about to start). Doubles as
 *                    the "in flight" claim a retry takes before resending.
 * - SENT:            handed to the SMTP transport successfully.
 * - FAILED:          every attempt failed - the in-app record survives and
 *                    the notification stays eligible for an email retry.
 * - INVALID_ADDRESS: the recipient has no deliverable address on file, so no
 *                    attempt was made. Terminal: retrying cannot fix a
 *                    missing/invalid address, it only wastes transport quota.
 */
export enum NotificationEmailStatus {
  NOT_REQUIRED = "NOT_REQUIRED",
  PENDING = "PENDING",
  SENT = "SENT",
  FAILED = "FAILED",
  INVALID_ADDRESS = "INVALID_ADDRESS",
}

/*
 * How many email dispatch rounds one notification may go through before
 * the retry endpoint stops offering it. Each round already contains the
 * transport-level retries of sendNotificationEmail, so ten rounds is far
 * more than a healthy relay needs while still bounding a misconfigured
 * SMTP setup from retrying the same record forever.
 */
export const MAX_EMAIL_DISPATCH_ROUNDS = 10;

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
  /*
   * Email observability, written by the delivery worker only. `emailAttempts`
   * counts dispatch rounds (a round = one sendNotificationEmail call with its
   * internal retries) and doubles as the retry budget guard; `emailError`
   * keeps the last failure reason (truncated, never the SMTP credentials) so
   * an operator can tell a relay outage from a bad address.
   */
  emailAttempts: number;
  emailError?: string | null;
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

    emailAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    /*
     * Last email failure reason (truncated). Deliberately free-form and
     * never surfaced through the public notification payload: it is an
     * operator-facing log, not user content.
     */
    emailError: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
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
 * Scan used by the email retry path (failed deliveries, oldest first).
 * Partial so the vast majority of documents (SENT / NOT_REQUIRED) never
 * enter the index.
 */
notificationSchema.index(
  { emailStatus: 1, createdAt: 1 },
  {
    partialFilterExpression: {
      emailStatus: NotificationEmailStatus.FAILED,
    },
  },
);

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
