import {
  Schema,
  model,
  type Types,
} from "mongoose";

import { OrderStatus } from "../constants/orderStatus.js";

export interface IOrderTimelineEntry {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  status: OrderStatus;
  actorId: string;
  actorRole: string;
  reason?: string;
  createdAt: Date;
}

const orderTimelineSchema =
  new Schema<IOrderTimelineEntry>(
    {
      orderId: {
        type: Schema.Types.ObjectId,
        ref: "Order",
        required: true,
        index: true,
      },

      status: {
        type: String,
        enum: Object.values(OrderStatus),
        required: true,
      },

      actorId: {
        type: String,
        required: true,
      },

      actorRole: {
        type: String,
        required: true,
      },

      reason: {
        type: String,
        trim: true,
        maxlength: 500,
        default: null,
      },
    },
    {
      timestamps: { createdAt: true, updatedAt: false },
    },
  );

orderTimelineSchema.index({
  orderId: 1,
  createdAt: 1,
});

export const OrderTimeline = model<
  IOrderTimelineEntry
>("OrderTimeline", orderTimelineSchema);
