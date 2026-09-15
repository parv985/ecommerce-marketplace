import { Schema, model, type Types } from "mongoose";

import { NotificationType } from "../constants/notificationTypes.js";

export interface INotification {
  _id: Types.ObjectId;
  recipientId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: Types.ObjectId | null;
  isRead: boolean;
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

export const Notification = model<INotification>(
  "Notification",
  notificationSchema,
);
