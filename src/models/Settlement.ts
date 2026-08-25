import {
  Schema,
  model,
  type Types,
} from "mongoose";

import { SettlementStatus } from "../constants/settlementStatus.js";

export interface ISettlementOrder {
  orderId: Types.ObjectId;
  orderNumber: string;
  total: number;
  /* Commission rate snapshot - never recalculated from current config. */
  commissionRate: number;
  commissionAmount: number;
  sellerPayable: number;
  deliveredAt: Date;
}

export interface ISettlement {
  _id: Types.ObjectId;
  sellerId: Types.ObjectId;
  /* "YYYY-MM" - the month whose orders this settlement covers. */
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  status: SettlementStatus;
  orders: ISettlementOrder[];
  totalSales: number;
  totalCommission: number;
  totalPayable: number;
  /* Platform commission rate snapshot used for this settlement. */
  commissionRate: number;
  paidAt?: Date | null;
  reminderSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const settlementOrderSchema =
  new Schema<ISettlementOrder>(
    {
      orderId: {
        type: Schema.Types.ObjectId,
        ref: "Order",
        required: true,
      },

      orderNumber: {
        type: String,
        required: true,
      },

      total: {
        type: Number,
        required: true,
        min: 0,
      },

      commissionRate: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },

      commissionAmount: {
        type: Number,
        required: true,
        min: 0,
      },

      sellerPayable: {
        type: Number,
        required: true,
        min: 0,
      },

      deliveredAt: {
        type: Date,
        required: true,
      },
    },
    {
      _id: false,
    },
  );

const settlementSchema = new Schema<ISettlement>(
  {
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    periodKey: {
      type: String,
      required: true,
    },

    periodStart: {
      type: Date,
      required: true,
    },

    periodEnd: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(SettlementStatus),
      default: SettlementStatus.PENDING,
      index: true,
    },

    orders: {
      type: [settlementOrderSchema],
      default: [],
    },

    totalSales: {
      type: Number,
      required: true,
      min: 0,
    },

    totalCommission: {
      type: Number,
      required: true,
      min: 0,
    },

    totalPayable: {
      type: Number,
      required: true,
      min: 0,
    },

    commissionRate: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    reminderSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

/*
 * One settlement per seller per period - the uniqueness constraint
 * makes generation idempotent even under concurrent requests.
 */
settlementSchema.index(
  { sellerId: 1, periodKey: 1 },
  { unique: true },
);

settlementSchema.index({
  status: 1,
  periodKey: 1,
});

export const Settlement = model<ISettlement>(
  "Settlement",
  settlementSchema,
);
