import { Schema, model, type Types } from "mongoose";

export interface INotificationPreference {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /* Email channels. */
  emailOrderUpdates: boolean;
  emailPaymentUpdates: boolean;
  emailPromotional: boolean;
  /* In-app notifications. */
  inApp: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationPreferenceSchema =
  new Schema<INotificationPreference>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
      },

      emailOrderUpdates: {
        type: Boolean,
        default: true,
      },

      emailPaymentUpdates: {
        type: Boolean,
        default: true,
      },

      emailPromotional: {
        type: Boolean,
        default: true,
      },

      inApp: {
        type: Boolean,
        default: true,
      },
    },
    {
      timestamps: true,
    },
  );

export const NotificationPreference =
  model<INotificationPreference>(
    "NotificationPreference",
    notificationPreferenceSchema,
  );
